#!/usr/bin/env python3
"""Read-only health check: Notion Akal Mesin Content Schedule vs Postiz Akal Mesin.

Compares Scheduled/Published Notion rows with Postiz posts on channel
cmvpfx9sm0009po858rtcbrh6. Never writes to either side. Never prints secrets.

Env:
  POSTIZ_SELFHOST_API_KEY  required
  NOTION_TOKEN             required (Notion internal integration token)

Exit 0 if no conflicts, 1 if conflicts (or fatal config/fetch error).
"""

from __future__ import annotations

import html as html_mod
import json
import os
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from typing import Any

# --- constants ---
NOTION_DB = "405f909f-26a5-8057-ad0a-e9562fe9c915"
NOTION_VERSION = "2022-06-28"
POSTIZ_BASE = "https://167-104-102-132.sslip.io/api/public/v1"
AKAL_MESIN_ID = "cmvpfx9sm0009po858rtcbrh6"
WIB = timezone(timedelta(hours=7), name="WIB")
UTC = timezone.utc
MATCH_WINDOW = timedelta(minutes=5)
CAPTION_PREFIX_LEN = 48
LOOKBACK_DAYS = 7
LOOKAHEAD_DAYS = 30
MAX_HASHTAGS = 5
# Fields present on GET /posts for Akal Mesin (inspected live). No media/image list.
POSTIZ_LIST_FIELDS = (
    "id", "content", "publishDate", "releaseURL", "releaseId", "state", "error",
    "intervalInDays", "group", "creationMethod", "settings", "tags", "integration",
)


def die(msg: str, code: int = 1) -> None:
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(code)


def require_env() -> tuple[str, str]:
    postiz = os.environ.get("POSTIZ_SELFHOST_API_KEY", "").strip()
    notion = os.environ.get("NOTION_TOKEN", "").strip()
    if not postiz:
        die(
            "POSTIZ_SELFHOST_API_KEY is not set. Export it before running:\n"
            "  export POSTIZ_SELFHOST_API_KEY=..."
        )
    if not notion:
        die(
            "NOTION_TOKEN is not set.\n"
            "Create a Notion internal integration at https://www.notion.so/my-integrations ,\n"
            "copy the secret (starts with ntn_ or secret_), then:\n"
            "  export NOTION_TOKEN=ntn_...\n"
            "Share the database 'Akal Mesin Content Schedule' "
            f"({NOTION_DB}) with that integration (••• → Connections)."
        )
    return postiz, notion


def http_json(
    url: str,
    *,
    method: str = "GET",
    headers: dict[str, str] | None = None,
    body: dict[str, Any] | None = None,
    timeout: int = 60,
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
            if not raw:
                return None
            return json.loads(raw.decode("utf-8"))
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")[:300]
        raise RuntimeError(f"HTTP {e.code} {url}: {detail}") from e


def strip_html(s: str) -> str:
    s = re.sub(r"<br\s*/?>", "\n", s, flags=re.I)
    s = re.sub(r"</p\s*>", "\n", s, flags=re.I)
    s = re.sub(r"<[^>]+>", "", s)
    s = html_mod.unescape(s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def caption_key(text: str) -> str:
    t = strip_html(text).lower()
    t = re.sub(r"[^\w\s]", "", t, flags=re.UNICODE)
    t = re.sub(r"\s+", " ", t).strip()
    return t[:CAPTION_PREFIX_LEN]


def normalize_para(s: str) -> str:
    s = html_mod.unescape(s)
    s = s.replace("\xa0", " ")
    s = re.sub(r"[ \t]+", " ", s)
    s = re.sub(r"\s*\n\s*", "\n", s).strip()
    return s


def notion_paragraphs(caption: str) -> list[str]:
    parts = re.split(r"\n\s*\n", (caption or "").strip())
    return [normalize_para(p) for p in parts if normalize_para(p)]


def postiz_paragraphs(content_html: str) -> tuple[list[str], int, bool, str]:
    """Return (paragraphs, empty_p_count, has_blank_separators_ok, form).

    form is 'html_p' when <p> tags are used, else 'plain'.
    Expected Angger format: <p>text</p><p></p><p>text</p>...
    """
    raw = content_html or ""
    if re.search(r"<p\b", raw, flags=re.I):
        blocks = re.findall(r"<p\b[^>]*>(.*?)</p>", raw, flags=re.I | re.S)
        empty = 0
        paras: list[str] = []
        for b in blocks:
            inner = re.sub(r"<br\s*/?>", "\n", b, flags=re.I)
            inner = re.sub(r"<[^>]+>", "", inner)
            inner = normalize_para(inner)
            if not inner:
                empty += 1
            else:
                paras.append(inner)
        need = max(0, len(paras) - 1)
        has_sep = need == 0 or empty >= need
        return paras, empty, has_sep, "html_p"
    # Plain text (older posts): split on blank lines
    parts = re.split(r"\n\s*\n", raw.strip())
    paras = [normalize_para(p) for p in parts if normalize_para(p)]
    # blank lines present if more than one para after blank-line split
    has_sep = len(paras) <= 1 or len(parts) >= len(paras)
    return paras, 0, has_sep, "plain"


def count_hashtags(text: str) -> list[str]:
    return re.findall(r"#\w+", text or "", flags=re.UNICODE)


def parse_iso(s: str) -> datetime:
    if not s:
        raise ValueError("empty date")
    s = s.strip()
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", s):
        dt = datetime.fromisoformat(s).replace(tzinfo=WIB)
        return dt.astimezone(UTC)
    dt = datetime.fromisoformat(s)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=WIB)
    return dt.astimezone(UTC)


def fmt_wib(dt: datetime) -> str:
    return dt.astimezone(WIB).strftime("%Y-%m-%d %H:%M WIB")


# --- fetchers ---

def fetch_postiz(api_key: str, start: datetime, end: datetime) -> list[dict[str, Any]]:
    qs = (
        f"startDate={start.astimezone(UTC).strftime('%Y-%m-%dT%H:%M:%S.000Z')}"
        f"&endDate={end.astimezone(UTC).strftime('%Y-%m-%dT%H:%M:%S.000Z')}"
    )
    url = f"{POSTIZ_BASE}/posts?{qs}"
    data = http_json(url, headers={"Authorization": api_key})
    posts = data.get("posts") if isinstance(data, dict) else data
    if not isinstance(posts, list):
        raise RuntimeError(f"Unexpected Postiz response shape: {type(data)}")
    return [p for p in posts if (p.get("integration") or {}).get("id") == AKAL_MESIN_ID]


def fetch_notion(token: str) -> list[dict[str, Any]]:
    headers = {
        "Authorization": f"Bearer {token}",
        "Notion-Version": NOTION_VERSION,
    }
    rows: list[dict[str, Any]] = []
    cursor = None
    while True:
        body: dict[str, Any] = {
            "page_size": 100,
            "filter": {
                "or": [
                    {"property": "Status", "status": {"equals": "Scheduled"}},
                    {"property": "Status", "status": {"equals": "Published"}},
                ]
            },
        }
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


def notion_row_view(row: dict[str, Any]) -> dict[str, Any]:
    props = row.get("properties") or {}
    title = "".join(x.get("plain_text", "") for x in (props.get("Post") or {}).get("title") or [])
    status = ((props.get("Status") or {}).get("status") or {}).get("name") or ""
    fmt = ((props.get("Format") or {}).get("select") or {}).get("name") or ""
    date_obj = (props.get("Publish date") or {}).get("date")
    when = parse_iso(date_obj["start"]) if date_obj and date_obj.get("start") else None
    cap = "".join(
        x.get("plain_text", "") for x in (props.get("Caption") or {}).get("rich_text") or []
    )
    assets = []
    for f in (props.get("Assets") or {}).get("files") or []:
        name = f.get("name") or ""
        assets.append(name)
    assets_sorted = sorted(assets)  # Notion order may vary; also keep original
    return {
        "id": row["id"],
        "title": title or "(untitled)",
        "status": status,
        "format": fmt,
        "when": when,
        "caption": cap,
        "key": caption_key(cap or title),
        "assets": assets,  # API order as returned
        "asset_names_sorted": assets_sorted,
    }


def postiz_view(p: dict[str, Any]) -> dict[str, Any]:
    when = parse_iso(p["publishDate"])
    content = p.get("content") or ""
    return {
        "id": p["id"],
        "state": p.get("state") or "",
        "when": when,
        "content": content,
        "key": caption_key(content),
        "error": p.get("error"),
        "title_guess": strip_html(content)[:60],
        "raw_keys": sorted(p.keys()),
        "settings": p.get("settings"),
    }


def same_slot(a: datetime, b: datetime) -> bool:
    return abs(a - b) <= MATCH_WINDOW


def match_pair(n: dict[str, Any], p: dict[str, Any]) -> bool:
    if n["when"] is None:
        return False
    if not same_slot(n["when"], p["when"]):
        return False
    nk, pk = n["key"], p["key"]
    if not nk or not pk:
        return True
    return nk.startswith(pk[:24]) or pk.startswith(nk[:24]) or nk == pk


def compare_captions(n: dict[str, Any], p: dict[str, Any]) -> list[str]:
    """Return conflict lines for caption diffs."""
    out: list[str] = []
    n_paras = notion_paragraphs(n["caption"])
    p_paras, empty_count, has_sep, form = postiz_paragraphs(p["content"])
    label = f"{fmt_wib(n['when']) if n['when'] else '?'}  {n['title']!r}  postiz_id={p['id']}"

    if len(n_paras) != len(p_paras):
        out.append(
            f"CAPTION_PARA_COUNT  notion={len(n_paras)} postiz={len(p_paras)}  {label}"
        )

    n_cmp = max(len(n_paras), len(p_paras))
    for i in range(n_cmp):
        a = n_paras[i] if i < len(n_paras) else None
        b = p_paras[i] if i < len(p_paras) else None
        if a is None:
            out.append(f"CAPTION_EXTRA_IN_POSTIZ  para[{i+1}]={b[:80]!r}  {label}")
        elif b is None:
            out.append(f"CAPTION_MISSING_IN_POSTIZ  para[{i+1}]={a[:80]!r}  {label}")
        elif a != b:
            # show a short diff hint
            out.append(
                f"CAPTION_DIFF  para[{i+1}]  notion={a[:70]!r}  postiz={b[:70]!r}  {label}"
            )

    need_empty = max(0, len(p_paras) - 1)
    if form == "plain" and need_empty:
        out.append(
            f"CAPTION_NOT_HTML_P  postiz caption is plain text (no <p></p> blank separators)  {label}"
        )
    elif need_empty and empty_count < need_empty:
        out.append(
            f"CAPTION_MISSING_BLANK_LINES  need_empty_p={need_empty} found={empty_count}  {label}"
        )
    elif need_empty and not re.search(r"<p>\s*</p>", p["content"] or "", flags=re.I):
        out.append(f"CAPTION_MISSING_BLANK_LINES  no <p></p> separators  {label}")

    n_tags = count_hashtags(n["caption"])
    p_tags = count_hashtags(strip_html(p["content"]))
    if len(n_tags) > MAX_HASHTAGS:
        out.append(f"HASHTAGS_NOTION_GT5  count={len(n_tags)} {n_tags}  {label}")
    if len(p_tags) > MAX_HASHTAGS:
        out.append(f"HASHTAGS_POSTIZ_GT5  count={len(p_tags)} {p_tags}  {label}")
    if n_tags != p_tags:
        out.append(
            f"HASHTAGS_MISMATCH  notion={n_tags} postiz={p_tags}  {label}"
        )
    return out


def inspect_postiz_media_capability(posts: list[dict[str, Any]]) -> dict[str, Any]:
    """Inspect GET /posts payload for media fields. Do not guess counts."""
    mediaish = ("image", "images", "media", "video", "videos", "file", "files", "assets", "path")
    found_fields: set[str] = set()
    sample_keys: set[str] = set()
    for p in posts:
        sample_keys.update(p.get("raw_keys") or [])
        for k in p.get("raw_keys") or []:
            if k.lower() in mediaish or any(m in k.lower() for m in mediaish):
                found_fields.add(k)
    return {
        "list_keys": sorted(sample_keys),
        "media_fields_on_posts": sorted(found_fields),
        "available": bool(found_fields),
    }


def main() -> int:
    print("Akal Mesin sync check (read-only)")
    print(f"Notion DB: {NOTION_DB}")
    print(f"Postiz channel: {AKAL_MESIN_ID} (Akal Mesin only)")
    print(f"Window: last {LOOKBACK_DAYS}d → next {LOOKAHEAD_DAYS}d")
    print("---")

    postiz_key, notion_token = require_env()
    now = datetime.now(UTC)
    start = now - timedelta(days=LOOKBACK_DAYS)
    end = now + timedelta(days=LOOKAHEAD_DAYS)

    try:
        raw_posts = fetch_postiz(postiz_key, start, end)
    except Exception as e:
        die(f"Postiz fetch failed: {e}")
    try:
        raw_rows = fetch_notion(notion_token)
    except Exception as e:
        die(f"Notion fetch failed: {e}")

    posts = [postiz_view(p) for p in raw_posts]
    rows = []
    for r in raw_rows:
        v = notion_row_view(r)
        if v["when"] is None or (start <= v["when"] <= end):
            rows.append(v)

    print(
        f"Fetched: {len(rows)} Notion Scheduled/Published (in window), "
        f"{len(posts)} Postiz posts on Akal Mesin"
    )

    # Asset capability probe (from live GET /posts shape)
    media_cap = inspect_postiz_media_capability(posts)
    print()
    print("ASSET CHECK")
    print(f"  GET /posts fields seen: {', '.join(media_cap['list_keys']) or '(none)'}")
    if media_cap["available"]:
        print(f"  media-related fields: {media_cap['media_fields_on_posts']}")
    else:
        print(
            "  asset check unavailable — GET /posts does not return image/media/path "
            "arrays per post (only content HTML, publishDate, state, settings, …). "
            "GET /posts/<id> is 404. Cannot verify slide count, order, or .mp4 vs PNG "
            "against Notion Assets from the public API."
        )
        print(
            "  Notion-side note (informational, not a Postiz verify): Format "
            "'Reel / video' rows still list PNG Assets (carousel art); the reel "
            ".mp4 lives in the page body / repo, so Asset filename checks alone "
            "cannot prove a reel was queued."
        )

    print()
    conflicts: list[str] = []

    # Postiz ERROR
    for p in posts:
        if p["state"] == "ERROR":
            conflicts.append(
                f"POSTIZ_ERROR  {fmt_wib(p['when'])}  id={p['id']}  "
                f"err={p['error']!r}  {p['title_guess']!r}"
            )

    # Duplicate QUEUE slots
    queue = sorted([p for p in posts if p["state"] == "QUEUE"], key=lambda x: x["when"])
    for i in range(len(queue)):
        for j in range(i + 1, len(queue)):
            if same_slot(queue[i]["when"], queue[j]["when"]):
                conflicts.append(
                    f"DOUBLE_SLOT  {fmt_wib(queue[i]['when'])}  "
                    f"{queue[i]['id']} + {queue[j]['id']}"
                )

    # Notion Scheduled in the past
    for n in rows:
        if (
            n["status"] == "Scheduled"
            and n["when"] is not None
            and n["when"] < now - timedelta(minutes=15)
        ):
            conflicts.append(
                f"NOTION_PAST_SCHEDULED  {fmt_wib(n['when'])}  {n['title']!r}  id={n['id']}"
            )

    matched_posts: set[str] = set()
    matched_rows: set[str] = set()
    caption_ok = 0
    caption_bad = 0

    for n in rows:
        if n["when"] is None:
            conflicts.append(
                f"NOTION_NO_DATE  status={n['status']}  {n['title']!r}  id={n['id']}"
            )
            continue
        cands = [p for p in posts if match_pair(n, p)]
        if not cands:
            time_cands = [p for p in posts if same_slot(n["when"], p["when"])]
            if time_cands:
                p = time_cands[0]
                conflicts.append(
                    f"CAPTION_MISMATCH  notion={fmt_wib(n['when'])} {n['title']!r}  "
                    f"postiz={fmt_wib(p['when'])} id={p['id']} {p['title_guess']!r}"
                )
                matched_posts.add(p["id"])
                matched_rows.add(n["id"])
            else:
                conflicts.append(
                    f"NOTION_MISSING_IN_POSTIZ  {fmt_wib(n['when'])}  "
                    f"status={n['status']}  {n['title']!r}  id={n['id']}"
                )
            continue

        cands.sort(key=lambda p: (0 if p["key"] == n["key"] else 1, abs(p["when"] - n["when"])))
        p = cands[0]
        matched_posts.add(p["id"])
        matched_rows.add(n["id"])

        if abs(n["when"] - p["when"]) > timedelta(minutes=1):
            conflicts.append(
                f"TIME_MISMATCH  notion={fmt_wib(n['when'])}  postiz={fmt_wib(p['when'])}  "
                f"{n['title']!r}  postiz_id={p['id']}"
            )

        # (2) For PUBLISHED Postiz, report diff vs Notion Publish date in minutes
        if p["state"] == "PUBLISHED":
            diff_min = int(round((p["when"] - n["when"]).total_seconds() / 60.0))
            if diff_min != 0:
                conflicts.append(
                    f"PUBLISH_DATE_DRIFT  diff={diff_min:+d}min  "
                    f"notion={fmt_wib(n['when'])}  postiz={fmt_wib(p['when'])}  "
                    f"{n['title']!r}  postiz_id={p['id']}"
                )

        if n["status"] == "Published" and p["state"] != "PUBLISHED":
            conflicts.append(
                f"STATUS_NOTION_PUB_POSTIZ_NOT  notion=Published  postiz={p['state']}  "
                f"{fmt_wib(n['when'])}  {n['title']!r}  postiz_id={p['id']}"
            )
        if p["state"] == "PUBLISHED" and n["status"] != "Published":
            conflicts.append(
                f"STATUS_POSTIZ_PUB_NOTION_NOT  notion={n['status']}  postiz=PUBLISHED  "
                f"{fmt_wib(p['when'])}  {n['title']!r}  postiz_id={p['id']}"
            )

        # (1) full caption comparison
        cap_issues = compare_captions(n, p)
        if cap_issues:
            caption_bad += 1
            conflicts.extend(cap_issues)
        else:
            caption_ok += 1

        # (3) asset check — only if Postiz exposed media (it currently does not)
        if media_cap["available"]:
            # placeholder for future: compare counts if fields appear
            conflicts.append(
                f"ASSET_CHECK_TODO  media fields present but comparer not wired: "
                f"{media_cap['media_fields_on_posts']}"
            )

    for p in posts:
        if p["id"] in matched_posts:
            continue
        if p["state"] == "QUEUE":
            conflicts.append(
                f"POSTIZ_QUEUE_NO_NOTION  {fmt_wib(p['when'])}  id={p['id']}  "
                f"{p['title_guess']!r}"
            )
        elif p["state"] == "PUBLISHED":
            conflicts.append(
                f"POSTIZ_PUBLISHED_NO_NOTION  {fmt_wib(p['when'])}  id={p['id']}  "
                f"{p['title_guess']!r}"
            )
        elif p["state"] == "DRAFT":
            conflicts.append(
                f"POSTIZ_DRAFT  {fmt_wib(p['when'])}  id={p['id']}  {p['title_guess']!r}"
            )

    if conflicts:
        print(f"CONFLICTS ({len(conflicts)}):")
        for line in conflicts:
            print(f"  • {line}")
    else:
        print("CONFLICTS: none")

    print()
    print("SUMMARY")
    print(f"  now                 {fmt_wib(now)}")
    print(f"  notion_rows         {len(rows)}")
    print(f"  postiz_posts        {len(posts)}")
    print(f"  matched             {len(matched_rows)}")
    print(f"  caption_ok          {caption_ok}")
    print(f"  caption_with_issues {caption_bad}")
    print(f"  conflicts           {len(conflicts)}")
    by_state: dict[str, int] = {}
    for p in posts:
        by_state[p["state"]] = by_state.get(p["state"], 0) + 1
    print(f"  postiz_by_state     {by_state}")
    print(
        f"  asset_check         "
        f"{'available' if media_cap['available'] else 'unavailable (GET /posts has no media)'}"
    )

    return 1 if conflicts else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        sys.exit(130)
