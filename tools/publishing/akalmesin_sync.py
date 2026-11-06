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
from zoneinfo import ZoneInfo
from pathlib import Path
from typing import Any

NOTION_DB = "405f909f-26a5-8057-ad0a-e9562fe9c915"
NOTION_VERSION = "2022-06-28"  # database/page API; property setup used 2025-09-03.
POSTIZ_BASE = os.environ.get("POSTIZ_API_URL", "").rstrip("/")
AKAL_MESIN_ID = "cmvpfx9sm0009po858rtcbrh6"
WIB = ZoneInfo("Asia/Jakarta")
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
    return re.sub(r"\s+", " ", value).strip()


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
    postiz_id: str = ""


def row_from_page(page: dict[str, Any]) -> RowRef | None:
    properties = page.get("properties") or {}
    raw_date = ((properties.get("Publish date") or {}).get("date") or {}).get("start")
    if not raw_date:
        return None
    rich = (properties.get("Caption") or {}).get("rich_text") or []
    caption = "".join(part.get("plain_text", "") for part in rich)
    title_parts = (properties.get("Post") or {}).get("title") or []
    title = "".join(part.get("plain_text", "") for part in title_parts)
    stored = "".join(part.get("plain_text", "")
                     for part in ((properties.get("Postiz ID") or {}).get("rich_text") or [])).strip()
    return RowRef(page["id"], caption or title, title, parse_time(raw_date), stored)


def normalized_caption(value: str) -> str:
    """Normalized caption with characters and meaningful spacing retained."""
    return re.sub(r"\s+", " ", strip_html(value)).strip().casefold()


def caption_match(row: RowRef, post: Candidate) -> bool:
    """Only the entire normalized caption establishes identity."""
    target, candidate = normalized_caption(row.caption), normalized_caption(post.caption)
    return bool(target) and target == candidate


class AmbiguousMatch(RuntimeError):
    pass


def unique_match(row: RowRef, posts: list[Candidate], *, allow_id_fallback: bool = False) -> Candidate | None:
    """Stored Postiz ID first; then only a unique full normalized caption."""
    if any(p.integration != AKAL_MESIN_ID for p in posts):
        raise RuntimeError("Unsafe input: another Postiz channel was supplied; no update")
    if row.postiz_id:
        found = [p for p in posts if p.post_id == row.postiz_id]
        if len(found) > 1:
            raise AmbiguousMatch(f"Duplicate Postiz ID {row.postiz_id!r}")
        if found:
            return found[0]
        if not allow_id_fallback:
            return None
    captioned = [p for p in posts if caption_match(row, p)]
    if len(captioned) == 1:
        return captioned[0]
    if len(captioned) > 1:
        found = sorted([p for p in captioned if abs(p.when - row.when) <= MATCH_WINDOW],
                       key=lambda p: abs(p.when - row.when))
    else:
        found = []
    if len(found) > 1:
        raise AmbiguousMatch(f"Ambiguous Postiz match for {row.title!r}: "
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

    def ensure_postiz_id_property(self) -> None:
        schema = http_json(f"https://api.notion.com/v1/databases/{NOTION_DB}", headers=self.headers)
        current = (schema.get("properties") or {}).get("Postiz ID")
        if current is not None and current.get("type") != "rich_text":
            raise RuntimeError("Notion property 'Postiz ID' is not rich_text")
        if current is None:
            http_json(f"https://api.notion.com/v1/databases/{NOTION_DB}", method="PATCH",
                      headers=self.headers,
                      body={"properties": {"Postiz ID": {"rich_text": {}}}})

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
    old_id = "".join(p.get("plain_text", "")
                      for p in ((properties.get("Postiz ID") or {}).get("rich_text") or []))
    if old_id != post.post_id:
        update["Postiz ID"] = {"rich_text": [{"type": "text", "text": {"content": post.post_id}}]}
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

    def reconcile(self, pages: list[dict[str, Any]], posts: list[Candidate], *, backfill_ids: bool = False) -> dict[str, int]:
        counts = {"changed": 0, "unchanged": 0, "protected": 0, "waiting": 0, "failed": 0}
        for page in pages:
            row = row_from_page(page)
            current = ((page.get("properties", {}).get("Status", {}).get("status") or {}).get("name"))
            if row is None:
                continue
            protected = page.get("archived") or page.get("in_trash") or current in FINAL_STATUSES
            try:
                # Protected rows can gain an ID only during an explicit backfill;
                # normal polling remains strictly immutable for them.
                post = unique_match(row, posts, allow_id_fallback=backfill_ids)
            except AmbiguousMatch as exc:
                print(f"SKIP {row.title!r}: {exc}", file=sys.stderr)
                counts["failed"] += 1
                continue
            if protected and not (backfill_ids and post and not row.postiz_id):
                counts["protected"] += 1
                if post and post.state == "ERROR":
                    print(f"PROTECTED {row.title!r}: {current}/trash preserved despite Postiz ERROR")
                continue
            try:
                if post is None:
                    if backfill_ids:
                        counts["unchanged"] += 1
                    else:
                        counts["waiting"] += 1
                    continue
                if row.postiz_id and post.post_id != row.postiz_id:
                    raise RuntimeError("stored Postiz ID does not match caption candidate; no update")
                if backfill_ids:
                    update = None if row.postiz_id else {"Postiz ID": {"rich_text": [{"type": "text", "text": {"content": post.post_id}}]}}
                else:
                    update = desired_update(page, post)
                if not update:
                    counts["unchanged"] += 1
                    continue
                action = "APPLY" if self.apply else "WOULD UPDATE"
                print(f"{action} {row.title!r} ({format_wib(row.when)}): "
                      f"{current!r} -> {post.state}; postiz_id={post.post_id}; fields={sorted(update)}")
                if self.apply:
                    # Re-read: Published/Archived and concurrent ID writes are never overwritten.
                    fresh = self.notion.get_page(row.page_id)
                    fresh_row = row_from_page(fresh)
                    if fresh_row is None:
                        raise RuntimeError(f"{row.title!r} Publish date disappeared; no update")
                    if backfill_ids:
                        fresh_status = ((fresh.get("properties", {}).get("Status", {}).get("status") or {}).get("name"))
                        fresh_protected = fresh.get("archived") or fresh.get("in_trash") or fresh_status in FINAL_STATUSES
                        if fresh_protected != protected:
                            raise RuntimeError(f"{row.title!r} protection status changed concurrently; no update")
                        if fresh_row.postiz_id:
                            if fresh_row.postiz_id != post.post_id:
                                raise RuntimeError(f"{row.title!r} Postiz ID changed concurrently; no update")
                            counts["unchanged"] += 1
                            continue
                        fresh_update = update
                    else:
                        fresh_update = desired_update(fresh, post)
                    if not backfill_ids and fresh_update is None:
                        counts["protected"] += 1
                        print(f"PROTECTED {row.title!r}: status changed or already synced")
                        continue
                    if fresh_update != update:
                        raise RuntimeError(f"{row.title!r} changed during sync; no update, retry next poll")
                    self.notion.patch(row.page_id, update)
                    check = self.notion.get_page(row.page_id)
                    check_row = row_from_page(check)
                    if not check_row or check_row.postiz_id != post.post_id:
                        raise RuntimeError(f"Postiz ID verification failed for {row.title!r}")
                    if not backfill_ids and desired_update(check, post) is not None:
                        raise RuntimeError(f"Verification failed for {row.title!r}")
                counts["changed"] += 1
            except Exception as exc:
                print(f"ERROR syncing {row.title!r} ({row.page_id}): {exc}", file=sys.stderr)
                counts["failed"] += 1
        return counts


def run_once(apply: bool, backfill_ids: bool = False) -> int:
    api_key = os.environ.get("POSTIZ_SELFHOST_API_KEY", "").strip()
    token = os.environ.get("NOTION_TOKEN", "").strip()
    if not api_key or not token:
        print("POSTIZ_SELFHOST_API_KEY and NOTION_TOKEN must be set", file=sys.stderr)
        return 2
    if not POSTIZ_BASE:
        print("POSTIZ_API_URL must be set to the self-hosted Postiz public-v1 API URL", file=sys.stderr)
        return 2
    notion = Notion(token)
    if apply:
        notion.ensure_postiz_id_property()
    sync = Sync(api_key, notion, apply=apply)
    print(f"Akal Mesin status sync @ {format_wib(datetime.now(UTC))}; mode={'APPLY' if apply else 'DRY-RUN'}; backfill_ids={backfill_ids}")
    try:
        posts = sync.postiz()
        counts = sync.reconcile(sync.notion.query_dated(), posts, backfill_ids=backfill_ids)
    except Exception as exc:
        print(f"SYNC FAILED: {exc}", file=sys.stderr)
        return 1
    print("SUMMARY " + json.dumps(counts, sort_keys=True))
    return 1 if counts["failed"] else 0

def self_test() -> None:
    when = datetime(2026, 11, 6, 13, 0, tzinfo=WIB).astimezone(UTC)
    words = [f"kata{i}" for i in range(130)]
    text = " ".join(words[:43]) + "\n\n" + " ".join(words[43:86]) + "\n\n" + " ".join(words[86:])
    text += "\n\nSumber: Example / Foto: Example\n\n#akalmesin #AI #teknologi #berita #Indonesia"
    page = {"id":"123", "properties":{
        "Status":{"status":{"name":"Scheduled"}},
        "Info":{"type":"rich_text", "rich_text":[]},
        "Caption":{"rich_text":[{"plain_text":text}]},
        "Postiz ID":{"type":"rich_text", "rich_text":[]},
        "Post":{"title":[{"plain_text":"Example"}]},
        "Publish date":{"date":{"start":"2026-11-06T13:00:00+07:00"}}}}
    row = row_from_page(page)

    html_text = "<p>" + text.replace("\n\n", "</p><p></p><p>") + "</p>"
    error = Candidate(AKAL_MESIN_ID, html_text, when + timedelta(minutes=10), "ERROR", "post1", "Example error")
    assert caption_key(text) == caption_key(html_text) and len(caption_key(text)) > 100
    assert unique_match(row, [error]) == error
    prefix = Candidate(AKAL_MESIN_ID, text[:100] + " another story", when, "ERROR", "wrong")
    assert unique_match(row, [prefix]) is None
    almost = Candidate(AKAL_MESIN_ID, text + " revised", when, "ERROR", "wrong2")
    assert unique_match(row, [almost]) is None

    unrelated = Candidate(AKAL_MESIN_ID, "no caption overlap", when + timedelta(days=2), "QUEUE", "by-id")
    with_id = RowRef(row.page_id, "edited caption stored ID wins", row.title, row.when, "by-id")
    assert unique_match(with_id, [unrelated, error]) == unrelated
    missing = RowRef(row.page_id, row.caption, row.title, row.when, "outside-window")
    assert unique_match(missing, [error]) is None
    assert unique_match(missing, [error], allow_id_fallback=True) == error
    duplicate = Candidate(AKAL_MESIN_ID, text, error.when, "QUEUE", "duplicate")
    assert unique_match(row, [error, duplicate]) is None  # same full caption: moved time decides
    same_time_tie = [
        Candidate(AKAL_MESIN_ID, text, when, "QUEUE", "tie1", ""),
        Candidate(AKAL_MESIN_ID, text, when, "QUEUE", "tie2", ""),
    ]
    try:
        unique_match(row, same_time_tie)
        raise AssertionError("Same full caption and same time must not be guessed")
    except AmbiguousMatch:
        pass
    duplicated_id = Candidate(AKAL_MESIN_ID, "no caption overlap", unrelated.when, "QUEUE", "by-id")
    try:
        unique_match(with_id, [unrelated, duplicated_id])
        raise AssertionError("Duplicate stored Postiz ID must not be guessed")
    except AmbiguousMatch:
        pass


    moved = Candidate(AKAL_MESIN_ID, text, when + timedelta(hours=2), "QUEUE", "queue1", "")
    update = desired_update(page, moved)
    assert update["Publish date"] == {"date":{"start":"2026-11-06T15:00:00+07:00"}}
    assert update["Postiz ID"]["rich_text"][0]["text"]["content"] == "queue1"
    wanted = desired_update(page, error)
    assert wanted["Status"] == {"status":{"name":"Error"}}
    assert wanted["Info"]["rich_text"][0]["text"]["content"] == "Postiz: Example error"
    current = {**page, "properties":{**page["properties"],
        "Postiz ID":{"type":"rich_text", "rich_text":[{"plain_text":"post1"}]},
        "Status":{"status":{"name":"Error"}},
        "Publish date":{"date":{"start":error.when.astimezone(WIB).isoformat()}},
        "Info":{"type":"rich_text", "rich_text":[{"plain_text":"Postiz: Example error"}]}}}
    assert desired_update(current, error) is None
    published = Candidate(AKAL_MESIN_ID, text, error.when, "PUBLISHED", "post1", "")
    assert desired_update(current, published) == {"Status":{"status":{"name":"Published"}}, "Info":{"rich_text":[]}}
    same_time_tie = [
        Candidate(AKAL_MESIN_ID, text, when, "QUEUE", "tie1", ""),
        Candidate(AKAL_MESIN_ID, text, when, "QUEUE", "tie2", ""),
    ]
    try:
        unique_match(row, same_time_tie)
        raise AssertionError("Same full caption and same time must not be guessed")
    except AmbiguousMatch:
        pass

    for status in ("Published", "Archived"):
        protected = {**page, "properties":{**page["properties"], "Status":{"status":{"name":status}}}}
        assert desired_update(protected, error) is None
        result = Sync("unused", Notion("unused")).reconcile([protected], [error])
        assert result["protected"] == 1
    assert desired_update({"in_trash":True, **page}, error) is None
    foreign = Candidate("another-channel", text, when, "PUBLISHED", "other", "")
    try:
        unique_match(row, [foreign]); raise AssertionError("Wrong channel matched")
    except RuntimeError:
        pass
    try:
        desired_update(page, foreign); raise AssertionError("Wrong channel mapped")
    except ValueError:
        pass

    class MemoryNotion(Notion):
        def __init__(self, target): self.headers={}; self.patched=[]; self.target=target
        def get_page(self, page_id):
            import copy
            return copy.deepcopy(self.target)
        def patch(self, page_id, properties):
            self.patched.append((page_id, properties))
            for name, value in properties.items():
                if name in ("Info", "Postiz ID"):
                    content = "".join(p["text"]["content"] for p in value["rich_text"])
                    self.target["properties"][name] = {"type":"rich_text", "rich_text":[{"plain_text":content}] if content else []}
                else:
                    self.target["properties"][name] = value

    import copy
    target = copy.deepcopy(page)
    connector = MemoryNotion(target)
    result = Sync("unused", connector, apply=True).reconcile([target], [error])
    assert result["changed"] == 1
    assert connector.patched[0][1]["Postiz ID"]["rich_text"][0]["text"]["content"] == "post1"
    target2 = copy.deepcopy(page)
    connector2 = MemoryNotion(target2)
    result = Sync("unused", connector2, apply=True).reconcile([target2], [error], backfill_ids=True)
    assert result["changed"] == 1
    assert list(connector2.patched[0][1]) == ["Postiz ID"]
    for status in ("Published", "Archived"):
        target3 = copy.deepcopy(page)
        target3["properties"]["Status"] = {"status":{"name":status}}
        connector3 = MemoryNotion(target3)
        result = Sync("unused", connector3, apply=True).reconcile([target3], [error], backfill_ids=True)
        assert result["changed"] == 1 and list(connector3.patched[0][1]) == ["Postiz ID"]
        assert target3["properties"]["Status"]["status"]["name"] == status
    print("Self-test OK: full captions, Postiz ID, ambiguity skips, terminal protection, idempotent updates, safe backfill")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Patch matching non-final Notion rows (default dry-run)")
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--lock-file", default="/run/lock/akalmesin-status-sync.lock")
    parser.add_argument("--backfill-ids", action="store_true",
                        help="Only add missing Postiz IDs to uniquely ID/full-caption matched dated rows")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return 0
    lock_path = Path(args.lock_file)
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    with lock_path.open("a+") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print("Another sync is running; this invocation skipped", file=sys.stderr)
            return 1
        return run_once(args.apply, backfill_ids=args.backfill_ids)


if __name__ == "__main__":
    sys.exit(main())
