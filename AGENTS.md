# Working on akalmesin

This repo makes Instagram carousels for **akalmesin**, an Indonesian tech-news account run by Angger. It covers one job: taking a post from his request to an approved Notion entry. It never publishes or schedules anything.

**Source of truth for the pipeline:** [docs/workflow.md](docs/workflow.md). This file is only the router and non‑negotiables. Do not load an external editorial skill; the checkout is enough.

## Task router

| Ask                        | Open next                                                                                                              | Do                                                                                            |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| New post / “tonight”       | [docs/workflow.md](docs/workflow.md) (single-pass)                                                                     | `npm run post:new` → research → fill `post.json` + `sources.md` → `npm run review:build`      |
| Voice / caption            | [brand/voice.md](brand/voice.md), [Terra](brand/examples/terra/README.md), [feedback log](brand/style-feedback-log.md) | Draft Indonesian copy into `post.json`                                                        |
| Visuals / crops            | [brand/design.md](brand/design.md), [brand/tokens.json](brand/tokens.json)                                             | Assets in `assets/originals/`; process in `post.json`; never invent sheet values              |
| Owner Simpan or chat paste | workflow § single-pass                                                                                                 | Prefer `review:serve` (Simpan writes `edits/`); else save under `edits/`, then `review:apply` |
| Export to Notion           | workflow § final → Notion                                                                                              | Only after current copy + final; `npm run export -- <slug>`                                   |
| Change a rule              | The file that owns it + [docs/decisions.md](docs/decisions.md)                                                         | Update both; do not invent parallel playbooks                                                 |

## The flow (single-pass; details in workflow.md)

| #   | Step                                                                      | Command                                       | Gate                         |
| --- | ------------------------------------------------------------------------- | --------------------------------------------- | ---------------------------- |
| 1   | Angger asks for a post                                                    | `npm run post:new -- <slug> --category AI`    | —                            |
| 2   | Research: fill `sources.md` and `post.json` (copy + images)               | —                                             | —                            |
| 3   | Build review HTML (real slides + blue ink)                                | `npm run review:build -- <slug>`              | records **no** approval      |
| 4   | He reviews via `review:serve` (Simpan → `edits/`), the HTML file, or chat | `npm run review:serve -- <slug>`              | —                            |
| 5   | Apply his Simpan / chat-equivalent `edits.json`                           | `npm run review:apply -- <slug> <edits.json>` | passing apply = copy + final |
| 6   | Export to Notion when he says so                                          | `npm run export -- <slug>`                    | needs current copy + final   |

Legacy two-gate commands (`copy:review`, `copy:record`, `design:build` alone, separate `approve` for copy/final) remain in the repo for old posts; **do not use them for new work** unless workflow.md says otherwise.

## Rules that are not negotiable

- **Default flow is single-pass review** (table above). See docs/workflow.md.
- **Approvals are his verbatim words**, or a passing `review:apply` of his Simpan / chat-equivalent edits file (`Saved in review editor …`). Positive feedback ("so far so good") is not an approval, and neither is a draft that already exists. Never paraphrase his words.
- Any copy change clears the copy and final approvals (`copy:record` / `review:apply` handle this). Any design change, including a token or post.css change, makes final stale (the hashes catch it).
- Write the copy in his voice: [brand/voice.md](brand/voice.md). Before writing, read the [Terra example](brand/examples/terra/README.md) and the [feedback log](brand/style-feedback-log.md). Visual rules live in [brand/design.md](brand/design.md); every design value comes from [brand/tokens.json](brand/tokens.json), transcribed from his measured sheets in `brand/references/design-values-*.png`. Never guess a value that is not on a sheet; add it under `unmeasured`. Slide layouts: `main`, `detail1`, `detail2`, `quote` (optional, only for an important quote from a person in the news, with that person's own photo; no masthead, no photo credit; see brand/design.md). Main/Detail images start where the copy ends and their height follows the copy. All checks are deterministic code.
- Notion: `npm run export -- <slug>` finds the page by its body marker, creates or updates it, uploads the PNGs, verifies them by SHA-256 and writes the receipt. Re-running never makes a second page. The connector route is only a fallback (docs/workflow.md). Post only to the akalmesin database.
- Never publish, schedule, push to a remote, or message anyone without his explicit instruction. Neither Export nor Notion grants that.
- Secrets live only in the environment (`NOTION_UPLOAD_TOKEN`) or in the git-ignored `.env.local`. Never print them, paste them into chat, or put them in a tracked file.
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
```

To use a Chrome you already have, set `AKALMESIN_CHROME_PATH`, for example `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`. Nothing else is machine-specific: every path resolves from the repo root.

## Cursor Cloud specific instructions

Cloud agents install from [`.cursor/environment.json`](.cursor/environment.json), which runs [`.cursor/install.sh`](.cursor/install.sh): `npm ci`, the Playwright Chromium build the renderer expects, and that browser’s system libraries. After install, `npm run doctor` and `npm test` are the checks. `NOTION_UPLOAD_TOKEN` is only required for `npm run export`.

## Layout

`brand/` covers voice, design, tokens (`tokens.json`, the single source), fonts, logos, the policy numbers and the Terra example. `templates/` holds `copy.md` plus the HTML slide, CSS and editor. `scripts/` has one file per command, plus `core.mjs` (shared), `quality.mjs` (editorial checks) and `blue-ink.mjs` (the treatment). `content/posts/DATE-slug/` holds `post.json`, `sources.md`, `workflow.json`, `edits.log.md`, `edits/` (his Simpan files), `assets/{originals,processed,PROVENANCE.md}` and `out/` (generated; only build/check/manifest JSON is tracked). `research/news/` holds the shortlists.
