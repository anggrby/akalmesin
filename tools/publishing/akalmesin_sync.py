#!/usr/bin/env python3
"""Akal Mesin Postiz -> Notion state sync.

Read-only by default. --apply updates Status, Info and Publish date on matching,
non-final Notion rows. Postiz is read-only throughout (GET requests only).

The deployment timer passes --apply every five minutes. A second lock prevents
overlapping runs. Duplicate deliveries/polls are no-ops because current Notion
values are compared before PATCH. Published and Archived are terminal and protected.
"""

from __future__ import annotations

import argparse
import fcntl
import json
import os
import re
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

NOTION_DB = "405f909f-26a5-8057-ad0a-e9562fe9c915"
NOTION_VERSION = "2022-06-28"  # database/page API; property setup used 2025-09-03.
POSTIZ_BASE = "https://167-104-102-132.sslip.io/api/public/v1"
AKAL_MESIN_ID = "cmvpfx9sm0009po858rtcbrh6"
WIB = timezone(timedelta(hours=7), name="WIB")
UTC = timezone.utc
MATCH_WINDOW = timedelta(minutes=5)  # Existing check.py matching behaviour.
LOOKBACK_DAYS = 30
LOOKAHEAD_DAYS = 30
FINAL_STATUSES = {"Published", "Archived"}
TERMINAL_POST_STATES = {"PUBLISHED", "ERROR"}


def http_json(url: str, *, method: str = "GET", headers: dict[str, str] | None = None,
              body: dict[str, Any] | None = None, timeout: int = 40) -> Any:
    data = None if body is None else json.dumps(body, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(url, data=data, method=method)
    for key, value in (headers or {}).items():
        req.add_header(key, value)
    if data is not None:
        req.add_header("Content-Type", "application/json; charset=utf-8")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            raw = response.read()
            return json.loads(raw.decode("utf-8")) if raw else None
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:400]
        raise RuntimeError(f"HTTP {exc.code} {method} {url}: {detail}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Network error {method} {url}: {exc.reason}") from exc


def strip_html(value: str) -> str:
    import html
    value = re.sub(r"<br\s*/?>", "\n", value, flags=re.I)
    value = re.sub(r"</p\s*>", "\n", value, flags=re.I)
    value = re.sub(r"<[^>]+>", "", value)
    return re.sub(r"\s+", " ", html.unescape(value)).strip()


def caption_key(value: str) -> str:
    value = strip_html(value).lower()
    value = re.sub(r"[^\w\s]", "", value, flags=re.UNICODE)
    return re.sub(r"\s+", " ", value).strip()[:48]


def parse_time(value: str) -> datetime:
    if value.endswith("Z"):
        value = value[:-1] + "+00:00"
    result = datetime.fromisoformat(value)
    if result.tzinfo is None:
        result = result.replace(tzinfo=WIB)
    return result.astimezone(UTC)


def format_wib(value: datetime) -> str:
    return value.astimezone(WIB).strftime("%Y-%m-%d %H:%M WIB")


@dataclass(frozen=True)
class Candidate:
    integration: str
    caption: str
    when: datetime
    state: str = ""
    post_id: str = ""
    error: str = ""


@dataclass(frozen=True)
class RowRef:
    page_id: str
    caption: str
    title: str
    when: datetime


def row_from_page(page: dict[str, Any]) -> RowRef | None:
    properties = page.get("properties") or {}
    raw_date = ((properties.get("Publish date") or {}).get("date") or {}).get("start")
    if not raw_date:
        return None
    rich = (properties.get("Caption") or {}).get("rich_text") or []
    caption = "".join(part.get("plain_text", "") for part in rich)
    title_parts = (properties.get("Post") or {}).get("title") or []
    title = "".join(part.get("plain_text", "") for part in title_parts)
    return RowRef(page["id"], caption or title, title, parse_time(raw_date))


def normalized_caption(value: str) -> str:
    """Normalized caption with characters and meaningful spacing retained."""
    return strip_html(value).casefold()


def caption_match(row: RowRef, post: Candidate) -> bool:
    """Exact normalized caption preferred for unique matches; date is separate."""
    target, candidate = normalized_caption(row.caption), normalized_caption(post.caption)
    if not target or not candidate:
        return False
    nk, pk = caption_key(target), caption_key(candidate)
    return target == candidate or nk.startswith(pk[:24]) or pk.startswith(nk[:24])


def unique_match(row: RowRef, posts: list[Candidate]) -> Candidate | None:
    """Caption first; time breaks ties only. Unknown captions use time+prefix."""
    if any(p.integration != AKAL_MESIN_ID for p in posts):
        raise RuntimeError("Unsafe input: another Postiz channel was supplied; no update")
    captioned = [p for p in posts if caption_match(row, p)]
    if len(captioned) > 1:
        # Within the same caption, prefer the exact text over a legacy prefix.
        exact = [p for p in captioned
                 if normalized_caption(p.caption) == normalized_caption(row.caption)]
        captioned = exact or captioned
    if len(captioned) == 1:
        return captioned[0]
    if len(captioned) > 1:
        found = sorted([p for p in captioned if abs(p.when - row.when) <= MATCH_WINDOW],
                       key=lambda p: abs(p.when - row.when))
    elif not normalized_caption(row.caption):
        # No useful caption: preserve the existing time matching fallback.
        found = sorted([p for p in posts if abs(p.when - row.when) <= MATCH_WINDOW],
                       key=lambda p: abs(p.when - row.when))
    else:
        found = sorted([p for p in posts if abs(p.when - row.when) <= MATCH_WINDOW
                        and caption_key(row.caption) and caption_key(p.caption)
                        and (caption_key(row.caption).startswith(caption_key(p.caption)[:24])
                             or caption_key(p.caption).startswith(caption_key(row.caption)[:24]))],
                       key=lambda p: abs(p.when - row.when))
    if len(found) > 1:
        raise RuntimeError(f"Ambiguous Postiz match for {row.title!r}: "
                           + ", ".join(p.post_id for p in found))
    return found[0] if found else None

class Notion:
    def __init__(self, token: str):
        self.headers = {"Authorization": "Bearer " + token, "Notion-Version": NOTION_VERSION}

    def get_page(self, page_id: str) -> dict[str, Any]:
        return http_json(f"https://api.notion.com/v1/pages/{page_id}", headers=self.headers)

    def query_dated(self) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        cursor: str | None = None
        while True:
            body: dict[str, Any] = {
                "page_size": 100,
                "filter": {"property": "Publish date", "date": {"is_not_empty": True}},
            }
            if cursor:
                body["start_cursor"] = cursor
            result = http_json(f"https://api.notion.com/v1/databases/{NOTION_DB}/query",
                               method="POST", headers=self.headers, body=body)
            rows.extend(result.get("results") or [])
            if not result.get("has_more"):
                return rows
            cursor = result.get("next_cursor")
            if not cursor:
                raise RuntimeError("Notion pagination ended without next_cursor")

    def patch(self, page_id: str, properties: dict[str, Any]) -> None:
        http_json(f"https://api.notion.com/v1/pages/{page_id}", method="PATCH",
                  headers=self.headers, body={"properties": properties})


def fetch_postiz(api_key: str, start: datetime, end: datetime) -> list[Candidate]:
    dates = (f"startDate={start.strftime('%Y-%m-%dT%H:%M:%S.000Z')}"
             f"&endDate={end.strftime('%Y-%m-%dT%H:%M:%S.000Z')}")
    result = http_json(POSTIZ_BASE + "/posts?" + dates, headers={"Authorization": api_key})
    posts = result.get("posts") if isinstance(result, dict) else result
    if not isinstance(posts, list):
        raise RuntimeError("Unexpected Postiz response; no updates attempted")
    found: list[Candidate] = []
    for post in posts:
        integration = (post.get("integration") or {}).get("id")
        if integration != AKAL_MESIN_ID:
            continue
        if post.get("state") not in {"PUBLISHED", "ERROR", "QUEUE"}:
            continue
        found.append(Candidate(AKAL_MESIN_ID, post.get("content") or "",
                               parse_time(post["publishDate"]), state=post["state"],
                               post_id=post.get("id", ""),
                               error=post.get("error") or ""))
    return found


def desired_update(page: dict[str, Any], post: Candidate) -> dict[str, Any] | None:
    if page.get("archived") or page.get("in_trash"):
        return None
    properties = page.get("properties") or {}
    current = ((properties.get("Status") or {}).get("status") or {}).get("name")
    if current in FINAL_STATUSES:
        return None
    validate_candidate(post)
    info_property = (properties.get("Info") or {})
    if info_property.get("type") != "rich_text":
        raise RuntimeError("Notion property 'Info' is missing or not rich_text")
    old_info = "".join(p.get("plain_text", "") for p in info_property.get("rich_text") or [])
    if post.state == "PUBLISHED":
        target, info = "Published", ""
    elif post.state == "ERROR":
        target = "Error"
        detail = post.error.strip() or "No error reason was returned by Postiz"
        info = f"Postiz: {detail}"[:2000]
    elif post.state == "QUEUE":
        # A date move must sync before publishing, without flipping status.
        target, info = current, None
    else:
        raise ValueError("Unsupported Postiz state")
    update: dict[str, Any] = {}
    if current != target:
        update["Status"] = {"status": {"name": target}}
    if info is not None and old_info != info:
        update["Info"] = {"rich_text": [] if not info else [{"type": "text", "text": {"content": info}}]}
    row = row_from_page(page)
    if row and abs(row.when - post.when).total_seconds() >= 60:
        update["Publish date"] = {"date": {"start": post.when.astimezone(WIB).isoformat()}}
    return update or None


def validate_candidate(post: Candidate) -> None:
    # Also guards the pure update function, not only the fetch/match path.
    if post.integration != AKAL_MESIN_ID:
        raise ValueError("Refusing to map a non-Akal Mesin Postiz integration")
    if post.state not in {"PUBLISHED", "ERROR", "QUEUE"}:
        raise ValueError("Refusing an unsupported Postiz state")


class Sync:
    def __init__(self, api_key: str, notion: Notion, apply: bool = False):
        self.api_key, self.notion, self.apply = api_key, notion, apply

    def postiz(self) -> list[Candidate]:
        now = datetime.now(UTC)
        return fetch_postiz(self.api_key, now - timedelta(days=LOOKBACK_DAYS),
                            now + timedelta(days=LOOKAHEAD_DAYS))

    def reconcile(self, pages: list[dict[str, Any]], posts: list[Candidate]) -> dict[str, int]:
        counts = {"changed": 0, "unchanged": 0, "protected": 0, "waiting": 0, "failed": 0}
        for page in pages:
            row = row_from_page(page)
            current = ((page.get("properties", {}).get("Status", {}).get("status") or {}).get("name"))
            if row is None:
                continue
            if page.get("archived") or page.get("in_trash") or current in FINAL_STATUSES:
                counts["protected"] += 1
                try:
                    protected_post = unique_match(row, posts)
                except RuntimeError:
                    protected_post = None
                if protected_post and protected_post.state == "ERROR":
                    print(f"PROTECTED {row.title!r}: {current}/trash preserved despite Postiz ERROR")
                continue
            try:
                post = unique_match(row, posts)
            except Exception as exc:
                print(f"SKIP {row.title!r}: {exc}", file=sys.stderr)
                counts["failed"] += 1
                continue
            if post is None:
                counts["waiting"] += 1
                continue
            try:
                update = desired_update(page, post)
                if not update:
                    counts["unchanged"] += 1
                    continue
                action = "APPLY" if self.apply else "WOULD UPDATE"
                print(f"{action} {row.title!r} ({format_wib(row.when)}): "
                      f"{current!r} -> {post.state}; postiz_id={post.post_id}")
                if self.apply:
                    # Re-read immediately before PATCH so a concurrent manual
                    # Published/Archived decision is not overwritten.
                    fresh = self.notion.get_page(row.page_id)
                    fresh_update = desired_update(fresh, post)
                    if fresh_update is None:
                        counts["protected"] += 1
                        print(f"PROTECTED {row.title!r}: status changed or already synced")
                        continue
                    if fresh_update != update:
                        raise RuntimeError(f"{row.title!r} changed during sync; no update, retry next poll")
                    self.notion.patch(row.page_id, update)
                    check = self.notion.get_page(row.page_id)
                    if desired_update(check, post) is not None:
                        raise RuntimeError(f"Verification failed for {row.title!r}")
                counts["changed"] += 1
            except Exception as exc:
                print(f"ERROR syncing {row.title!r} ({row.page_id}): {exc}", file=sys.stderr)
                counts["failed"] += 1
        return counts


def run_once(apply: bool) -> int:
    api_key = os.environ.get("POSTIZ_SELFHOST_API_KEY", "").strip()
    token = os.environ.get("NOTION_TOKEN", "").strip()
    if not api_key or not token:
        print("POSTIZ_SELFHOST_API_KEY and NOTION_TOKEN must be set", file=sys.stderr)
        return 2
    sync = Sync(api_key, Notion(token), apply=apply)
    print(f"Akal Mesin status sync @ {format_wib(datetime.now(UTC))}; mode={'APPLY' if apply else 'DRY-RUN'}")
    try:
        posts = sync.postiz()
        counts = sync.reconcile(sync.notion.query_dated(), posts)
    except Exception as exc:
        print(f"SYNC FAILED: {exc}", file=sys.stderr)
        return 1
    print("SUMMARY " + json.dumps(counts, sort_keys=True))
    return 1 if counts["failed"] else 0


def self_test() -> None:
    when = datetime(2026, 11, 6, 13, 0, tzinfo=WIB).astimezone(UTC)
    text = "A caption, with punctuation." + chr(10) * 2 + "Second part."
    row = RowRef("123", text, "Example", when)
    page = {"id":"123", "properties":{
        "Status":{"status":{"name":"Scheduled"}},
        "Info":{"type":"rich_text", "rich_text":[]},
        "Caption":{"rich_text":[{"plain_text":text}]},
        "Post":{"title":[{"plain_text":"Example"}]},
        "Publish date":{"date":{"start":"2026-11-06T13:00:00+07:00"}}}}
    error = Candidate(AKAL_MESIN_ID,"<p>A caption, with punctuation.</p><p></p><p>Second part.</p>",when + timedelta(minutes=10),"ERROR","post1","Example error")
    assert unique_match(row,[error]) == error
    moved = Candidate(AKAL_MESIN_ID,text,when+timedelta(hours=2),"QUEUE","queue1","")
    assert unique_match(row,[moved]) == moved
    assert desired_update(page,moved) == {"Publish date":{"date":{"start":"2026-11-06T15:00:00+07:00"}}}
    wanted = desired_update(page,error)
    assert wanted["Status"] == {"status":{"name":"Error"}}
    assert wanted["Info"]["rich_text"][0]["text"]["content"] == "Postiz: Example error"
    assert wanted["Publish date"]["date"]["start"].endswith("+07:00")
    current = {**page,"properties":{**page["properties"],"Status":{"status":{"name":"Error"}},
        "Publish date":{"date":{"start":error.when.astimezone(WIB).isoformat()}},
        "Info":{"type":"rich_text","rich_text":[{"plain_text":"Postiz: Example error"}]}}}
    assert desired_update(current,error) is None
    published=Candidate(AKAL_MESIN_ID,text,error.when,"PUBLISHED","post2","")
    assert desired_update(current,published) == {"Status":{"status":{"name":"Published"}},"Info":{"rich_text":[]}}
    other_date=Candidate(AKAL_MESIN_ID,text,when+timedelta(hours=2),"ERROR","other")
    assert unique_match(row,[other_date,moved]) is None  # off-time ambiguous captions must not guess
    duplicate_after_move = when + timedelta(hours=2)
    try:
        unique_match(RowRef("fallback-row",text,"Example",duplicate_after_move),[other_date,moved])
        raise AssertionError("Identical captions at the identical date must fail")
    except RuntimeError:
        pass
    distinct = Candidate(AKAL_MESIN_ID,"Different caption",duplicate_after_move,"QUEUE","distinct")
    assert unique_match(RowRef("fallback-row",text,"Example",duplicate_after_move),[other_date,distinct]) == other_date
    fallback_row = RowRef("fallback",text + " extra trailing content","Example",when)
    same_time=Candidate(AKAL_MESIN_ID,"Completely unrelated caption",when,"QUEUE","same-time")
    assert unique_match(fallback_row,[error,same_time]) == error
    assert unique_match(RowRef("blank","","Blank",moved.when),[moved]) == moved
    foreign=Candidate("another-channel",text,when,"PUBLISHED","other","")
    try:
        unique_match(row,[foreign]); raise AssertionError("Wrong channel matched")
    except RuntimeError:
        pass
    try:
        desired_update(page,foreign); raise AssertionError("Wrong channel mapped")
    except ValueError:
        pass
    for status in ("Published","Archived"):
        protected={**page,"properties":{**page["properties"],"Status":{"status":{"name":status}}}}
        assert desired_update(protected,error) is None
        assert Sync("unused",Notion("unused")).reconcile([protected],[error])["protected"] == 1
    assert desired_update({"in_trash":True,**page},error) is None
    class MemoryNotion(Notion):
        def __init__(self): self.headers={}; self.patched=[]
        def get_page(self,page_id): return page
        def patch(self,page_id,properties):
            self.patched.append((page_id,properties))
            page["properties"].update(properties)
            if "Info" in properties:
                texts = properties["Info"]["rich_text"]
                page["properties"]["Info"]={"type":"rich_text","rich_text":[{"plain_text":p["text"]["content"]} for p in texts]}
    connector=MemoryNotion()
    result=Sync("unused",connector,apply=True).reconcile([page],[error])
    assert result["changed"] == 1 and len(connector.patched) == 1, (result, connector.patched)
    assert connector.patched[0][1]["Publish date"]["date"]["start"].endswith("+07:00")
    print("Self-test OK: moved-date caption matching, fallback, QUEUE date sync, terminal protection, ERROR mapping, idempotency")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Patch matching non-final Notion rows (default dry-run)")
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--lock-file", default="/tmp/akalmesin-status-sync.lock")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return 0
    lock_path = Path(args.lock_file)
    with lock_path.open("a+") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print("Another sync is running; this invocation skipped", file=sys.stderr)
            return 1
        return run_once(args.apply)


if __name__ == "__main__":
    sys.exit(main())
