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

NOTION_DB = "405f909f-26a5-8057-ad0a-e9562fe9c915"
NOTION_VERSION = "2022-06-28"
POSTIZ_BASE = "https://167-104-102-132.sslip.io/api/public/v1"
AKAL_MESIN_ID = "cmvpfx9sm0009po858rtcbrh6"
WIB = timezone(timedelta(hours=7), name="WIB")
UTC = timezone.utc
SLOTS_H = (9, 13, 19)  # WIB
MIN_LEAD = timedelta(minutes=10)
HORIZON_DAYS = 3
MAX_HASHTAGS = 5
MAX_CAPTION_WORDS = 100
POSTS_ROOT = Path("/workspace/akalmesin-new/content/posts")
CAPTION_PREFIX = 48


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
    return re.sub(r"\s+", " ", t).strip()[:CAPTION_PREFIX]


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
    assets.sort(key=lambda a: a["name"])
    return {
        "id": row["id"],
        "created": parse_iso(row["created_time"]),
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


def find_reel_mp4(title: str, video_override: str | None) -> Path | None:
    if video_override:
        p = Path(video_override)
        return p if p.is_file() else None
    if not POSTS_ROOT.is_dir():
        return None
    slug = slugify(title)
    # token overlap scoring
    title_tokens = set(re.findall(r"[a-z0-9]+", title.lower()))
    best: tuple[int, Path] | None = None
    for d in POSTS_ROOT.iterdir():
        if not d.is_dir():
            continue
        cand = d / "out" / "reel" / "reel.mp4"
        if not cand.is_file():
            # also accept top-level reel.mp4 under out/
            alt = d / "out" / "reel.mp4"
            cand = alt if alt.is_file() else cand
        if not cand.is_file():
            continue
        name = d.name.lower()
        score = 0
        if slug and slug in name:
            score += 100
        dir_tokens = set(re.findall(r"[a-z0-9]+", name))
        score += len(title_tokens & dir_tokens)
        if best is None or score > best[0]:
            best = (score, cand)
    if best and best[0] >= 2:
        return best[1]
    return None


def download(url: str, dest: Path) -> None:
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=120) as resp, dest.open("wb") as f:
        while True:
            chunk = resp.read(1024 * 256)
            if not chunk:
                break
            f.write(chunk)


def already_scheduled(row: dict[str, Any], posts: list[dict[str, Any]], now: datetime) -> dict[str, Any] | None:
    for p in posts:
        if p["when"] < now:
            continue
        if p["state"] not in ("QUEUE", "DRAFT", "PUBLISHED"):
            continue
        if not row["key"] or not p["key"]:
            continue
        if row["key"] == p["key"] or row["key"].startswith(p["key"][:24]) or p["key"].startswith(row["key"][:24]):
            return p
    return None


def validate_row(row: dict[str, Any]) -> str | None:
    if row["archived"]:
        return "archived/in_trash"
    if not row["caption"].strip():
        return "empty caption"
    tags = count_hashtags(row["caption"])
    if len(tags) > MAX_HASHTAGS:
        return "too many hashtags (max %d), found %d: %s" % (MAX_HASHTAGS, len(tags), tags)
    wc = word_count(row["caption"])
    if wc > MAX_CAPTION_WORDS:
        return "caption too long (max %d words), found %d" % (MAX_CAPTION_WORDS, wc)
    fmt = row["format"]
    if fmt == "Reel / video":
        return None
    if not row["assets"]:
        return "no Assets"
    return None


def plan_slots(
    rows: list[dict[str, Any]],
    posts: list[dict[str, Any]],
    now: datetime,
    at: datetime | None,
    single_row: bool,
) -> tuple[list[tuple[dict[str, Any], datetime]], list[str]]:
    """Return (assignments, errors)."""
    errors: list[str] = []
    taken = taken_slots(posts)
    free = [s for s in iter_slots(now) if slot_free(s, taken)]
    assignments: list[tuple[dict[str, Any], datetime]] = []

    if at is not None:
        if at < now + MIN_LEAD:
            errors.append(f"--at {fmt_wib(at)} is <10 minutes away (or past)")
            return [], errors
        if not slot_free(at, taken):
            errors.append(f"--at {fmt_wib(at)} already taken on Postiz")
            return [], errors
        if len(rows) != 1 and not single_row:
            errors.append("--at requires exactly one row (use --row)")
            return [], errors
        for r in rows:
            assignments.append((r, at))
        return assignments, errors

    if len(rows) > len(free):
        errors.append(
            f"{len(rows)} Ready to Publish rows but only {len(free)} free slots "
            f"in the next {HORIZON_DAYS} days "
            f"({', '.join(fmt_wib(s) for s in free) or 'none'}). Stop."
        )
        return [], errors

    for r, slot in zip(rows, free):
        assignments.append((r, slot))
    return assignments, errors


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
    api_key: str, post_id: str, when: datetime, expect_state: str, window_days: int = 14
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

def self_test() -> None:
    now = datetime(2026, 11, 5, 14, 0, tzinfo=WIB).astimezone(UTC)
    # slots
    slots = iter_slots(now)
    assert all(s.astimezone(WIB).hour in SLOTS_H for s in slots)
    assert all(s >= now + MIN_LEAD for s in slots)
    # caption html
    h = caption_html("Hello world.\n\nSecond para.\n\n#a #b")
    assert "<p></p>" in h and h.count("<p>") == 5  # 3 content + 2 empty separators... wait
    # 3 paras => 3 <p>content</p> joined by 2 <p></p> => total 5 <p> open tags? 
    # '<p>a</p><p></p><p>b</p>' has 3 opening <p>
    assert h.startswith("<p>Hello")
    assert h.count("<p></p>") == 2
    # fake row planning
    rows = [
        {
            "id": "fake-1",
            "created": now,
            "title": "Fake carousel",
            "status": "Ready to Publish",
            "format": "Carousel",
            "caption": "One. " * 10 + "\n\nTwo.\n\n#akalmesin #A #B #C #D",
            "assets": [{"name": "01.png", "url": "http://example"}],
            "key": caption_key("One. " * 10),
            "archived": False,
        }
    ]
    posts = [
        {
            "id": "p1",
            "state": "QUEUE",
            "when": datetime(2026, 11, 5, 19, 0, tzinfo=WIB).astimezone(UTC),
            "key": "other",
            "error": None,
        }
    ]
    asg, err = plan_slots(rows, posts, now, None, False)
    assert not err and len(asg) == 1
    assert asg[0][1].astimezone(WIB).hour in SLOTS_H
    # too many rows
    many = rows * 20
    asg2, err2 = plan_slots(many, posts, now, None, False)
    assert err2 and not asg2
    # idempotent key
    rows[0]["key"] = caption_key("One. " * 10)
    posts.append(
        {
            "id": "p2",
            "state": "QUEUE",
            "when": datetime(2026, 11, 6, 9, 0, tzinfo=WIB).astimezone(UTC),
            "key": rows[0]["key"],
            "error": None,
        }
    )
    assert already_scheduled(rows[0], posts, now)
    # hashtag / word validation
    bad = dict(rows[0])
    bad["caption"] = "x\n\n#a #b #c #d #e #f"
    assert validate_row(bad)
    print("self-test OK")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Schedule Ready to Publish Notion rows to Postiz (Akal Mesin).")
    ap.add_argument("--dry-run", action="store_true", default=True, help="Plan only (default).")
    ap.add_argument("--apply", action="store_true", help="Actually create posts / patch Notion.")
    ap.add_argument("--draft", action="store_true", help="Create DRAFT instead of schedule.")
    ap.add_argument("--at", metavar="YYYY-MM-DD HH:MM", help="Explicit WIB time for --row.")
    ap.add_argument("--row", metavar="PAGE_ID", help="Only this Notion page id.")
    ap.add_argument("--video", metavar="PATH", help="Override reel mp4 path.")
    ap.add_argument("--no-wait", action="store_true", help="Skip 2-minute ERROR re-check.")
    ap.add_argument("--self-test", action="store_true", help="Run offline unit checks and exit.")
    args = ap.parse_args(argv)

    if args.self_test:
        self_test()
        return 0

    dry = not args.apply
    if args.apply:
        dry = False

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
        if rows[0]["status"] != "Ready to Publish" and not args.at:
            print(f"WARN: row status is {rows[0]['status']!r}, not Ready to Publish")
    else:
        raw = notion_query(
            notion_token,
            {"property": "Status", "status": {"equals": "Ready to Publish"}},
        )
        rows = [row_view(r) for r in raw]
        rows = [r for r in rows if not r["archived"]]
        rows.sort(key=lambda r: r["created"])

    posts = fetch_postiz(postiz_key, now - timedelta(days=1), now + timedelta(days=HORIZON_DAYS + 1))

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
        existing = already_scheduled(r, posts, now)
        if existing:
            print(
                f"SKIP {r['title']!r}: already on Postiz as {existing['state']} "
                f"id={existing['id']} at {fmt_wib(existing['when'])}"
            )
            continue
        if r["format"] == "Reel / video":
            mp4 = find_reel_mp4(r["title"], args.video)
            if not mp4:
                print(f"SKIP {r['title']!r}: reel mp4 not found under {POSTS_ROOT}")
                failures += 1
                continue
            r = dict(r)
            r["_video"] = str(mp4)
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
        media = r.get("_video") or f"{len(r['assets'])} slides"
        print(
            f"  {fmt_wib(slot)}  [{r['format']}]  {r['title']!r}  "
            f"hashtags={len(count_hashtags(r['caption']))} words={word_count(r['caption'])}  media={media}"
        )

    if dry:
        print()
        print("Dry-run only. Re-run with --apply to create posts.")
        print(f"SUMMARY  planned={len(asg)}  failed={failures}")
        return 1 if failures else 0

    # APPLY
    work = Path("/tmp/akalmesin-schedule-work")
    work.mkdir(parents=True, exist_ok=True)
    expect_state = "DRAFT" if args.draft else "QUEUE"
    post_type = "draft" if args.draft else "schedule"
    ok = 0
    for r, slot in asg:
        print()
        print(f"APPLY {r['title']!r} → {fmt_wib(slot)}")
        try:
            # refresh page for fresh asset URLs
            fresh = row_view(notion_get_page(notion_token, r["id"]))
            fresh["_video"] = r.get("_video")
            reason = validate_row(fresh)
            if reason:
                raise RuntimeError(f"re-validate failed: {reason}")

            media_meta: list[dict[str, str]] = []
            if fresh["format"] == "Reel / video":
                vp = Path(fresh["_video"])
                up = multipart_upload(f"{POSTIZ_BASE}/upload", postiz_key, vp)
                media_meta.append({"id": up["id"], "path": up["path"]})
            else:
                for a in fresh["assets"]:
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
