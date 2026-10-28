# Workflow

This file owns the steps, the gates, and the Notion recipe. Writing rules live in [brand/voice.md](../brand/voice.md), visual rules in [brand/design.md](../brand/design.md), and the reasons behind both in [decisions.md](decisions.md). Times are always reported in WIB.

## Gates

There are three separate decisions, each recorded with Angger's **verbatim** words, the chat id, and the message time:

| Gate | Approves | Revision it is bound to | Cleared by |
|---|---|---|---|
| `selected` | the story and angle | — | — |
| `copy` | every visible word: headline, summary, details, credits, caption, plus the title | `copyRevision` (hash of the editable fields + caption + title) | any `copy:record` that changes text |
| `final` | the complete post: copy, images, crops, alt text, layout | `designRevision` (hash of post.json + processed images) | any change to post.json or the images; a rebuild with a different result |

General praise is not an approval. Neither is an existing draft, nor an edit file. "Approved. Export that into notion" is both a final approval and an instruction to export; it never covers publishing or scheduling. Every approval, invalidation, build and record is appended to `workflow.json → history`.

## 1. Request → `post:new`

`npm run post:new -- kimi-k3-1-pro --category AI --title "…" [--date 2026-10-28]` creates `content/posts/2026-10-28-kimi-k3-1-pro/`. If he picked from a shortlist, record that with `npm run approve -- <slug> --gate selected --words "…" --source "chat tNNu" --at <ISO time of his message>`.

## 2. Research

Shortlists go in `research/news/YYYY-MM-DD.md` as text: sources, dates, relevance and caveats. For the chosen story, fill in `sources.md` (a claim → status → source table; hedge anything that is only a vendor claim) and download originals into `assets/originals/` (never edit them). Add a row per slide to `assets/PROVENANCE.md`. Every slide needs a different relevant image, and the Main image may not be reused.

## 3. Copy proposal

Draft with [templates/copy.md](../templates/copy.md), then put it in `post.json`. Each slide carries `plannedImage` (what the placeholder shows), `credit`, `alt` and `imageSource` (`originalFile`, URLs, supplier, `process: {crop:[x,y,w,h], pad:{aspect,bg,marginX}, maxWidth}`). Run `npm run copy:review -- <slug>` and paste `out/copy-proposal.md` into chat. It lists any rule warnings.

## 4. Text review in the placeholder editor

Send him `out/copy-review.html`. It is a single file with no server: open it, click any text to edit, press Ctrl/⌘+B for bold (detail paragraphs only, saved as `**…**`), Enter in the headline for a line break, and paste comes in as plain text. Drafts autosave in the browser. The word count and the warnings follow the same rules as `design:check`. **Simpan** downloads `<slug>-edits-<time>.json`, which he sends back.

## 5. Record his edits

Save his file to `edits/` and run `npm run copy:record -- <slug> content/posts/<slug>/edits/<file>.json --who "Angger"`.

- It refuses a file made against an older revision, so it never overwrites newer text. If that happens, regenerate the editor and ask again.
- It applies only the fields he changed. The title follows the Main headline.
- It appends to `edits.log.md` the WIB time and, per field, only the changed sentences, with word-level `−"old" +"new"` runs.
- It clears the copy and final approvals. A file saved from the design editor (`mode: design`) also marks the design stale.

Recheck any changed factual claim against `sources.md`. Point out conflicts with the brand rules (with his words) instead of silently "fixing" his text. Then record `--gate copy` with his words. Agent-only fixes that are not copy (alt text, for example) are edited directly and logged as a separate entry in `edits.log.md`.

## 6. Design → `design:build`

This step requires a current copy approval. It applies the blue ink to every original using its `process` crop and pad (see `scripts/blue-ink.mjs`), saving the result to `assets/processed/<id>-blue-ink.png`, and renders each slide in Chromium at 1080×1350 with network access blocked. Before taking each screenshot it checks the layout: canvas size, text inside the canvas with no overflow, a 54 px text-to-photo gap, a photo of at least 360 px that reaches the bottom, a white left-aligned credit inside the photo, both bundled fonts loaded, and no placeholder. It writes `out/png/NN-id.png`, `out/contact-sheet.png`, `out/<slug>.html` (the final HTML: one file, images embedded, also editable with Simpan in design mode) and `out/build.json`.

## 7. Check → `design:check`

This step fails if:

- the build is stale, or the copy approval is missing or stale;
- editorial errors remain;
- the PNG count, order, size or hash is wrong;
- an image doesn't sit on the blue-ink ramp (at least 95 % of pixels within 22 RGB units and a mean distance of no more than 12);
- a geometry rule is broken;
- the overflow guard doesn't fire;
- the final HTML is over 20 MB.

It writes `out/check.json`. Look at the contact sheet yourself before sending anything.

## 8. Final approval → Notion

Send `out/<slug>.html` and the contact sheet. When he approves, run `npm run approve -- <slug> --gate final --words "…" --source "chat tNNu" --at …`. This requires a passing, current check.

Then follow the Notion recipe:

1. `npm run export -- <slug> --dry-run` writes `out/notion-manifest.json`: the properties, the body markdown, the ordered asset hashes, and the body marker `akalmesin-content-id:akalmesin:<slug>`. It refuses to run without a current final approval.
2. With the **Notion connector**, work only in data source `405f909f-26a5-8029-8e7a-000b3f2a28a4` (database `405f909f-26a5-8057-ad0a-e9562fe9c915`). First use `workflow.json → notion.pageId` if one exists. Otherwise query the data source and read page bodies for the exact marker; never match by title alone.
3. Create or update the page with these properties: `Post` = title, `Status` = **Ready to Publish**, `Format` = Carousel (Single image for a single slide), `Caption`, `Topic` = category (AI/Robotika/Komputasi/Chip/Software). Leave `Publish date` empty. The body is the manifest's `body`. Keep any human notes and publishing fields that are already on the page.
4. Run `NOTION_UPLOAD_TOKEN=… npm run export -- <slug> --attach --page <page id>`. It uploads the PNGs in order to `Assets` (create upload → send → PATCH → read back the order). The token comes from the environment and is never printed.
5. Read the page back with the connector (title, status, marker, asset names in order), then run `npm run export -- <slug> --record --page <id> --url <url>`.

If a create or upload ended uncertainly, look the page up by its marker before trying again. Never repeat a create blindly. Notion delivery does **not** authorize publishing to Instagram or scheduling in Postiz; that happens separately, only after he gives a date and time in WIB.

## Changes after approval

If he edits text in the final HTML (mode design), go back to step 5, then rebuild and recheck. For a new image or crop, edit `post.json`, log it in `edits.log.md`, then rebuild and recheck. Either way, final needs his words again. Once a page is delivered, a changed post means updating the same Notion page (step 8.2 finds it).

## Outside this repo

The repo stops at Notion. These rules come verbatim from the old workflow, kept for the separate publisher bot and for measurement (see OPEN-QUESTIONS 6).

### Separate publishing handoff

After the approved Notion entry is **Ready to Publish**, the separate publisher bot creates a Postiz draft. It schedules only after the owner gives a date and time in **WIB**. Do not invent a time or treat Ready to Publish, Export, or this workflow as publication permission. Record the actual instruction and resulting state in `review.md`. Keep Postiz URLs, API keys, and tokens out of docs and the repo.

If the owner changes approved copy or assets, the publisher draft is stale until the Notion entry is updated and the owner confirms the schedule again. Drafting and Export do not run the publisher bot.

### Publication scorecard

After a real publication, save its permalink, actual publication timestamp/timezone, and scorecards at **24 hours** and **seven days** in the story's `review.md`. When a matching verified local Export exists, [compare later Notion edits](editor.md#compare-later-notion-edits) to propose observed differences for owner/context review; do not turn them into general rules automatically. Record observed Insights only; mark unavailable data as unavailable. Compare similar formats at similar ages and treat causal explanations as hypotheses.

| Measure | Record when available |
|---|---|
| Discovery | Non-follower reach or viewers |
| Reel attention | Average watch time and displayed retention |
| Sharing | Sends if shown separately; otherwise shares |
| Return value | Saves |
| Account interest | Profile visits |
| Growth | Attributed follows if available; otherwise clearly labeled account-level net growth |

Normalize by unique reach/viewers when both values exist. Do not equate shares with private sends, views with unique viewers, or account growth with one post's attributable follows. Do not assume slide-by-slide completion is available. Unapproved strategy proposals do not establish brand, cadence, or publishing rules.
