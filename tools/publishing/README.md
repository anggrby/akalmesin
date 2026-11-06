# Akal Mesin Notion ↔ Postiz sync check

Read-only health check. Compares **Akal Mesin Content Schedule** in Notion with posts on the **Akal Mesin** Postiz channel. Never writes to either side. Never prints API keys.

## Run

```bash
python3 /workspace/akalmesin-sync-check/check.py
```

Exit `0` = no conflicts, `1` = conflicts (or missing env / fetch error).

## Env

| Variable | Purpose |
|---|---|
| `POSTIZ_SELFHOST_API_KEY` | Postiz public API key (header `Authorization`) |
| `NOTION_TOKEN` | Notion internal integration secret |

If `NOTION_TOKEN` is missing: create an integration at https://www.notion.so/my-integrations , then share database `405f909f-26a5-8057-ad0a-e9562fe9c915` with it (••• → Connections).

## What it checks

### Matching & schedule
- Notion Scheduled/Published with no Postiz post at that time (+ caption prefix)
- Postiz QUEUE / PUBLISHED / DRAFT with no Notion row
- Time mismatch (>1 min within a 5-min slot)
- Postiz ERROR; two QUEUE posts in the same slot
- Notion Scheduled with Publish date in the past
- Status drift: Notion Published ↔ Postiz PUBLISHED

### Captions (full)
- Normalize Notion Caption and Postiz HTML (`<p>` / `<br>`) to paragraphs
- Paragraph-count and per-paragraph text diffs
- Missing blank-line separators (empty `<p></p>` between content paragraphs)
- Hashtag list mismatch or count &gt; 5
- Older Postiz posts that store caption as plain text (no `<p>` tags) are flagged `CAPTION_NOT_HTML_P` even if paragraph text matches

### Publish time (PUBLISHED only)
- Diff in minutes between Postiz `publishDate` and Notion Publish date (printed in WIB)

### Assets / media — **asset check unavailable**
`GET /posts` for this Postiz build returns only:
`id, content, publishDate, releaseURL, releaseId, state, error, intervalInDays, group, creationMethod, settings, tags, integration`.

There is **no** `image` / `media` / path list on each post. `GET /posts/<id>` is 404. A separate `GET /media` lists uploads but does not link them to a post id.

So the script **cannot** verify:
- carousel slide count vs Notion Assets
- slide filenames or order
- that a Reel / video post has exactly one `.mp4` (and no PNGs)

Notion Format `Reel / video` rows still store PNG Assets (carousel art); the reel file lives on the page body / repo. Even a Notion-only asset count would not prove the queued Postiz media.

If a future Postiz API version exposes media on the post, the script will detect media-related keys and stop printing “unavailable”.

## Window & channel

Last 7 days → next 30 days. Channel filter: `cmvpfx9sm0009po858rtcbrh6` only. Times in WIB.


## Scheduler (`schedule.py`)

Schedules Notion rows with Status **Ready to Publish** onto Postiz **Akal Mesin only**. It always dry-runs first (no writes, no schema changes). Angger must approve the resulting plan explicitly before any real schedule is created. The script itself has no authority to infer that approval.

```bash
# Plan only (safe):
export POSTIZ_API_URL='https://YOUR-POSTIZ-HOST/api/public/v1'
export POSTIZ_SELFHOST_API_KEY='...'
export NOTION_TOKEN='...'
python3 tools/publishing/schedule.py
# Optional dry-run: --row <notion-page-id> --at "YYYY-MM-DD HH:MM" (WIB).

# Create a DRAFT after the relevant posting work has been requested:
python3 tools/publishing/schedule.py --apply --draft
# Queue the exact approved plan; no "now" mode exists:
python3 tools/publishing/schedule.py --apply --schedule --approved-by-angger
# Offline unit checks:
python3 tools/publishing/schedule.py --self-test
```

### Behaviour
- Time precedence per row: Notion **Publish date**, then `--at`, then the next free **09:00, 13:00, 19:00 WIB** standing slot. A planned/passed date within 10 minutes refuses; it is not silently moved. Horizon for fallback: three days. Never `type=now`.
- `--row` requires `Ready to Publish`; every selected row is checked again before apply. `--at` requires one row and is ignored whenever a Publish date exists.
- `--apply` requires `--draft`, or `--schedule` with `--approved-by-angger`. Isolated run mode does not establish authority; it records the operator's acknowledgement of Angger's prior explicit plan approval.
- Body caption length (only paragraphs before `Sumber:` and the hashtag paragraph) is **warning only** above 100 words. More than 5 hashtags is a hard skip. Captions remain verbatim; HTML has an empty `<p></p>` between paragraphs.
- Carousel PNGs use Notion Assets order with fresh URLs. Reel / video uses only the **first `.mp4` in Notion Assets**, downloaded fresh. No hardcoded path, title-token finder or local-video override. Missing MP4 is a hard skip. Instagram 1.47.0's provider DTO allows only `post` or `story`; a single mp4 as `post` publishes as a Reel, so no unsupported `reel` literal is sent.
- Duplicate prevention matches stored Postiz ID or **full normalized caption** on the complete non-deleted Postiz history through the planning horizon, at any state/time, including past ERROR/DRAFT; ambiguous full caption matches refuse.
- On create, `Postiz ID` (rich_text) is written to Notion and the row becomes Scheduled (non-draft only). Postiz post state and exact date are verified. Channel `cmvpfx9sm0009po858rtcbrh6` only.

## Automatic Postiz → Notion status sync (`akalmesin_sync.py`)

`tools/publishing/deploy/akalmesin-status-sync.timer` runs the companion service
on a self-hosted Postiz server every **5 minutes**, as its unprivileged service
account. The script reads Postiz but never creates, deletes or reschedules posts.
Apply mode changes only Notion. The scheduler and sync never infer that Postiz
ERROR proves a post did not go live.

```bash
# Local read-only, then self-test:
python3 tools/publishing/akalmesin_sync.py
python3 tools/publishing/akalmesin_sync.py --self-test
# Explicit one-time ID-only backfill, without Status/Info/Publish-date updates:
python3 tools/publishing/akalmesin_sync.py --lock-file /run/lock/akalmesin-status-sync.lock --backfill-ids --apply
```

- Matches stored **Postiz ID** first. Otherwise requires one full normalized caption (HTML tags and whitespace normalized), never a prefix. Time disambiguates only identical full captions. Ambiguous candidates are skipped. Empty captions never use time-only matching.
- The timer writes a missing Postiz ID, then maps PUBLISHED to Published, ERROR to Error with its reason in Info, and copies a changed date. QUEUE changes only metadata/date, not status. Info and published/derived dates use Asia/Jakarta (+07:00).
- **Published and Archived are terminal/protected during every status poll**; trashed pages are too. Normal apply cannot change any of their fields. The explicit `--backfill-ids` mode is metadata-only and may fill missing IDs on exactly-matched protected rows.
- A second read right before each Notion PATCH prevents overriding concurrent manual decisions. Every write is read back. There are no blind retries of any external create operation.
- Shared `flock` defaults to `/run/lock/akalmesin-status-sync.lock`. The service explicitly passes that same file and uses systemd `ExecStartPre` directives (executed as root despite the service `User=`) to create/chown it for `angger` before starting the unprivileged Python process. `PrivateTmp=true` is retained; `ReadWritePaths=/run/lock` makes the lock path writable under `ProtectSystem=strict`. Manual runs use the same default, not private `/tmp`.
- Schema: `Info` rich_text and Status `Error` were added on 6 Nov 2026; `Postiz ID` rich_text is created idempotently by the scheduler/sync apply path. Postiz public API base URL is configured using `POSTIZ_API_URL`, with credentials only in the server's private environment file.
- On servers where `/run/lock` is not group-writable by the service user, `ExecStartPre` runs with full system privileges notwithstanding `User=`; this is a conscious narrow exception for the service unit's lock setup. Use a separate provisioned group/ACL if stricter privilege isolation is required.

### Provider and false-error limitation

The installed provider's `InstagramDto.post_type` checked in Postiz **1.47.0** and
in the running container is `@IsIn(['post', 'story'])`; there is no accepted
`reel` value. `media_publish` can return Instagram error 2207051 even when media
did publish. Such an ERROR becomes Error + Info, except that existing Published
or Archived rows remain untouched. Confirm Instagram manually in that case.

### Files and operations

Runtime scripts and private credentials live outside the tracked repository on the server. Units are `/etc/systemd/system/akalmesin-status-sync.{service,timer}`. Commit `deploy/` unit templates, never a live env file, key or Postiz URL. Use `systemctl list-timers`, `systemctl status`, and `journalctl` to inspect the unit; expose no environment values. Deployment is fully programmatic; no agent or paused routine is required.
