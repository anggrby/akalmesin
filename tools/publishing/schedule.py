#!/usr/bin/env python3
"""Schedule Notion 'Ready to Publish' rows to Postiz (Akal Mesin only).

Default is --dry-run (no writes). Use --apply to create posts and update Notion.

Env (never printed):
  POSTIZ_SELFHOST_API_KEY
  NOTION_TOKEN

Exit 0 on success with nothing failed; 1 if any row failed / skipped-as-error /
fatal config issue.
"""

from __future__ import annotations

import argparse
import html as html_mod
import json
import mimetypes
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

NOTION_DB = "405f909f-26a5-8057-ad0a-e9562fe9c915"
NOTION_VERSION = "2022-06-28"
POSTIZ_BASE = os.environ.get("POSTIZ_API_URL", "").rstrip("/")
AKAL_MESIN_ID = "cmvpfx9sm0009po858rtcbrh6"
WIB = ZoneInfo("Asia/Jakarta")
UTC = timezone.utc
SLOTS_H = (9, 13, 19)  # WIB
MIN_LEAD = timedelta(minutes=10)
HORIZON_DAYS = 3
MAX_HASHTAGS = 5
MAX_CAPTION_WORDS = 100
POST_TYPE_BY_FORMAT = {"Carousel": "post", "Single image": "post", "Reel / video": "post"}


def die(msg: str, code: int = 1) -> None:
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(code)


def require_env() -> tuple[str, str]:
    postiz = os.environ.get("POSTIZ_SELFHOST_API_KEY", "").strip()
    notion = os.environ.get("NOTION_TOKEN", "").strip()
    if not postiz:
        die("POSTIZ_SELFHOST_API_KEY is not set.")
    if not notion:
        die(
            "NOTION_TOKEN is not set.\n"
            "Create a Notion integration, share DB "
            f"{NOTION_DB}, then: export NOTION_TOKEN=ntn_..."
        )
    if not POSTIZ_BASE:
        die("POSTIZ_API_URL must be set to the self-hosted Postiz public-v1 API URL.")
    return postiz, notion


def http_json(
    url: str,
    *,
    method: str = "GET",
    headers: dict[str, str] | None = None,
    body: dict[str, Any] | None = None,
    timeout: int = 120,
) -> Any:
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, method=method)
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    if body is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
            return json.loads(raw.decode("utf-8")) if raw else None
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")[:400]
        raise RuntimeError(f"HTTP {e.code} {method} {url}: {detail}") from e


def multipart_upload(url: str, api_key: str, path: Path) -> dict[str, Any]:
    boundary = f"----akal{os.urandom(8).hex()}"
    filename = path.name
    ctype = mimetypes.guess_type(filename)[0] or "application/octet-stream"
    file_bytes = path.read_bytes()
    parts = []
    parts.append(
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
        f"Content-Type: {ctype}\r\n\r\n".encode()
        + file_bytes
        + b"\r\n"
    )
    parts.append(f"--{boundary}--\r\n".encode())
    body = b"".join(parts)
    req = urllib.request.Request(url, data=body, method="POST")
    req.add_header("Authorization", api_key)
    req.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")[:400]
        raise RuntimeError(f"upload HTTP {e.code}: {detail}") from e


def parse_iso(s: str) -> datetime:
    s = s.strip()
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", s):
        return datetime.fromisoformat(s).replace(tzinfo=WIB).astimezone(UTC)
    dt = datetime.fromisoformat(s)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=WIB)
    return dt.astimezone(UTC)


def fmt_wib(dt: datetime) -> str:
    return dt.astimezone(WIB).strftime("%Y-%m-%d %H:%M WIB")


def to_utc_iso(dt: datetime) -> str:
    return dt.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def to_notion_date(dt: datetime) -> str:
    local = dt.astimezone(WIB)
    return local.strftime("%Y-%m-%dT%H:%M:%S+07:00")


def strip_html(s: str) -> str:
    s = re.sub(r"<br\s*/?>", "\n", s, flags=re.I)
    s = re.sub(r"</p\s*>", "\n", s, flags=re.I)
    s = re.sub(r"<[^>]+>", "", s)
    s = html_mod.unescape(s)
    return re.sub(r"\s+", " ", s).strip()


def caption_key(text: str) -> str:
    t = strip_html(text).lower()
    t = re.sub(r"[^\w\s]", "", t, flags=re.UNICODE)
    return re.sub(r"\s+", " ", t).strip()


def caption_html(caption: str) -> str:
    paras = [p.strip() for p in re.split(r"\n\s*\n", caption.strip()) if p.strip()]
    return "<p></p>".join(
        "<p>" + html_mod.escape(p, quote=False).replace("\n", "<br>") + "</p>"
        for p in paras
    )


def count_hashtags(text: str) -> list[str]:
    return re.findall(r"#\w+", text or "")


def word_count(text: str) -> int:
    return len(re.findall(r"\S+", text or ""))


def slugify(title: str) -> str:
    t = title.lower()
    t = re.sub(r"[^a-z0-9]+", "-", t)
    return t.strip("-")


# --- Notion / Postiz fetch ---

def notion_query(token: str, filter_obj: dict[str, Any]) -> list[dict[str, Any]]:
    headers = {
        "Authorization": f"Bearer {token}",
        "Notion-Version": NOTION_VERSION,
    }
    rows: list[dict[str, Any]] = []
    cursor = None
    while True:
        body: dict[str, Any] = {"page_size": 100, "filter": filter_obj}
        if cursor:
            body["start_cursor"] = cursor
        data = http_json(
            f"https://api.notion.com/v1/databases/{NOTION_DB}/query",
            method="POST",
            headers=headers,
            body=body,
        )
        rows.extend(data.get("results") or [])
        if not data.get("has_more"):
            break
        cursor = data.get("next_cursor")
        if not cursor:
            break
    return rows


def notion_get_page(token: str, page_id: str) -> dict[str, Any]:
    return http_json(
        f"https://api.notion.com/v1/pages/{page_id}",
        headers={
            "Authorization": f"Bearer {token}",
            "Notion-Version": NOTION_VERSION,
        },
    )


def notion_patch(token: str, page_id: str, properties: dict[str, Any]) -> None:
    http_json(
        f"https://api.notion.com/v1/pages/{page_id}",
        method="PATCH",
        headers={
            "Authorization": f"Bearer {token}",
            "Notion-Version": NOTION_VERSION,
        },
        body={"properties": properties},
    )


def ensure_postiz_id_property(token: str) -> None:
    existing = http_json(
        f"https://api.notion.com/v1/databases/{NOTION_DB}",
        headers={"Authorization": f"Bearer {token}", "Notion-Version": NOTION_VERSION},
    )
    prop = (existing.get("properties") or {}).get("Postiz ID")
    if prop is not None and prop.get("type") != "rich_text":
        raise RuntimeError("Notion 'Postiz ID' exists but is not rich_text")
    if prop is None:
        http_json(
            f"https://api.notion.com/v1/databases/{NOTION_DB}",
            method="PATCH",
            headers={"Authorization": f"Bearer {token}", "Notion-Version": NOTION_VERSION},
            body={"properties": {"Postiz ID": {"rich_text": {}}}},
        )


def row_view(row: dict[str, Any]) -> dict[str, Any]:
    props = row["properties"]
    title = "".join(x["plain_text"] for x in props["Post"]["title"])
    status = (props["Status"].get("status") or {}).get("name") or ""
    fmt = (props.get("Format", {}).get("select") or {}).get("name") or ""
    cap = "".join(x["plain_text"] for x in (props.get("Caption") or {}).get("rich_text") or [])
    assets = []
    for f in (props.get("Assets") or {}).get("files") or []:
        url = (f.get("file") or f.get("external") or {}).get("url")
        assets.append({"name": f.get("name") or "file", "url": url})
    return {
        "id": row["id"],
        "created": parse_iso(row["created_time"]),
        "publish_date": (props.get("Publish date", {}).get("date") or {}).get("start"),
        "postiz_id": "".join(x.get("plain_text", "") for x in (props.get("Postiz ID") or {}).get("rich_text") or []).strip(),
        "title": title,
        "status": status,
        "format": fmt,
        "caption": cap,
        "assets": assets,
        "key": caption_key(cap or title),
        "archived": bool(row.get("archived") or row.get("in_trash")),
    }


def fetch_postiz(api_key: str, start: datetime, end: datetime) -> list[dict[str, Any]]:
    qs = (
        f"startDate={start.astimezone(UTC).strftime('%Y-%m-%dT%H:%M:%S.000Z')}"
        f"&endDate={end.astimezone(UTC).strftime('%Y-%m-%dT%H:%M:%S.000Z')}"
    )
    data = http_json(f"{POSTIZ_BASE}/posts?{qs}", headers={"Authorization": api_key})
    posts = data.get("posts") if isinstance(data, dict) else data
    out = []
    for p in posts or []:
        if any(p.get(k) for k in ("deleted", "deletedAt", "isDeleted", "trashed")):
            continue
        if (p.get("integration") or {}).get("id") != AKAL_MESIN_ID:
            continue
        out.append(
            {
                "id": p["id"],
                "state": p.get("state"),
                "when": parse_iso(p["publishDate"]),
                "key": caption_key(p.get("content") or ""),
                "error": p.get("error"),
            }
        )
    return out


def taken_slots(posts: list[dict[str, Any]]) -> list[datetime]:
    return [
        p["when"]
        for p in posts
        if p["state"] in ("QUEUE", "PUBLISHED")
    ]


def slot_free(slot: datetime, taken: list[datetime]) -> bool:
    for t in taken:
        if abs(slot - t) < timedelta(minutes=5):
            return False
    return True


def iter_slots(now: datetime) -> list[datetime]:
    """Future 09/13/19 WIB slots for the next HORIZON_DAYS, skipping < MIN_LEAD."""
    local_now = now.astimezone(WIB)
    start_day = local_now.date()
    out: list[datetime] = []
    for d in range(HORIZON_DAYS + 1):
        day = start_day + timedelta(days=d)
        for h in SLOTS_H:
            slot = datetime(day.year, day.month, day.day, h, 0, tzinfo=WIB).astimezone(UTC)
            if slot < now + MIN_LEAD:
                continue
            if slot > now + timedelta(days=HORIZON_DAYS):
                continue
            out.append(slot)
    return out


def reel_asset(assets: list[dict[str, Any]]) -> dict[str, Any] | None:
    """The handoff's first MP4, with no filename/title guessing or local search."""
    return next(
        (
            a
            for a in assets
            if a.get("url")
            and (
                a.get("name", "").lower().endswith(".mp4")
                or urllib.parse.urlparse(a["url"]).path.lower().endswith(".mp4")
            )
        ),
        None,
    )


def download(url: str, dest: Path) -> None:
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=120) as resp, dest.open("wb") as f:
        while True:
            chunk = resp.read(1024 * 256)
            if not chunk:
                break
            f.write(chunk)


def already_scheduled(row: dict[str, Any], posts: list[dict[str, Any]], now: datetime) -> dict[str, Any] | None:
    """ID or full-caption match on the complete Postiz history, every state/time."""
    del now
    candidates = [p for p in posts if row.get("postiz_id") and p["id"] == row["postiz_id"]]
    if not candidates:
        candidates = [p for p in posts if row["key"] and p["key"] == row["key"]]
    if len(candidates) > 1:
        raise RuntimeError(
            f"ambiguous full caption on {len(candidates)} existing posts; refusing to schedule"
        )
    return candidates[0] if candidates else None


def body_caption_text(caption: str) -> str:
    """Exclude the Sumber and hashtag paragraphs from the editorial word count."""
    paragraphs = [
        p.strip() for p in re.split(r"\n\s*\n", caption.strip()) if p.strip()
    ]
    body = [
        p
        for p in paragraphs
        if not re.match(r"(?i)^Sumber\s*:", p)
        and not (
            count_hashtags(p) and len(count_hashtags(p)) <= MAX_HASHTAGS
            and not re.sub(r"#\w+", "", p).strip()
        )
    ]
    return "\n\n".join(body)

def validate_row(row: dict[str, Any]) -> str | None:
    if row["archived"]:
        return "archived/in_trash"
    if row["status"] != "Ready to Publish":
        return f"status is {row['status']!r}; required 'Ready to Publish'"
    if not row["caption"].strip():
        return "empty caption"
    tags = count_hashtags(row["caption"])
    if len(tags) > MAX_HASHTAGS:
        return "too many hashtags (max %d), found %d: %s" % (MAX_HASHTAGS, len(tags), tags)
    if row["format"] == "Reel / video":
        if not reel_asset(row["assets"]):
            return "Reel / video has no .mp4 asset in Notion Assets; PNG reference files are not a Reel"
    elif not row["assets"]:
        return "no Assets"
    return None


def reserve_slot(slot: datetime, taken: list[datetime], now: datetime, source: str) -> tuple[datetime, list[str]]:
    if slot < now + MIN_LEAD:
        return slot, [f"{source} {fmt_wib(slot)} is in the past or <10 minutes away; use --at or a new Publish date"]
    if not slot_free(slot, taken):
        return slot, [f"{source} {fmt_wib(slot)} is already taken on Akal Mesin Postiz"]
    taken.append(slot)
    return slot, []


def plan_slots(
    rows: list[dict[str, Any]],
    posts: list[dict[str, Any]],
    now: datetime,
    at: datetime | None,
    single_row: bool,
) -> tuple[list[tuple[dict[str, Any], datetime]], list[str]]:
    """Per row: future Publish date wins, then --at, then standing free slots."""
    if at is not None and len(rows) != 1:
        return [], ["--at requires exactly one row (use --row)"]
    errors: list[str] = []
    taken = taken_slots(posts)
    free = [s for s in iter_slots(now) if slot_free(s, taken)]
    assigned: list[tuple[dict[str, Any], datetime]] = []
    for row in rows:
        publish_date = row.get("publish_date")
        slot = parse_iso(publish_date) if publish_date else at
        if slot is not None:
            slot, e = reserve_slot(slot, taken, now, "Publish date" if publish_date else "--at")
            if e:
                errors.extend(f"{row['title']!r}: {x}" for x in e)
                continue
        else:
            while free and not slot_free(free[0], taken):
                free.pop(0)
            if not free:
                errors.append(f"{row['title']!r}: no free 09:00/13:00/19:00 WIB slot in horizon")
                continue
            slot = free.pop(0)
            taken.append(slot)
        assigned.append((row, slot))
    return ([], errors) if errors else (assigned, [])


def create_post(
    api_key: str,
    *,
    post_type: str,
    when: datetime,
    content: str,
    media: list[dict[str, str]],
) -> str:
    body = {
        "type": post_type,
        "shortLink": False,
        "date": to_utc_iso(when),
        "tags": [],
        "posts": [
            {
                "integration": {"id": AKAL_MESIN_ID},
                "value": [{"content": content, "image": media}],
                "settings": {
                    "__type": "instagram-standalone",
                    "post_type": "post",
                    "is_trending_audio": False,
                    "collaborators": [],
                },
            }
        ],
    }
    resp = http_json(
        f"{POSTIZ_BASE}/posts",
        method="POST",
        headers={"Authorization": api_key},
        body=body,
    )
    if isinstance(resp, list) and resp:
        return resp[0]["postId"]
    if isinstance(resp, dict) and resp.get("postId"):
        return resp["postId"]
    raise RuntimeError(f"unexpected create response: {resp!r}"[:300])


def verify_post(
    api_key: str, post_id: str, when: datetime, expect_state: str, window_days: int = 30
) -> dict[str, Any]:
    now = datetime.now(UTC)
    posts = fetch_postiz(api_key, now - timedelta(days=2), now + timedelta(days=window_days))
    for p in posts:
        if p["id"] == post_id:
            if p["state"] != expect_state:
                raise RuntimeError(f"expected state {expect_state}, got {p['state']} error={p['error']!r}")
            if abs(p["when"] - when) > timedelta(seconds=60):
                raise RuntimeError(
                    f"publishDate mismatch: got {fmt_wib(p['when'])} want {fmt_wib(when)}"
                )
            return p
    raise RuntimeError(f"post {post_id} not found in GET /posts after create")


# --- self-test (no network) ---

def sample_caption(words: int = 120) -> str:
    """Production-shaped caption: 120 body words + footer + five hashtags."""
    tokens = [f"kata{i}" for i in range(words)]
    groups = [tokens[:len(tokens) // 3], tokens[len(tokens) // 3: 2 * len(tokens) // 3], tokens[2 * len(tokens) // 3:]]
    text = "\n\n".join(" ".join(group) for group in groups)
    return (
        text
        + "\n\nSumber: Example newsroom / Foto: Example\n\n"
        + "#akalmesin #teknologi #AI #berita #Indonesia"
    )

def fixture_row(caption: str, *, fmt: str = "Carousel") -> dict[str, Any]:
    assets = [{"name": "01.png", "url": "https://example.test/01.png"}]
    if fmt == "Reel / video":
        assets = [
            {"name": "story-reel.mp4", "url": "https://cdn.example.test/path/story-reel.mp4"},
            {"name": "01.png", "url": "https://example.test/reference.png"},
        ]
    return {
        "id": "fake-1",
        "created": datetime(2026, 11, 5, 12, 0, tzinfo=WIB).astimezone(UTC),
        "title": "Realistic long caption",
        "status": "Ready to Publish",
        "format": fmt,
        "caption": caption,
        "assets": assets,
        "key": caption_key(caption),
        "publish_date": None,
        "postiz_id": "",
        "archived": False,
    }


def provider_settings() -> dict[str, Any]:
    # v1.47.0 + installed DTO allow ['post', 'story']; no 'reel' literal exists.
    return {
        "__type": "instagram-standalone",
        "post_type": POST_TYPE_BY_FORMAT["Reel / video"],
        "is_trending_audio": False,
        "collaborators": [],
    }


def self_test() -> None:
    now = datetime(2026, 11, 5, 14, 0, tzinfo=WIB).astimezone(UTC)
    slots = iter_slots(now)
    assert all(s.astimezone(WIB).hour in SLOTS_H for s in slots)
    assert all(s >= now + MIN_LEAD for s in slots)

    for words in (110, 120, 180, 200):
        caption = sample_caption(words)
        row = fixture_row(caption)
        assert word_count(body_caption_text(caption)) == words
        assert validate_row(row) is None  # Long body must remain a warning.
    assert "Sumber:" not in body_caption_text(sample_caption(110))
    assert "#akalmesin" not in body_caption_text(sample_caption(110))
    bad_tags = fixture_row(sample_caption(120) + " #extra")
    assert bad_tags["caption"].count("#") == 6
    assert "too many hashtags" in (validate_row(bad_tags) or "")

    h = caption_html(sample_caption(120))
    assert h.startswith("<p>") and h.count("<p></p>") >= 4
    assert "<p>Sumber: Example" in h

    row = fixture_row(sample_caption(120))
    for status in ("Draft", "Scheduled", "Published", "Error", "Archived"):
        refused = dict(row, status=status)
        assert "required" in (validate_row(refused) or "")
    archived = dict(row, archived=True)
    assert validate_row(archived) == "archived/in_trash"

    reel = fixture_row(sample_caption(110), fmt="Reel / video")
    chosen = reel_asset(reel["assets"])
    assert chosen == reel["assets"][0]
    assert validate_row(reel) is None and provider_settings()["post_type"] == "post"
    assert reel_asset([reel["assets"][1]]) is None
    assert "no .mp4" in (validate_row(dict(reel, assets=reel["assets"][1:])) or "")
    assert "POSTS_ROOT" not in globals() and "find_reel_mp4" not in globals()

    # Publish date takes precedence over --at; --at only runs with one row.
    planned = dict(row, publish_date="2026-11-06T13:00:00+07:00")
    asg, errors = plan_slots(
        [planned], [], now, datetime(2026, 11, 6, 19, 0, tzinfo=WIB), True
    )
    assert not errors and fmt_wib(asg[0][1]) == "2026-11-06 13:00 WIB"
    overridden = dict(row, publish_date=None)
    asg, errors = plan_slots(
        [overridden], [], now, datetime(2026, 11, 6, 19, 0, tzinfo=WIB), True
    )
    assert not errors and fmt_wib(asg[0][1]) == "2026-11-06 19:00 WIB"
    asg, errors = plan_slots([row], [], now, None, False)
    assert not errors and fmt_wib(asg[0][1]) == "2026-11-05 19:00 WIB"
    asg, errors = plan_slots([row, dict(row, id="other")], [], now, datetime(2026, 11, 9, 9, 0, tzinfo=WIB), False)
    assert errors == ["--at requires exactly one row (use --row)"] and not asg
    for past in ("2026-11-05T12:00:00+07:00", "2026-11-05T14:05:00+07:00"):
        asg, errors = plan_slots([dict(row, publish_date=past)], [], now, None, False)
        assert errors and not asg
    busy = [{"id": "slot", "state": "QUEUE", "when": asg[0][1] if asg else datetime(2026, 11, 5, 19, 0, tzinfo=WIB).astimezone(UTC), "key": "busy", "error": None}]
    busy[0]["when"] = datetime(2026, 11, 6, 13, 0, tzinfo=WIB).astimezone(UTC)
    _, errors = plan_slots([planned], busy, now, None, False)
    assert "already taken" in errors[0]

    # Old ERROR posts count too. Just sharing a prefix must not suppress a row.
    unrelated = dict(busy[0], id="old-other", key="unrelated", state="QUEUE")
    past_error = dict(busy[0], id="old", key=row["key"], state="ERROR", when=now - timedelta(days=20))
    assert already_scheduled(row, [unrelated, past_error], now)["id"] == "old"
    past_draft = dict(past_error, id="draft", state="DRAFT")
    assert already_scheduled(row, [past_draft], now)["id"] == "draft"
    assert already_scheduled(row, [], now) is None
    truncated = dict(busy[0], key=row["key"][:24] + " another story", id="truncated")
    assert already_scheduled(row, [truncated], now) is None
    id_match = dict(row, key="revised caption", postiz_id="stored-id")
    assert already_scheduled(id_match, [dict(past_error, id="stored-id", key="completely different")], now)["id"] == "stored-id"
    try:
        already_scheduled(row, [past_error, dict(past_error, id="duplicate")], now)
        raise AssertionError("Ambiguous duplicates must refuse scheduling")
    except RuntimeError:
        pass

    # Structurally verify the outgoing integration and supported Reel payload.
    fake = {"body": None}
    def fake_http(url, **kwargs):
        fake["body"] = kwargs["body"]
        return {"postId": "synthetic-id"}
    global http_json
    real_http = http_json
    http_json = fake_http
    try:
        assert create_post("unused", post_type="draft", when=now, content="test", media=[]) == "synthetic-id"
        target = fake["body"]["posts"][0]
        assert target["integration"] == {"id": AKAL_MESIN_ID} and target["settings"] == provider_settings()
        assert fake["body"]["type"] == "draft"
    finally:
        http_json = real_http
    print("self-test OK: realistic captions, hard hashtags, Notion mp4, date precedence, full duplicates, safety payload")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Schedule Ready to Publish Notion rows to Postiz (Akal Mesin).")
    ap.add_argument("--dry-run", action="store_true", default=True, help="Plan only (default).")
    ap.add_argument("--apply", action="store_true", help="Actually create posts / patch Notion.")
    mode = ap.add_mutually_exclusive_group()
    mode.add_argument("--draft", action="store_true", help="Create DRAFT; does not schedule.")
    mode.add_argument("--schedule", action="store_true", help="Create QUEUE schedule (requires owner approval acknowledgement).")
    ap.add_argument("--approved-by-angger", action="store_true", help="Confirm Angger approved this exact plan outside this script.")
    ap.add_argument("--at", metavar="YYYY-MM-DD HH:MM", help="Explicit WIB time for --row.")
    ap.add_argument("--row", metavar="PAGE_ID", help="Only this Notion page id.")
    ap.add_argument("--no-wait", action="store_true", help="Skip 2-minute ERROR re-check.")
    ap.add_argument("--self-test", action="store_true", help="Run offline unit checks and exit.")
    args = ap.parse_args(argv)

    if args.self_test:
        self_test()
        return 0

    dry = not args.apply
    if args.apply and not args.draft and not args.schedule:
        die("--apply requires --draft, or --schedule with explicit owner approval")
    if args.schedule and not args.approved_by_angger:
        die("--schedule requires --approved-by-angger after he approved the dry-run plan")
    if args.approved_by_angger and not args.schedule:
        die("--approved-by-angger is only valid with --schedule")
    if args.at and not args.row:
        die("--at requires exactly one row (use --row)")

    postiz_key, notion_token = require_env()
    now = datetime.now(UTC)
    print("Akal Mesin scheduler")
    print(f"mode: {'DRY-RUN' if dry else 'APPLY'}  draft={args.draft}")
    print(f"now:  {fmt_wib(now)}")
    print("---")

    # Load Ready to Publish
    if args.row:
        page = notion_get_page(notion_token, args.row)
        rows = [row_view(page)]
        if rows[0]["status"] != "Ready to Publish":
            die(f"--row requires Status 'Ready to Publish'; got {rows[0]['status']!r}")
    else:
        raw = notion_query(
            notion_token,
            {"property": "Status", "status": {"equals": "Ready to Publish"}},
        )
        rows = [row_view(r) for r in raw]
        rows = [r for r in rows if not r["archived"]]
        rows.sort(key=lambda r: r["created"])

    posts = fetch_postiz(
        postiz_key,
        now - timedelta(days=LOOKBACK_DAYS),
        now + timedelta(days=HORIZON_DAYS + 1),
    )
    rowspan = [parse_iso(r["publish_date"]) for r in rows if r.get("publish_date")]
    posts = fetch_postiz(
        postiz_key,
        datetime(1970, 1, 1, tzinfo=UTC),
        max([now + timedelta(days=HORIZON_DAYS + 1), *rowspan]),
    )

    at_dt = None
    if args.at:
        try:
            at_dt = datetime.strptime(args.at, "%Y-%m-%d %H:%M").replace(tzinfo=WIB).astimezone(UTC)
        except ValueError:
            die("--at must be 'YYYY-MM-DD HH:MM' (WIB)")

    print(f"Ready to Publish rows: {len(rows)}")
    for r in rows:
        print(f"  - {r['id']}  [{r['format']}]  {r['title']!r}  created {fmt_wib(r['created'])}")

    # Filter invalid / already scheduled
    todo: list[dict[str, Any]] = []
    failures = 0
    for r in rows:
        reason = validate_row(r)
        if reason:
            print(f"SKIP {r['title']!r}: {reason}")
            failures += 1
            continue
        try:
            existing = already_scheduled(r, posts, now)
        except RuntimeError as exc:
            print(f"SKIP {r['title']!r}: {exc}")
            failures += 1
            continue
        if existing:
            print(
                f"SKIP {r['title']!r}: already on Postiz as {existing['state']} "
                f"id={existing['id']} at {fmt_wib(existing['when'])}"
            )
            continue
        if r["format"] == "Reel / video":
            asset = reel_asset(r["assets"])
            r = dict(r)
            r["_video_asset"] = asset
        todo.append(r)

    if not todo:
        print()
        print("Nothing to schedule.")
        print("SUMMARY  planned=0  failed_or_skipped_hard=" + str(failures))
        return 1 if failures else 0

    asg, plan_err = plan_slots(todo, posts, now, at_dt, bool(args.row))
    if plan_err:
        for e in plan_err:
            print(f"PLAN ERROR: {e}")
        return 1

    print()
    print("PLAN:")
    for r, slot in asg:
        asset = r.get("_video_asset")
        media = asset["name"] if asset else f"{len(r['assets'])} slides"
        print(
            f"  {fmt_wib(slot)}  [{r['format']}]  {r['title']!r}  "
            f"hashtags={len(count_hashtags(r['caption']))} body_words={word_count(body_caption_text(r['caption']))}  media={media}"
        )

    if dry:
        print()
        for r, _ in asg:
            count = word_count(body_caption_text(r["caption"]))
            if count > MAX_CAPTION_WORDS:
                print(f"WARN {r['title']!r}: body caption is {count} words; editorial limit is {MAX_CAPTION_WORDS} (warning only)")
        print("Dry-run only. An explicit owner approval is still required before --apply; default work is a draft.")
        print(f"SUMMARY  planned={len(asg)}  failed={failures}")
        return 1 if failures else 0

    # APPLY
    ensure_postiz_id_property(notion_token)
    import tempfile
    work = Path(tempfile.mkdtemp(prefix="akalmesin-schedule-"))
    expect_state = "DRAFT" if args.draft else "QUEUE"
    post_type = "draft" if args.draft else "schedule"
    ok = 0
    for r, slot in asg:
        print()
        print(f"APPLY {r['title']!r} → {fmt_wib(slot)}")
        try:
            # refresh page for fresh asset URLs
            fresh = row_view(notion_get_page(notion_token, r["id"]))
            fresh["_video_asset"] = r.get("_video_asset")
            reason = validate_row(fresh)
            if reason:
                raise RuntimeError(f"re-validate failed: {reason}")

            media_meta: list[dict[str, str]] = []
            if fresh["format"] == "Reel / video":
                video = reel_asset(fresh["assets"])
                if not video:
                    raise RuntimeError("fresh Notion Assets have no .mp4; refusing to upload PNG reference files")
                if not video.get("url"):
                    raise RuntimeError(f"reel asset {video['name']} has no URL")
                vp = work / f"{fresh['id']}_{video['name']}"
                download(video["url"], vp)
                up = multipart_upload(f"{POSTIZ_BASE}/upload", postiz_key, vp)
                media_meta.append({"id": up["id"], "path": up["path"]})
            else:
                for a in fresh["assets"]:
                    if a["name"].lower().endswith(".mp4"):
                        raise RuntimeError(f"unexpected video asset {a['name']} on non-Reel row")
                    if not a["url"]:
                        raise RuntimeError(f"asset {a['name']} has no URL")
                    dest = work / f"{fresh['id']}_{a['name']}"
                    download(a["url"], dest)
                    up = multipart_upload(f"{POSTIZ_BASE}/upload", postiz_key, dest)
                    media_meta.append({"id": up["id"], "path": up["path"]})

            content = caption_html(fresh["caption"])
            post_id = create_post(
                postiz_key,
                post_type=post_type,
                when=slot,
                content=content,
                media=media_meta,
            )
            print(f"  created post_id={post_id}")
            verify_post(postiz_key, post_id, slot, expect_state)
            print(f"  verified {expect_state} {fmt_wib(slot)}")

            if not args.no_wait and not args.draft:
                print("  waiting 120s for ERROR re-check…")
                time.sleep(120)
                again = verify_post(postiz_key, post_id, slot, expect_state)
                if again["state"] == "ERROR":
                    raise RuntimeError(f"flipped to ERROR: {again['error']!r}")
                print(f"  still {again['state']}")

            notion_patch(
                notion_token,
                fresh["id"],
                {"Postiz ID": {"rich_text": [{"type": "text", "text": {"content": post_id}}]}},
            )
            print("  Notion Postiz ID stored")
            if not args.draft:
                notion_patch(
                    notion_token,
                    fresh["id"],
                    {
                        "Status": {"status": {"name": "Scheduled"}},
                        "Publish date": {"date": {"start": to_notion_date(slot)}},
                    },
                )
                print(f"  Notion → Scheduled {to_notion_date(slot)}")
            else:
                print("  Notion status left unchanged (draft mode)")
            ok += 1
        except Exception as e:
            print(f"  FAIL: {e}")
            failures += 1

    print()
    print(f"SUMMARY  ok={ok}  failed={failures}  planned={len(asg)}")
    return 1 if failures else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        sys.exit(130)
