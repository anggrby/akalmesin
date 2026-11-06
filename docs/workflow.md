# Workflow

This file owns the steps, the gates, and the Notion recipe. Writing rules live in [brand/voice.md](../brand/voice.md), visual rules in [brand/design.md](../brand/design.md), and the reasons behind both in [decisions.md](decisions.md). Times are always reported in WIB.

## Gates

There are three separate decisions, each recorded with Angger's **verbatim** words, the chat id, and the message time:

| Gate       | Approves                                                                         | Revision it is bound to                                        | Cleared by                                                               |
| ---------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `selected` | the story and angle                                                              | —                                                              | —                                                                        |
| `copy`     | every visible word: headline, summary, details, credits, caption, plus the title | `copyRevision` (hash of the editable fields + caption + title) | any `copy:record` that changes text                                      |
| `final`    | the complete post: copy, images, crops, alt text, layout                         | `designRevision` (hash of post.json + processed images)        | any change to post.json or the images; a rebuild with a different result |

General praise is not an approval. Neither is an existing draft, nor an edit file. "Approved. Export that into notion" is both a final approval and an instruction to export; it never covers publishing or scheduling. Every approval, invalidation, build and record is appended to `workflow.json → history`.

## 1. Request → `post:new`

`npm run post:new -- kimi-k3-1-pro --category AI --title "…" [--date 2026-10-28]` creates `content/posts/2026-10-28-kimi-k3-1-pro/`. If he picked from a shortlist, record that with `npm run approve -- <slug> --gate selected --words "…" --source "chat tNNu" --at <ISO time of his message>`.

## 2. Research

Shortlists go in `research/news/YYYY-MM-DD.md` as text: sources, dates, relevance and caveats. For the chosen story, fill in `sources.md` (a claim → status → source table; hedge anything that is only a vendor claim) and download originals into `assets/originals/` (never edit them). Add a row per slide to `assets/PROVENANCE.md`. Every slide needs a different relevant image, and the Main image may not be reused.

## 3. Copy proposal

Draft with [templates/copy.md](../templates/copy.md), then put it in `post.json`. Each slide carries `plannedImage` (what the placeholder shows), `credit`, `alt` and `imageSource` (`originalFile`, URLs, supplier, `process: {crop:[x,y,w,h], pad:{aspect,bg,marginX}, maxWidth}`). Run `npm run copy:review -- <slug>` and paste `out/copy-proposal.md` into chat. It lists any rule warnings.

## 4. Text review in the placeholder editor

Send him `out/copy-review.html`. It is a single file with no server: open it, click any text to edit, press Ctrl/⌘+B for bold (detail paragraphs only, saved as `**…**`), Enter in the headline for a line break, and paste comes in as plain text. Drafts autosave in the browser. The word count and the warnings follow the same rules as `design:check`. **Simpan** downloads `<slug>-edits-<time>.json`, which he sends back.

To keep it small (~80 KB instead of ~430 KB, owner t61u) the editor embeds subset fonts from `templates/html/fonts/` (Manrope 300–700 and IBM Plex Mono 400, Latin + Latin-1 + Latin Extended-A + punctuation, woff2), made by `python3 scripts/fonts-subset.py` from `brand/fonts/`. If the copy uses a character the full Manrope has but the subset lacks, `copy:review` warns and embeds the full fonts. The design build, PNGs and the final HTML always use the full fonts.

## 5. Record his edits

Save his file to `edits/` and run `npm run copy:record -- <slug> content/posts/<slug>/edits/<file>.json --who "Angger"`.

- It refuses a file made against an older revision, so it never overwrites newer text. If that happens, regenerate the editor and ask again.
- It applies only the fields he changed. The title follows the Main headline.
- It appends to `edits.log.md` the WIB time and, per field, only the changed sentences, with word-level `−"old" +"new"` runs.
- It clears the copy and final approvals. A file saved from the design editor (`mode: design`) also marks the design stale.

Recheck any changed factual claim against `sources.md`. Point out conflicts with the brand rules (with his words) instead of silently "fixing" his text. Then record `--gate copy` with his words. Agent-only fixes that are not copy (alt text, for example) are edited directly and logged as a separate entry in `edits.log.md`.

## 6. Design → `design:build`

This step requires a current copy approval. It applies the blue ink to every original using its `process` crop and pad (see `scripts/blue-ink.mjs`), saving the result to `assets/processed/<id>-blue-ink.png`, and renders each slide in Chromium at 1080×1350 with network access blocked. Before taking each screenshot it checks the layout: canvas size, text inside the canvas with no overflow, the text-to-photo gap from brand/tokens.json (Main 64, Detail 54), a photo of at least 360 px that reaches the bottom, a white left-aligned credit inside the photo (Quote slides — optional, only for an important quote from a person in the news, photo of that person — instead: no masthead, no credit, block 56 px from the bottom and side insets, at most 3 statement lines), both bundled fonts loaded, and no placeholder. It writes `out/png/NN-id.png`, `out/contact-sheet.png`, `out/<slug>.html` (the final HTML: one file, images embedded, also editable with Simpan in design mode) and `out/build.json`.

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

### What the checks guarantee

- Every check is plain code: no AI/LLM, no network (Chromium runs with network blocked), no randomness. The blue-ink grain uses a seeded mulberry32 (seed 7).
- Same inputs → same verdicts and the same files. `builtAt` / `checkedAt` (and the workflow log timestamps) are the only varying outputs, and they never affect pass/fail. Tested: `checkPost` twice deep-equals, blue ink twice is byte-identical; Kimi built + checked twice gave identical PNG hashes and check.json minus `checkedAt`.
- Not covered: a different Chromium, sharp/libvips or font build on another machine can shift pixels and so PNG hashes (the verdicts are expected to hold; the PNG hash check compares against the same machine's build). The ink thresholds (95 % / mean 12) and other limits are fixed numbers we chose, not proof of good looks. Code cannot judge whether a photo is relevant or really shows the quoted person, whether facts are right, or the tone; that is the owner's copy and design review.

## 8. Final approval → Notion + Postiz

Send `out/<slug>.html` and the contact sheet. When he approves, run `npm run approve -- <slug> --gate final --words "…" --source "chat tNNu" --at …`. This requires a passing, current check.

Then export with one command (decision 2026-10-28, t50u):

```sh
npm run export -- <slug> --dry-run   # optional: writes out/notion-manifest.json, no network
npm run export -- <slug>             # or --post <slug>
```

`export` refuses without a current copy and final approval, then talks to Notion's REST API directly with `NOTION_UPLOAD_TOKEN` (from the environment or a git-ignored `.env.local`; never printed):

1. **Find.** `POST /v1/data_sources/405f909f-26a5-8029-8e7a-000b3f2a28a4/query` with `Notion-Version: 2025-09-03` (the database endpoint `POST /v1/databases/405f909f-26a5-8057-ad0a-e9562fe9c915/query` only works with the older `2022-06-28`). It reads every live page's body for the exact paragraph `akalmesin-content-id:<contentId>` (`contentId` defaults to `akalmesin:<slug>`). Never by title. More than one hit stops the run.
2. **Upload.** Each PNG, in slide order: `POST /v1/file_uploads` → `POST /v1/file_uploads/<id>/send` (multipart).
3. **Create or update.** No hit: `POST /v1/pages` with parent `data_source_id`. One hit: `PATCH /v1/pages/<id>` on the same page. Properties: `Post` = title (follows the Main headline), `Status` = **Ready to Publish**, `Format` = Carousel (Single image for one slide; **Reel / video** when `reel/reel.json` has `"publishAs": "reel-only"`, one format per story, owner t100u), `Caption` (split into ≤2000-character rich_text items), `Topic` from the category, 1:1 (AI, KOMPUTER, SAINS, PROGRAMMING, TUTORIAL AI, TEKNOLOGI; ROBOTIKA uses the existing "Robotika" option because Notion select names are case-insensitive), `Publish date` = the auto-planned slot below (on create only; `--no-publish-date` leaves it empty: on update `Status` and `Publish date` belong to the owner and are left as he set them), `Assets` = the uploads in order. The body is the marker, the manifest's `body`, then `akalmesin-managed-end`. On update only that managed range is replaced; human notes outside it stay.
4. **Verify.** Read the page back: properties, marker, asset names in order, and the SHA-256 of every downloaded file against the build.
5. **Receipt.** `workflow.json → notion` gets the page id, URL, created/updated, API version, hashes, `assetsMatchBuild` and the time in WIB.

429 and 5xx are retried with backoff. The page create is never retried blindly: re-running looks the page up by its marker first, so a second run updates and never duplicates. Pages made by the connector before this change (Terra, Anthropic, Kimi) have no `akalmesin-managed-end` line; `export` refuses to update them rather than guess, before writing anything.

**Publish date is auto-planned** (owner t127u): on create, export sets it to the next free slot. The slot times are the WIB times of the posts on the most recent day with a dated Ready to Publish / Scheduled / Published row (rows this repo auto-assigned do not count, so a batch fills one day in order). Exports take those times on the following day, skip slots any live row already holds and slots in the past, and roll over to later days. If the reference day has no timed rows, the times are 10:00 / 15:00 / 20:00 WIB. The value carries `+07:00`, appears in Posting notes (`Planned slot: … WIB (auto-assigned)`), the command output and the `workflow.json` receipt (`notion.publishDate`), and is read back. `--publish-at <ISO with offset>` overrides; `--no-publish-date` leaves it empty; `--next-slot` shows the next slot read-only. Updates never change an existing row's date. Notion-only export leaves this as a plan; the combined `schedule` command below uses the same instant for Postiz.

**Adopting a connector-made page (`--adopt-legacy`).** Only with the owner's go-ahead for that page. Needs `notion-legacy-body.json` in the post folder: the exact blocks the old export wrote (Kimi has it).

1. `npm run export -- <slug> --adopt-legacy --dry-run` reads the page (no writes, no uploads) and prints the plan: blocks recognised as generated (plain text equal to a block in `notion-legacy-body.json` or in the new body), **foreign** blocks (anything else, edited generated text, or blocks with children), the Assets it replaces, and the owner-managed Status / Publish date it keeps.
2. If any block is foreign, adoption refuses and lists them. Move a human note out by hand, or, with the owner's OK to delete it, list the exact ids: `--force-blocks id1,id2` (every foreign block must be listed).
3. `npm run export -- <slug> --adopt-legacy` deletes the generated (and listed) blocks, writes marker + body + `akalmesin-managed-end`, replaces Assets with the new ordered uploads, updates the properties except Status / Publish date, reads back and SHA-256-checks like a normal export, and writes the receipt (`action: adopted`, deleted block ids, previous asset names). Running it again is a normal update. The old files are detached from the row, not kept on it.

### Combined Notion + Postiz scheduling

For an approved single-image or carousel post, one intentional command performs the whole handoff:

```sh
npm run schedule -- <slug> --dry-run   # local validation and request preview; no network or writes
npm run schedule -- <slug> --draft    # Notion export + unscheduled Postiz draft; Notion status unchanged
npm run schedule -- <slug>            # Notion export + Postiz schedule + Notion Scheduled
# Optional on a new Notion row: --publish-at 2026-11-10T19:00:00+07:00
# After an uncertain Postiz create: --reconcile-post <postId>
```

The live scheduling command runs the same Notion export first, then uses the row's actual **Publish date** as the Postiz schedule instant. A new row uses the auto-planned slot above or `--publish-at`; an update uses the existing date, including a date Angger changed in Notion. Owner decision 6 November 2026 authorizes this command to schedule from the auto-planned slot without asking for a separate WIB time. `export`, `design:build`, and Notion delivery alone never schedule. A dry run cannot know a new auto-slot without querying Notion, so it displays a placeholder instead.

`--draft` performs the Notion export and creates or updates an unscheduled Postiz draft instead. It leaves Notion's status unchanged, does not require a future Publish date (a missing date becomes the request time), and records stage `postiz-draft`. It refuses to convert a Scheduled Notion row or an already scheduled Postiz post back into a draft, including a post the server reports as `QUEUE` even when the local receipt still says draft. Running without `--draft` later can schedule that stored draft by its post id.

After a matching, SHA-256-verified Notion export, `schedule`:

1. Selects only the enabled `akalmesin` channel whose identifier is `instagram-standalone` (Postiz displays it as `Akal Mesin`; the match ignores case and spacing). `POSTIZ_INTEGRATION_ID` can disambiguate duplicate channel names, but cannot select another account, platform, or disabled channel.
2. Uploads the approved PNGs in slide order through Postiz `POST /upload`, then sends one `type: schedule` request (or `type: draft` with `--draft`) to `POST /posts` with the verbatim Notion caption (sources and hashtags included). One to ten images are supported. Reel-only posts are refused before Notion or Postiz writes; use Notion-only export for those. For a schedule, the current time is checked again with a 60-second lead immediately before `POST /posts`; a date that expired or came too close during the Notion export or uploads is refused, no request is sent and no in-flight record is left behind.
3. Stores the Postiz post/group/integration ids, UTC schedule instant, approved revision, content id and upload ids/hashes in `workflow.json → postiz`. Upload paths needed for reuse stay in git-ignored `out/postiz-state.json`; the tracked receipt contains no API key, API base URL or upload URL. Credentials come from `POSTIZ_SELFHOST_API_KEY` and `POSTIZ_BASE_URL` in the environment or `.env.local`.
4. In scheduling mode, marks the Notion row **Scheduled** and reads that status back. The workflow stage becomes `postiz-scheduled` and the history records the page/post ids and schedule instant. Draft mode skips this status write and records `postiz-draft`.

Rerunning finds the same Notion page by its content marker and the same Postiz post by its stored id. It updates rather than duplicates, reuses unchanged uploads, and follows an owner-changed Notion date. It refuses a published Postiz post, a Published Notion row, a missing stored Postiz post, or a Scheduled Notion row with no local Postiz receipt. Changed copy or assets still need fresh approvals and a matching Notion export before Postiz can be updated.

There are no automatic Postiz retries. Before a create is submitted, an in-flight record (group, date, caption fingerprint, uploads) is written to git-ignored `out/postiz-state.json`. If the response is lost, the next run refuses to create again until `--reconcile-post <postId>` proves the supplied id is the pending create: it must be on the selected akalmesin channel and match the pending caption fingerprint and exact schedule instant, and it must not be PUBLISHED. Postiz's public API assigns its own group UUID on every save, so the local group is never used as identity. On success the command updates that post instead of duplicating; a missing, wrong-channel, wrong-caption, wrong-date, or PUBLISHED post is refused and the pending record is kept. Remove the in-flight file only after checking in Postiz that no post exists. If Postiz fails after Notion succeeds, the row stays Ready to Publish; fix the problem and rerun. If the final Notion status write fails, the Postiz ids are already saved, so the rerun updates rather than duplicates. Reconcile any uncertain Postiz create before attempting another create.

### Connector fallback

If the REST route is unavailable (no token, or the integration lost access to the database), use the Notion connector: work only in data source `405f909f-26a5-8029-8e7a-000b3f2a28a4`, find the page by marker, create or update it with the manifest's properties and body, attach the PNGs in order, read it back, and write the receipt in `workflow.json` by hand. If the integration can't see the database, share the database with it in Notion (••• → Connections).

If a create or upload ended uncertainly, look the page up by its marker before trying again. Never repeat a create blindly. Notion-only delivery does **not** publish or schedule anything. The explicit combined `schedule` command above is the in-repo PNG route; `tools/publishing/` keeps its own dry-run and explicit-approval gate for reel-only scheduling, status sync and its separate runbook.

## Changes after approval

If he edits text in the final HTML (mode design), go back to step 5, then rebuild and recheck. For a new image or crop, edit `post.json`, log it in `edits.log.md`, then rebuild and recheck. Either way, final needs his words again. Once a page is delivered, a changed post means updating the same Notion page (step 8.2 finds it). If it was already scheduled, rerun `schedule` after the fresh approval to update the same Postiz post; never create a second one.

## Outside this repo

Approved PNG posts can be exported and scheduled through the explicit `npm run schedule` command. Reel-only scheduling, Notion/Postiz status sync and the separate publisher runbook remain under `tools/publishing/`; those tools do not alter editorial production or approvals. Decision 2026-10-28 (t50u) kept step 9 out of editorial production; the 2026-11-06 routes add explicit scheduling with their own gates. The optional [Instagram growth worker](instagram-growth.md) remains a separate owner-authorized tool. Immediate publication and measurement remain outside this workflow.

### Reel-only Publisher handoff

**Reels are supported by Notion export** (owner t124u), but not by the in-repo Postiz command yet. For a reel-only post (`reel/reel.json` `"publishAs": "reel-only"`, Format **Reel / video**), `npm run export -- <slug>` puts the reel mp4 first in Assets as `<slug>-reel.mp4` (the file `reel:check` passed, hash in `reel/check.json`; >20 MB uploads multi-part), then the card PNGs as reference. Caption is the final caption verbatim, and Posting notes explain the format and approved revisions. Read-back checks every file by SHA-256 and size.

The Notion row remains the whole handoff to the separate akalmesin Publisher for these posts (owner t126u), so no hand-off message is sent. The separate Publisher dry-runs `tools/publishing/schedule.py` and shows Angger the plan. Scheduling priority is the row's future Publish date, then `--at`, then the standing 09:00 / 13:00 / 19:00 WIB fallback slots. It runs `--apply --schedule --approved-by-angger` only after Angger explicitly approves that exact plan, and never posts now or in the past. Keep Postiz URLs, API keys, and tokens out of docs and tracked files.

If approved reel copy or assets change, the Publisher draft is stale until the Notion entry is updated and the owner confirms its schedule again. Notion export never runs the Publisher.

### Publication scorecard

After a real publication, save its permalink, actual publication timestamp/timezone, and scorecards at **24 hours** and **seven days** in the story's `review.md`. When a matching verified local Export exists, [compare later Notion edits](editor.md#compare-later-notion-edits) to propose observed differences for owner/context review; do not turn them into general rules automatically. Record observed Insights only; mark unavailable data as unavailable. Compare similar formats at similar ages and treat causal explanations as hypotheses.

| Measure          | Record when available                                                               |
| ---------------- | ----------------------------------------------------------------------------------- |
| Discovery        | Non-follower reach or viewers                                                       |
| Reel attention   | Average watch time and displayed retention                                          |
| Sharing          | Sends if shown separately; otherwise shares                                         |
| Return value     | Saves                                                                               |
| Account interest | Profile visits                                                                      |
| Growth           | Attributed follows if available; otherwise clearly labeled account-level net growth |

Normalize by unique reach/viewers when both values exist. Do not equate shares with private sends, views with unique viewers, or account growth with one post's attributable follows. Do not assume slide-by-slide completion is available. Unapproved strategy proposals do not establish brand, cadence, or publishing rules.

## Credits are not copy (copy rule 2, 2026-10-28)

`copyRevision` hashes title, category, slide text and the caption, **without** photo credits: slide `credit`, the `/ Foto: …` half of the `Sumber: … / Foto: …` footer, and lines that are exactly `Ilustrasi slide N: AI / akalmesin`. The `Sumber:` half, paragraphs and hashtags stay in the hash. Credits are covered by `creditsRevision` (in `build.json`) and by final approval (`designRevision` hashes the whole post). A credit-only `copy:record` keeps copy approval and clears final. Quality check `credit_fragment` rejects credit fragments that are long (>100 chars / 14 words) or contain sentences (`. ! ? ;`, dashes, inner `Sumber:`/`Foto:`). Copy approvals recorded before rule 2 (no `copyRule`) remain valid only while `legacyCopyRevision(post)` still matches, i.e. nothing at all changed.

## Single-pass review (default since 2026-10-28, t67u–t69u)

The agent proposes the copy and the design (real photos, blue ink) together. There is no grey-placeholder round and no separate `selected` gate. AGENTS.md routes here; do not follow an external editorial skill.

1. `npm run review:build -- <slug>` renders the PNGs and writes `out/<slug>.html`. That file shows the real slides (1080 px JPEGs, slim woff2 fonts, ~0.9 MB) with the text editable in place, the caption, and a photo list (subject, supplier, licence, URL, credit). It records **no** approval.
2. He reviews in one of three ways:
   - **`npm run review:serve -- <slug>` (preferred):** opens a localhost page of the same review HTML. **Simpan** POSTs the JSON straight into `content/posts/<slug>/edits/` (one click; no download). The server only writes that file — it does not approve or run `review:apply`. Stop with Ctrl+C. Optional `--open` launches the browser; `--port N` overrides 8765.
   - **Open the HTML file:** edits in place and presses **Simpan**. Static `file://` pages cannot write into the repo, so the browser downloads `<slug>-edits-<time>.json` for him to hand back. Live overflow / caption / credit checks are the same either way; Simpan stays disabled while any slide overflows.
   - **Chat paste:** he pastes slide/caption feedback in chat. The agent writes an equivalent `owner-edits` / `mode: review` file under `content/posts/<slug>/edits/` (same schema as Simpan), then applies it. Do not hand-edit `edits.log.md` instead of applying.
3. `npm run review:apply -- <slug> <edits.json>` checks that the file matches the current design revision. It logs only the changed sentences, applies the edits, then runs `design:build`, `design:check` and the quality checks. If everything passes, that Save is his approval for both copy and final: words `Saved in review editor <savedAt>`, source `<file> sha256:<hash>`. A Save with no changes is an approval too. If anything fails, nothing is approved and the report lists why. Keep the applied JSON in `edits/`.
4. `npm run export -- <slug>` as before.

Alt text is not part of `designRevision` (design rule 2), so alt fixes never reset approval. Alt text still goes to Notion. Approvals recorded before rule 2 (e.g. Kimi) stay valid through `legacyDesignRevision` while their content is unchanged.
