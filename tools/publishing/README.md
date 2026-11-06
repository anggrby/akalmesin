# Akal Mesin Notion ↔ Postiz sync check

Read-only health check. Compares **Akal Mesin Content Schedule** in Notion with posts on the **Akal Mesin** Postiz channel. Never writes to either side. Never prints API keys.

## Run

```bash
python3 tools/publishing/check.py
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

Schedules Notion rows with Status **Ready to Publish** onto Postiz **Akal Mesin only**.

**Default is dry-run** (prints a plan, writes nothing).

```bash
# plan only (safe)
python3 tools/publishing/schedule.py

# actually create
python3 tools/publishing/schedule.py --apply

# drafts instead of schedule
python3 tools/publishing/schedule.py --apply --draft

# one row at an explicit WIB time
python3 tools/publishing/schedule.py --apply --row <notion-page-id> --at "2026-11-06 19:00"

# reel video path override
python3 tools/publishing/schedule.py --apply --row <id> --video /path/to/reel.mp4

# skip the 2-minute ERROR re-check
python3 tools/publishing/schedule.py --apply --no-wait

# offline unit checks
python3 tools/publishing/schedule.py --self-test
```

### Behaviour
- Slots: **09:00, 13:00, 19:00 WIB**, in Notion `created_time` order, next free future slot (skips slots &lt;10 minutes away or already taken by QUEUE/PUBLISHED on Akal Mesin). Never posts `type=now`.
- Horizon: next **3 days**; if more rows than free slots → stop with error.
- Caption: Notion text verbatim → `<p>…</p>` with empty `<p></p>` between paragraphs. Skip if &gt;5 hashtags or &gt;100 words (does not edit copy).
- Carousel: PNG Assets in filename order, fresh URLs, `POST /upload` then `POST /posts`.
- Reel / video: does **not** upload PNGs; looks for `/workspace/akalmesin-new/content/posts/<dir>/out/reel/reel.mp4` (title/slug match) or `--video`.
- Idempotent: skips if a future Postiz post already shares the caption start.
- After create: verify QUEUE/DRAFT + exact date; wait 2 minutes and re-check ERROR (unless `--no-wait`); then Notion Status **Scheduled** + Publish date `+07:00` (draft mode leaves Notion status alone).
- Channel: `cmvpfx9sm0009po858rtcbrh6` only. Exit `1` on any failure.


## Automatic Postiz → Notion status sync (`akalmesin_sync.py`)

**Live on the Postiz VPS** (`hh-sg-01`, `167.104.102.132`), running as the
unprivileged `angger` system user. The systemd timer
`akalmesin-status-sync.timer` runs `akalmesin-status-sync.service` every
**5 minutes**, every day (publishing is not a weekday-only operation).
The timer starts two minutes after boot and persists a missed run.

`akalmesin_sync.py` matches full normalized captions first, independent of date.
The former caption-prefix match supports legacy HTML/paragraph formatting, also
without requiring a date match. Only ambiguous or unavailable captions fall back
to the original nearby-time match; identical captions at the identical time are
skipped as ambiguous. Postiz access is **GET-only**.
Only matching rows with Status other than **Published** or **Archived** can change.
Trashed rows are also protected. Since the 6 November caption-first fix, queued
rows have their Publish date synchronized but their Status and Info are left alone.

| Postiz result | Notion Status | Notion `Info` (rich_text) |
|---|---|---|
| `PUBLISHED` | `Published` | cleared only if it held an earlier error |
| `ERROR` | `Error` | `Postiz: ` followed by the Postiz error (up to 2,000 characters) |
| `QUEUE` | unchanged | unchanged |

A matched post's Publish date is written with an explicit `+07:00` offset if it
differs by at least one minute. Published/Archived rows remain fully protected,
including dates; manual final-status corrections take precedence over Postiz.

A second read immediately before each Notion PATCH preserves concurrent manual
final-status decisions. Every apply run verifies the change by reading the row again.
Repeated polls are no-ops, and a lock prevents overlapping invocations. A failed poll
exits non-zero and is visible in the journal. `waiting` is normal for queued posts.

### Why a poller, not a web-hook receiver

The installed Postiz image reports **v1.47.0**. Its
`apps/orchestrator/src/activities/post.activity.ts` sends an unsigned JSON **array**
containing `id`, `content`, `publishDate`, `releaseURL`, `state` and integration
metadata, with no event type or error. Its
`post-workflows/post.workflow.v1.1.2.ts` calls `sendWebhooks` only on the successful
publishing path. It does **not** fire for `ERROR`, so a receiver alone cannot implement
the requested sync. The public API is used for both states instead; no extra public
HTTPS listener, Caddy route, or web-hook registration was added.

### The Binance exception

Postiz can report `ERROR` after Instagram actually published (the known example is
post `cmw3avitr000qmz81bfvp8s8f`). **Published and Archived are never overwritten**,
so Binance remains Published with its Instagram publication confirmed by Angger.
Automation alone cannot establish live-on-Instagram reality from Postiz's ERROR state;
keep the manual Published decision rather than changing it to Error. Future POSTIZ
`PUBLISHED` updates can turn an Error row back to Published and clear its Info.

### Notion schema setup (completed 6 Nov 2026)

- Added `Info` as `rich_text` using `PATCH /v1/databases/405f909f-26a5-8057-ad0a-e9562fe9c915`.
- Added **Error**, red, in **In progress** using Notion API version `2025-09-03`
  and `PATCH /v1/data_sources/405f909f-26a5-8029-8e7a-000b3f2a28a4`.
  All existing status option IDs, groups, and default option were preserved.
- Routine page updates use the same Notion API version `2022-06-28` as existing scripts.

### Live verification (6 Nov 2026, WIB)

- Offline self-test: disabled-channel rejection, caption/time matching, ERROR→Error+Info,
  PUBLISHED→Published, duplicate updates, Published/trash preservation: **passed**.
- Initial box read-only and apply runs: **0 changed, 0 failed, 14 protected, 3 waiting**.
- Live VPS dry-run with its own secrets: **0 changed, 0 failed, 14 protected, 3 waiting**.
- Initial systemd apply run: **passed**, no row changes required.
- Binance explicitly read as Published and protected despite its Postiz ERROR.

## Caption-first fix and provider investigation (6 Nov 2026, 10:45 WIB)

Postiz moved Aratasaurus from 13:00 to 10:30 WIB and NYT from 19:00 to 15:00
WIB. The former time-based matcher was silently waiting and never reconciling them.
The new matcher selects a unique caption first, regardless of time, and uses time
only for ambiguous fallback cases. `QUEUE` is now read so moved dates can be synced
before publishing. The actual run found the NYT post by caption and changed its
Notion date to `2026-11-06T15:00:00+07:00` while preserving `Scheduled`. A second
apply run had 0 changes. Aratasaurus and Binance remain manually Published at 10:30
and 09:00 WIB respectively, without error fields overwritten. The VPS systemd run
then succeeded with 0 changes.

### "Instagram blocked your request" despite both posts being live

Read-only inspection of the deployed Postiz 1.47.0 source and orchestration logs:
- `instagram.provider.ts` maps Meta response code `2207051` to that message.
- Container status (`igContainerStatus`) can throw it before publishing.
- `finalizePost` calls `igId/media_publish` at source line 1013; only after that
  returns a media ID does it call `igPermalink`. Standalone delegates the same code.
- `igPermalink` catches errors and returns a profile URL, so a failed permalink
  lookup cannot be this error. The optional `comment()` call also runs later.
- Both real orchestration error logs identify activity `finalizePost` and location
  `InstagramProvider.finalizePost (...instagram.provider.ts:1013:7)`, directly on
  `media_publish`, not a later permalink/insights/comment call.

Therefore the likely cause is **Premature API error / contradictory outcome at the
actual media_publish call**: Instagram published the media but returned code 2207051
instead of the normal media ID/JSON, so Postiz never obtained a release ID or URL and
classified it ERROR. This does not prove why Meta returned a contradictory outcome;
it is consistent with the exact source location and user's direct confirmation.
Insights was not part of this post-publish path. ERROR→Error+Info behavior was not
changed during this investigation.
- Until the next real publishing/error transition, the live end-to-end result is a
  verified no-op rather than a deliberately false test status.

### Files and operations

VPS directory `/home/angger/akalmesin-sync/` (mode `700`):
- `akalmesin_sync.py`: no third-party packages, Python 3
- `credentials.env`: private, mode `600`; contains existing API credentials, never committed or logged
- `akalmesin-status-sync.service`, `akalmesin-status-sync.timer`: local unit copies
- `README.md`: this document

Installed units: `/etc/systemd/system/akalmesin-status-sync.{service,timer}`.
Source of truth in-repo: `tools/publishing/` (systemd units under `tools/publishing/deploy/`).
After editing the local script, test and copy it to the VPS, then run a manual service
cycle. There is no dependency on an agent, the box, a browser, or the old paused routine.

```bash
# From the box: check schedule and recent live outcomes
ssh hh-sg-01 'systemctl list-timers akalmesin-status-sync.timer --no-pager'
ssh hh-sg-01 'journalctl -u akalmesin-status-sync.service -n 30 --no-pager'

# From the box: self-test or a read-only VPS run
ssh hh-sg-01 'python3 /home/angger/akalmesin-sync/akalmesin_sync.py --self-test'
ssh hh-sg-01 'set -a; . /home/angger/akalmesin-sync/credentials.env; set +a; python3 /home/angger/akalmesin-sync/akalmesin_sync.py'

# Locally (safe default: dry-run)
python3 tools/publishing/akalmesin_sync.py --self-test
python3 tools/publishing/akalmesin_sync.py

# Pause / resume this script-only routine
ssh hh-sg-01 'sudo -n systemctl stop akalmesin-status-sync.timer'
ssh hh-sg-01 'sudo -n systemctl start akalmesin-status-sync.timer'
```
