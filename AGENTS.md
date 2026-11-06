# Working on akalmesin

This repo makes Instagram carousels for **akalmesin**, an Indonesian tech-news account run by Angger. It takes a post from his request to an approved Notion entry and, through the explicit `schedule` command, an approved PNG Postiz post. The separate tools in `tools/publishing/` remain for reel-only scheduling, Notion/Postiz status sync and the publisher runbook; their gates are in `tools/publishing/README.md`. The separately authorized [Instagram growth worker](docs/instagram-growth.md) has its own runbook and does not change the editorial flow.

**Source of truth for the pipeline:** [docs/workflow.md](docs/workflow.md). This file is only the router and non‑negotiables. Do not load an external editorial skill; the checkout is enough.

## Task router

| Ask                        | Open next                                                                                                              | Do                                                                                                                                                                                                                                                               |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New post / “tonight”       | [docs/workflow.md](docs/workflow.md) (single-pass)                                                                     | `npm run post:new` → research → fill `post.json` + `sources.md` → `npm run review:build`                                                                                                                                                                         |
| Voice / caption            | [brand/voice.md](brand/voice.md), [Terra](brand/examples/terra/README.md), [feedback log](brand/style-feedback-log.md) | Draft Indonesian copy into `post.json`                                                                                                                                                                                                                           |
| Visuals / crops            | [brand/design.md](brand/design.md), [brand/tokens.json](brand/tokens.json)                                             | Assets in `assets/originals/`; process in `post.json`; never invent sheet values                                                                                                                                                                                 |
| Owner Simpan or chat paste | workflow § single-pass                                                                                                 | Prefer `review:serve` (Simpan writes `edits/`); else save under `edits/`, then `review:apply`                                                                                                                                                                    |
| Export to Notion           | workflow § final → Notion + Postiz                                                                                     | Only after current copy + final; `npm run export -- <slug>`                                                                                                                                                                                                      |
| Export + schedule          | workflow § final → Notion + Postiz                                                                                     | After current copy + final, `npm run schedule -- <slug>` schedules at Notion's Publish date and marks the row Scheduled; `--draft` creates an unscheduled Postiz draft and leaves Notion status unchanged; an uncertain create needs `--reconcile-post <postId>` |
| Notion-only handoff        | workflow § final → Notion + Postiz                                                                                     | `npm run export -- <slug>` never schedules; reel-only posts use this route (reel: `<slug>-reel.mp4` first), then `tools/publishing/`                                                                                                                             |
| Separate publisher tools   | [tools/publishing/README.md](tools/publishing/README.md)                                                               | Reel-only scheduling, Notion/Postiz status sync and the publisher runbook; those tools keep their own approval gates                                                                                                                                             |
| Change a rule              | The file that owns it + [docs/decisions.md](docs/decisions.md)                                                         | Update both; do not invent parallel playbooks                                                                                                                                                                                                                    |

## The flow (single-pass; details in workflow.md)

| #   | Step                                                                      | Command                                       | Gate                         |
| --- | ------------------------------------------------------------------------- | --------------------------------------------- | ---------------------------- |
| 1   | Angger asks for a post                                                    | `npm run post:new -- <slug> --category AI`    | —                            |
| 2   | Research: fill `sources.md` and `post.json` (copy + images)               | —                                             | —                            |
| 3   | Build review HTML (real slides + blue ink)                                | `npm run review:build -- <slug>`              | records **no** approval      |
| 4   | He reviews via `review:serve` (Simpan → `edits/`), the HTML file, or chat | `npm run review:serve -- <slug>`              | —                            |
| 5   | Apply his Simpan / chat-equivalent `edits.json`                           | `npm run review:apply -- <slug> <edits.json>` | passing apply = copy + final |
| 6   | Export and schedule when he says so                                       | `npm run schedule -- <slug>`                  | needs current copy + final   |

`npm run schedule` handles Notion and Postiz in one run for approved PNG posts. `npm run export -- <slug>` remains the Notion-only route and never schedules; reel-only posts use that route.

Legacy two-gate commands (`copy:review`, `copy:record`, `design:build` alone, separate `approve` for copy/final) remain in the repo for old posts; **do not use them for new work** unless workflow.md says otherwise.

## Rules that are not negotiable

- **Default flow is single-pass review** (table above). See docs/workflow.md.
- **Approvals are his verbatim words**, or a passing `review:apply` of his Simpan / chat-equivalent edits file (`Saved in review editor …`). Positive feedback ("so far so good") is not an approval, and neither is a draft that already exists. Never paraphrase his words.
- Any copy change clears the copy and final approvals (`copy:record` / `review:apply` handle this). Any design change, including a token or post.css change, makes final stale (the hashes catch it).
- Write the copy in his voice: [brand/voice.md](brand/voice.md). Before writing, read the [Terra example](brand/examples/terra/README.md) and the [feedback log](brand/style-feedback-log.md). Visual rules live in [brand/design.md](brand/design.md); every design value comes from [brand/tokens.json](brand/tokens.json), transcribed from his measured sheets in `brand/references/design-values-*.png`. Never guess a value that is not on a sheet; add it under `unmeasured`. Slide layouts: `main`, `detail1`, `detail2`, `quote` (optional, only for an important quote from a person in the news, with that person's own photo; no masthead, no photo credit; see brand/design.md). Main/Detail images start where the copy ends and their height follows the copy. All checks are deterministic code.
- Notion: `npm run export -- <slug>` finds the page by its body marker, creates or updates it, uploads the PNGs, verifies them by SHA-256 and writes the receipt. Re-running never makes a second page. The connector route is only a fallback (docs/workflow.md). Post only to the akalmesin database.
- Postiz: schedule only to the enabled `akalmesin` (`Akal Mesin`) `instagram-standalone` channel. Re-running `schedule` updates the stored post and never modifies a published one. A schedule instant must still be at least 60 seconds ahead at the final check immediately before `POST /posts`; an uncertain create is recorded before submission and needs `--reconcile-post <postId>`, verified against the pending group and akalmesin channel, never a blind retry; `--draft` refuses a post the server reports as `QUEUE`. Reel-only scheduling is blocked until its video payload is implemented and tested.
- Never publish immediately, push to a remote, or message anyone without his explicit instruction. Scheduling happens only through the explicit `npm run schedule -- <slug>` command after current copy + final; `design:build`, `export`, and Notion delivery never trigger it. The command may use Notion's auto-assigned Publish date without another WIB confirmation (owner decision, 6 Nov 2026). `tools/publishing/` retains its own explicit `--approved-by-angger` gate for reel-only scheduling, status sync and its separate runbook.
- Secrets live only in the environment (`NOTION_UPLOAD_TOKEN`, `NOTION_TOKEN`, `POSTIZ_SELFHOST_API_KEY`, `POSTIZ_BASE_URL`, `POSTIZ_API_URL`, optional `POSTIZ_INTEGRATION_ID`) or in the git-ignored `.env.local`. Never print them, paste them into chat, or put them in a tracked file. Keep real Postiz URLs out of tracked docs and receipts.
- When a decision changes, update the file that owns it and add a dated entry to [docs/decisions.md](docs/decisions.md).

## Setup (macOS or Linux)

```sh
# Node 20+ (macOS: brew install node, or nvm/fnm; .node-version says 20)
npm ci
npx playwright-core install chromium   # same Chromium build the renderer expects
npm run doctor                          # Node, deps, Chromium, fonts, every post's gate status
npm test
npm run format:check               # Prettier; npm run format fixes everything
# Notion export token (once): put it in your shell profile or in .env.local (git-ignored)
#   echo 'NOTION_UPLOAD_TOKEN=<your token>' > .env.local && chmod 600 .env.local
# Combined scheduling also needs POSTIZ_SELFHOST_API_KEY and POSTIZ_BASE_URL there;
# POSTIZ_INTEGRATION_ID is optional when exactly one akalmesin instagram-standalone channel exists.
```

To use a Chrome you already have, set `AKALMESIN_CHROME_PATH`, for example `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`. Nothing else is machine-specific: every path resolves from the repo root.

## Layout

`brand/` covers voice, design, tokens (`tokens.json`, the single source), fonts, logos, the policy numbers and the Terra example. `templates/` holds `copy.md` plus the HTML slide, CSS and editor. `scripts/` has one file per command, plus `core.mjs` (shared), `quality.mjs` (editorial checks), `blue-ink.mjs` (the treatment) and `postiz.mjs` (the Postiz client used by `schedule`). `content/posts/DATE-slug/` holds `post.json`, `sources.md`, `workflow.json`, `edits.log.md`, `edits/` (his Simpan files), `assets/{originals,processed,PROVENANCE.md}` and `out/` (generated; only build/check/manifest JSON is tracked). `research/news/` holds the shortlists.
