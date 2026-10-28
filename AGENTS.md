# Working on akalmesin

This repo makes Instagram carousels for **akalmesin**, an Indonesian tech-news account run by Angger. It covers one job: taking a post from his request to an approved Notion entry. It never publishes or schedules anything.

## The flow (details in [docs/workflow.md](docs/workflow.md))

| # | Step | Command | Gate |
|---|---|---|---|
| 1 | Angger asks for a post | `npm run post:new -- <slug> --category AI` | — |
| 2 | Research: fill `sources.md` and `post.json` | — | `approve --gate selected` with his words |
| 3 | Propose copy (text only) | `npm run copy:review -- <slug>` → paste `out/copy-proposal.md` | — |
| 4 | He edits in `out/copy-review.html` (grey placeholders) and presses **Simpan** | — | — |
| 5 | Record his file: applies it and logs a sentence/word diff | `npm run copy:record -- <slug> edits.json` | `approve --gate copy` with his words |
| 6 | Design: blue ink + render | `npm run design:build -- <slug>` | needs current copy approval |
| 7 | Check, then look at `out/contact-sheet.png` | `npm run design:check -- <slug>` | must pass |
| 8 | Send him `out/<slug>.html` plus the contact sheet | `approve --gate final`, then `npm run export -- <slug> --dry-run` → Notion | needs current final approval |

## Rules that are not negotiable

- **Approvals are his verbatim words.** Record them with `npm run approve -- <slug> --gate … --words "…" --source "chat tNNu"`. Positive feedback ("so far so good") is not an approval, and neither is a draft that already exists. Never paraphrase his words.
- Any copy change clears the copy and final approvals (`copy:record` handles this). Any design change makes final stale (the hashes catch it).
- Write the copy in his voice: [brand/voice.md](brand/voice.md). Before writing, read the [Terra example](brand/examples/terra/README.md) and the [feedback log](brand/style-feedback-log.md). Visual rules live in [brand/design.md](brand/design.md).
- Notion: create or update the page with the **Notion connector**, following the recipe in docs/workflow.md, then run `export --attach`. Post only to the akalmesin database, and look the page up by its body marker before creating one.
- Never publish, schedule, push to a remote, or message anyone without his explicit instruction. Neither Export nor Notion grants that.
- Secrets live only in the environment (`NOTION_UPLOAD_TOKEN`). Never print them or write them to a file.
- When a decision changes, update the file that owns it and add a dated entry to [docs/decisions.md](docs/decisions.md).

## Setup (macOS or Linux)

```sh
# Node 20+ (macOS: brew install node, or nvm/fnm; .node-version says 20)
npm ci
npx playwright-core install chromium   # same Chromium build the renderer expects
npm run doctor                          # Node, deps, Chromium, fonts, every post's gate status
npm test
```

To use a Chrome you already have, set `AKALMESIN_CHROME_PATH`, for example `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`. Nothing else is machine-specific: every path resolves from the repo root.

## Layout

`brand/` covers voice, design, tokens, fonts, logos, the policy numbers and the Terra example. `templates/` holds `copy.md` plus the HTML slide, CSS and editor. `scripts/` has one file per command, plus `core.mjs` (shared), `quality.mjs` (editorial checks) and `blue-ink.mjs` (the treatment). `content/posts/DATE-slug/` holds `post.json`, `sources.md`, `workflow.json`, `edits.log.md`, `edits/` (his Simpan files), `assets/{originals,processed,PROVENANCE.md}` and `out/` (generated; only build/check/manifest JSON is tracked). `research/news/` holds the shortlists.
