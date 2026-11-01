# Decisions

Newest first. Each entry: date (WIB), decision, reason, evidence.

## 2026-11-01 — Repo is SoT; AGENTS routes; no editorial skill; chat paste = Simpan; caption chrome contrast

- Owner: pipeline should trust the checkout, not an external Codex skill; AGENTS.md is the task router; `docs/workflow.md` owns the steps. Chat paste of review feedback is a valid path to `edits/*.json` + `review:apply` (same schema as HTML Simpan). Do not hand-write `edits.log.md` as a substitute for apply.
- `AGENTS.md` flow table rewritten to single-pass (was still showing the old two-gate table above a single-pass bullet). Codex `akalmesin-editorial` skill gutted to a pointer at this repo.
- Editor chrome: slide `body { color: var(--color-text-primary) }` (#F2F2F5) was painting caption/photo panels white-on-white. Text color now lives on `.post`; `templates/html/editor.css` sets dark ink on caption/photo chrome (owner reported unreadable caption).

## 2026-10-28 — Adopt the connector-made Kimi row instead of making a new one (t56u)

- Owner (t56u): "Yes approved for kimi" (final, revision 7bfb0d4853cd…), then "Yes, replace the images on the existing Kimi row in Notion".
- `export --adopt-legacy` takes over an older page that has the marker but no end line. It deletes only blocks whose text matches the recorded old body (`notion-legacy-body.json`) and refuses on anything else unless the block ids are listed with `--force-blocks`. Dry run first.
- Status and Publish date are owner-managed on every update (the Kimi row is already `Published`, 28 Oct 12:00 WIB); export sets them only when it creates a page. Normal export now refuses a legacy page before uploading or patching anything (it used to patch properties first, then refuse).
- Read-only check of the real row (box, 28 Oct ~15:20 WIB): 3 body blocks, all generated, no foreign blocks; 5 old PNGs in Assets; no image blocks in the body.

## 2026-10-28 — Light quote mark, image follows the copy, Quote slide only for real quotes (t55u)

- Owner (t55u): "Good catch. Use light. The quote slide is not required for every post, it just for the post that contain important quote from the person in that news and it should use that person photo, not the other object. It should start where the copy ends, The image should adjust their height automatically relative to the copy. The check are deterministic, correct? it should".
- Quote mark stays light `color.editorial-gray` #EEEEEE (closes open question 12).
- Main/Detail image starts where the copy ends (gap 64 / 54) and its height adapts to the copy; no fixed y648 (closes open question 11).
- The Quote slide is optional: only when a person in the news said something important. Its photo must be that person. Enforced as errors in `checkPost` (so also `approve` and `design:check`): `imageSource.subject` equals `author` (case/diacritics ignored) or a listed `subjectAliases` entry; `imageSource.kind` is `news-photo` or `portrait-photo`; `assets/PROVENANCE.md` names the person. Any slide reusing another slide's image (same `imageSource.id`, or same original bytes) is an error. Code checks the _declared_ subject only; the owner's design review checks the actual face.
- Checks are deterministic; see docs/workflow.md "What the checks guarantee". Verified: Kimi built + checked twice → identical PNGs and identical check.json apart from `checkedAt`.

## 2026-10-28 — Quote layout: no masthead (t54u)

- Owner (t54u): "Yes, it should have no masthead." He also sent a finished Quote example (`brand/references/quote-example-2026-10-28.png`, Dario Amodei).
- The Quote slide is now rendered: full-bleed blue-inked photo, `overlay.quote` over the whole frame, centred mark → statement → author / role in the sheet's 56 px box ending at y1294, no masthead, no photo credit (provenance in sources/PROVENANCE).
- From his example (values the sheets lack): quote mark = Manrope Bold 700 `“` at 400 px (ink 116 × 103 at x482 y782), statement line break as he wrote it (`\n` in `quote`). Sheet values win where they overlap: the example shows the statement ≈#DCDAD6 and role ≈#E8E6E3 (sheet: #EEEEEE / #FFFFFF) and the mark dark #222426 (sheet: #EEEEEE); the sheet colours are used and the mark colour is an open question.
- Agent rule: a statement is at most 3 lines; longer fails the build instead of shrinking.

## 2026-10-28 — Owner sheets are the design source of truth, Figma dropped (t52u)

- Owner (t52u): "Are you able to translate this into the design token. We don't need figma at all. Just use this as source of truth", with three measured sheets (now `brand/references/design-values-{1-typography,2-color-treatment,3-spacing-layout}.png`).
- `brand/tokens.json` was rewritten from the sheets and is the only token file; `templates/html/layout-tokens.json` and `brand/tokens.css` were deleted. CSS variables are generated at build time. Values the sheets do not give are listed under `unmeasured`.
- Renderer changes from the sheets: divider #7B7B7B → #000000; header row → divider 19 → 20 (content moves down 1 px); Main summary → image 54 → 64; quote 60/80/−3% regular → 78/100/−4% bold in #EEEEEE; author 28/40 → 40/60 white; author role IBM Plex Mono 20/30 → Manrope Light 300 40/60 white; quote insets 88/170 → 56/56; quote gradient → #D9D9D9 0% → #000000 100%.
- `designRevision` now hashes `brand/tokens.json` and `post.css`, so a token change resets final approval. Kimi's final approval was reset by this change (design review again).
- Old questions 9 (Figma) and 10 (unmeasured type metrics) are closed. Figma-era entries below are history.

## 2026-10-28 — Notion route and step 9 resolved (t50u, 14:01 WIB)

- **Notion: one command over the REST API.** Owner: "1 Yes" to "make `export` do both parts with one command on your Mac, using your Notion token and Notion's own API … keep the connector route as a fallback". `npm run export -- <slug>` now finds the page by body marker (`POST /v1/data_sources/<id>/query`, `Notion-Version: 2025-09-03`), creates or updates it, uploads the PNGs (file_uploads), reads it back with SHA-256 checks and writes the receipt. `--attach`/`--record` are removed; the connector is a documented fallback only. notion-custom does not come back. Evidence: live throwaway test 2026-10-28 14:03–14:04 WIB (page created, second run updated the same page, then trashed; the Kimi, Anthropic and Terra rows were only read). Pages made earlier by the connector lack the `akalmesin-managed-end` line, so export refuses to update them automatically.
- **Step 9 stays out of the repo.** Owner: "5 Yes, keep step 9 out". Postiz scheduling and the 24-hour / 7-day Insights scorecards remain with the separate akalmesin Publisher; their rules stay under "Outside this repo" in docs/workflow.md for reference only.

## 2026-10-28 — Owner answers to open questions (t49u, ~13:56 WIB)

- **Caption length: 100–160 words, warning only.** Owner: "Not necessary for now, 100-160 is not including the hashtag and the Source. So it just pure the copy text". Reason: his guide said about 100–150; he decided 100–160 counted on the pure copy text, i.e. the 3 body paragraphs only, excluding hashtags, the `Sumber: … / Foto: …` footer and `Ilustrasi slide N:` lines. Not a hard gate. `brand/editorial-policy.json` max 150 → 160; design:check, the copy editor counter and copy-review read it. Kimi caption recounted with this rule: 185 words, so it is still a warning. Older entries mentioning 100–150 are kept as history.
- **Alt text does not need owner approval.** Owner answered "No" to "Should alt text need your approval like copy?". Alt text stays outside the copy gate; the agent may fix it and logs the change in `edits.log.md` (as done for the Kimi Main alt text).
- **Notion `Post` title follows the Main headline** whenever the headline is edited. Owner: "Yes". Current behaviour kept, now owner-confirmed.
- Still open at the time: Notion route and step 9 (resolved in t50u, entry above).

## 2026-10-28 — Rewrite the repo from scratch

Owner (t47u, 2026-10-28): "I'd rather create new repo in local /Users/anggrby/Code/temp. Let's rewrite this from scratch." Reason: the audit found ~230 MB working tree, one post's state in 5 places, 9+ overlapping docs, an unused notion-custom export stack, no text-only review stage, no sentence-level diff, and blue ink outside the pipeline. The owner's 8-step flow (t46u) is the only thing the repo serves.

What changed:

- One post = one folder; `post.json` is the single source of truth for copy, caption, slides, credits, alt text, image sources and sources. `workflow.json` holds gates and approval evidence; `edits.log.md` holds sentence/word diffs.
- Text-only review is the same slide HTML with grey image placeholders (`copy:review`).
- Blue ink is a build step (`scripts/blue-ink.mjs`, a Node/sharp port of the Kimi `blue_ink.py`, same colour stops). The noise grain uses a seeded JS PRNG, so pixels differ slightly from the Python output; tone, texture and colours match.
- Notion: the plain Notion connector creates/updates the row (as actually done for Terra and Kimi) and `npm run export -- --attach` uploads the ordered PNGs (port of notion_attach_assets.py). The notion-custom MCP Export stack, SQLite editor journal, batches, fingerprints/snapshots/receipts, Figma and Python renderer paths were dropped. This supersedes the old "do not use the standard Notion plugin" line in the archived workflow (practice since Terra used it). Superseded by the t50u one-command REST export (entry above).
- Docs merged without changing rule text: brand-guide + editorial-style → brand/voice.md; DESIGN + typography + photo-treatment → brand/design.md; workflow/REPOSITORY/editor/integrations/status/SKILL/READMEs → AGENTS.md + docs/workflow.md. MIGRATION.md maps every old file.
- Terra example PNGs kept byte-exact (their SHA-256 hashes are cited), so the repo is ~5 MB plus the Kimi fixture rather than strictly under 5 MB. Visual reference images were downscaled to JPEG.
- Structure deviations from the brief: layout metrics kept as `templates/html/layout-tokens.json` (was review-tokens.json) because the renderer needs them; fonts live in `brand/fonts/`; blue ink is its own module `scripts/blue-ink.mjs` so tests can call it.

- Additional rules from building it: the Notion `Post` title follows the Main headline (that is how Kimi's final title came out); `edits/` keeps the owner's Simpan files; only `build.json`, `check.json` and `notion-manifest.json` under `out/` are tracked. The PNGs and the HTML are regenerated from originals + post.json.
- Kimi pilot (same day): the new build's text area is pixel-identical to the approved renders. Photo areas differ only by grain, plus a shift of a few pixels in the two cropped charts, because the exact old crop coordinates were never recorded and were re-derived by template matching. The Notion page still holds the old-repo PNGs; its receipt records those hashes (`assetsMatchBuild: false`). It was not re-uploaded.

<!-- verbatim from old repo: docs/decisions.md (only link targets rewritten) -->

## Decision record

This file records rationale and links to the current home of a decision. It is not another policy guide. For current rules, use [REPOSITORY.md](workflow.md).

### 28 October 2026 — relaxed voice

The owner called the Kimi draft "too kaku and unnatural" and rewrote it; editorial-style.md Voice now says relaxed, not stiff. Evidence is in the style feedback log.

### 27 October 2026 — agent-friendly organization

The owner asked for a dedicated skill, clearer hierarchy, easy navigation for any agent, and one authoritative source per subject.

- Root AGENTS.md is the short agent entry; README.md is the human/project overview. The repository map owns navigation/authority, and the repo-owned skill routes tasks to relevant guides.
- Workflow owns production/approval gates; editor owns operation/recovery; editorial-style owns writing; DESIGN owns visual requirements. Brand identity and evidence ledgers link to these homes instead of restating full rules.
- Current status is a short handoff. Prior verbose status, decisions, and entrypoints are preserved in [history](../MIGRATION.md). They remain historical evidence, not current instructions.
- Unapproved growth work is grouped in [research/strategy](../research/strategy/README.md). The superseded Export architecture is in [archive/architecture](../MIGRATION.md), and the old typography measurement is in [brand/legacy](../MIGRATION.md).
- Runtime/story/asset/batch paths, IDs, and local editor state stay stable. Only the moved typography-evidence path changes token provenance; numerical design values stay unchanged. Package/tool metadata changes can make an older render fingerprint stale. Preserve owner drafts and use normal revision checks; do not silently rerender or reload a live review.
- Repository-link/config validation is a maintenance command. Real Notion writes, approval clicks, publishing, and source regeneration are outside its scope.

Verification: all 37 existing tests passed (10 unit, one isolated browser workflow, 26 editor/render/Notion fixtures); doctor reports no issues. Repository validation checks 34 active Markdown files and 26 configured paths. The skill validator passes. A temporary negative fixture proves missing files/headings are rejected. A fresh-agent read-only exercise found RoboGym’s actual state, planned pending-job recovery, and located the caption-policy home without chat history; its outdated story-runbook pointer was corrected. Independent final review also found and resolved the dated Figma-reference note’s superseded left/right credit instruction and stale reference link. Preservation checks confirm unchanged design values, byte-identical moved typography evidence, retained handoff history, and no changes to source posts/state, imagery, renderer, saved batches, or editor journal. No real story was approved, exported, synchronized, or published by this maintenance work.

### 27 October 2026 — approved example and production checks

The owner asked to proceed with an approved production example, calibrated guide, enforced checks and reviewed feedback capture. The Terra Notion Caption property and five attachments are preserved as an [example](../brand/examples/terra/README.md), with its conflicting publication status and different body caption recorded. Original editable files were not recovered.

The guide prioritizes accurate factual development and uses word targets flexibly, informed by owner edits. `check:post` checks observable caption/terminology/emphasis requirements against [editorial-policy.json](../brand/editorial-policy.json); approximate word count is a warning. Hashtag values moved from token metadata into that policy file; no visual token changed. New-post errors block copy approval, batch build and a new editor Export; legacy-review drafts retain warnings. Detail emphasis is represented as `**phrase**`, rendered as safe bold text and round-tripped by the editor. Hashtags are now editable in the same autosaved draft and participate in the copy fingerprint. Checks do not verify sources, truth, or editorial taste.

`feedback:compare` compares an existing verified frozen Export with the same Notion page through the custom MCP, using content identity and a complete read. Its optional saved output is a proposed observation for review, never an automatic policy change or publication claim. The older manually uploaded Terra example has no matching local verified Export snapshot and is not retrospectively treated as one. See [editor.md](workflow.md).

### Earlier decisions

[The preserved decision history through 27 October](../MIGRATION.md) records owner choices, reversals, historical delivery, and implementation rationale. Its obsolete procedures/destinations do not override current guides. The [style feedback log](../brand/style-feedback-log.md) preserves concrete owner writing edits.

<!-- verbatim from old repo: archive/history/2026-10-27-docs-decisions.md (only link targets rewritten) -->

> Historical snapshot preserved before the 27 October repository consolidation. Original relative paths and old procedures below are evidence only. Start current work at the root AGENTS.md and docs/REPOSITORY.md.

## Decisions

Latest update: **27 October 2026**, Asia/Jakarta. Newer direct owner instructions supersede earlier explorations.

| Topic                           | Current decision                                                                                                                                                                                                                   | Basis                                                                                                                       |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Audience                        | Indonesian-speaking people in Indonesia                                                                                                                                                                                            | Owner                                                                                                                       |
| Identity                        | Faceless technology news outlet, akalmesin in lowercase                                                                                                                                                                            | Owner                                                                                                                       |
| Voice                           | Owner's brand guide for slide copy and captions: clear journalistic Indonesian, knowledgeable-friend tone, kamu/kita when natural                                                                                                  | 27 Oct; supersedes the 25 Oct ban on that voice for slides and captions                                                     |
| Captions                        | Hook in the first 1–2 lines; 3 paragraphs of about 100–150 words; one closing question; footer `Sumber: X / Foto: Y`                                                                                                               | 27 Oct; readers see 1–2 lines before selengkapnya                                                                           |
| Hashtags                        | Maximum 5 per post; include #akalmesin when useful for the archive                                                                                                                                                                 | 27 Oct; Instagram limit since Dec 2025. The guide's 8–10 figure is outdated and is not used                                 |
| AI illustrations in captions    | When a slide image is generated, add `Ilustrasi slide N: AI / akalmesin`                                                                                                                                                           | 27 Oct; example is slide 5. On-slide `ILUSTRASI AI` credit remains                                                          |
| Detail emphasis                 | Bold the single most important phrase on each detail slide; a benchmark slide may bold two; a price slide gets one                                                                                                                 | 27 Oct                                                                                                                      |
| Benchmark wording               | Loanword "benchmark", not "tolok ukur", in slides, captions and alt text                                                                                                                                                           | 27 Oct                                                                                                                      |
| Instagram scheduling            | After Ready to Publish, a separate publisher bot creates a Postiz draft and schedules only when the owner gives a date and time (WIB). Nothing is published without that say-so                                                    | 27 Oct; approval gates unchanged; no URLs, keys, or tokens in the docs                                                      |
| Growth research                 | Original contribution inside the post, the disappearance test, reader consequence, one job per slide, informative hooks, and a 24-hour/7-day scorecard are rules. Bio, pins, series names, and the first-month plan stay proposals | 27 Oct; full note in research/instagram-growth-strategy-2026-10-27.md; no Insights data yet                                 |
| Story depth                     | Main + caption can be enough; detail and verified quotes for deeper reports                                                                                                                                                        | 25 Oct; no fixed slide count                                                                                                |
| Headline length                 | Soft target: about 4–6 words on the headline and about 6–9 words on the supporting line                                                                                                                                            | 27 Oct; a guideline, not a hard cap                                                                                         |
| Layouts                         | Main 37:2; Detail-1 37:18; Detail-2 40:40; Quote 45:50                                                                                                                                                                             | Owner-edited Figma, visually reviewed                                                                                       |
| Canvas                          | 1080 × 1350, sharp corners, 64 px horizontal text margins                                                                                                                                                                          | Continuing visual baseline                                                                                                  |
| Colors                          | Black #000000, off-white #EEEEEE; #4E4FEB photo/small accents                                                                                                                                                                      | Owner                                                                                                                       |
| Main structure                  | Masthead/category/divider, headline/summary, photo to the bottom edge. No article label and no arrow footer. Credit stays inside the photo                                                                                         | 27 Oct; confirmed by the published GPT-6.1 Terra post. The guide's label, footer arrow, and 1080×584 window are not adopted |
| Image spacing                   | Exactly 54 px from final text block to photo; photo height adapts                                                                                                                                                                  | 25 Oct explicit instruction                                                                                                 |
| Photo source                    | Original-source photography preferred; generate supporting imagery if no decent photo                                                                                                                                              | 25 Oct authorization                                                                                                        |
| Photo treatment                 | Blue ink, pale highlights, fine print texture; neutral Figma filters                                                                                                                                                               | Approved style; no old filters/noise                                                                                        |
| Photo credit                    | Always white, inside photo, left for legibility                                                                                                                                                                                    | 25 Oct explicit instruction                                                                                                 |
| Credit content                  | FOTO: SUBJECT/OBJECT NAME / SOURCE; e.g. DARIO / ANTHROPIC                                                                                                                                                                         | Written instruction takes precedence over duplicate in export                                                               |
| Generated imagery               | Honest AI-illustration label/provenance; never documentary evidence. Realistic synthetic video or audio also needs the platform label; a caption credit does not replace it                                                        | 25 Oct fallback; platform-label rule from the 27 Oct growth research                                                        |
| Typography                      | Keep Manrope/IBM Plex Mono. Headline 86 px, supporting text 37 px, and labels 20–21 px stay provisional until the current Figma frames are read                                                                                    | 24 Oct snapshot of old node 1:191; not a new measurement                                                                    |
| Quotations                      | Actual verified words, speaker/role and source; translations identified                                                                                                                                                            | News reporting standard                                                                                                     |
| Editorial/commercial references | The Rundown AI / Evolving AI newsletter-sponsorship direction                                                                                                                                                                      | Owner-selected references; no revenue assumptions                                                                           |
| Delivery                        | HTML/CSS review and PNG exports without Figma                                                                                                                                                                                      | Owner authorization, 26 Oct; no publication                                                                                 |
| Budget                          | Apify available free credits only                                                                                                                                                                                                  | Explicit limit                                                                                                              |
| Organization                    | Independent local repo per social account                                                                                                                                                                                          | Owner request                                                                                                               |
| Production sequence             | Research → owner selection → text-only copy/review → editable HTML/review → explicit final approval → Notion                                                                                                                       | Owner, 26 Oct; supersedes direct research-to-design                                                                         |
| News selection                  | Latest or most discussed; older stories eligible with accurate dates and current relevance                                                                                                                                         | Owner, 26 Oct                                                                                                               |
| Notion content delivery         | Final approved revisions only, in Akal Mesin Content Schedule linked to akalmesin                                                                                                                                                  | Owner destination revision, 26 Oct; no publication authorization                                                            |
| Active Notion destination       | Akal Mesin Content Schedule, database 405f909f-26a5-8057-ad0a-e9562fe9c915; seven retained fields, Topic single-select; other metadata inside the page                                                                             | Owner revision, 26 Oct; supersedes generic calendar                                                                         |
| Notion access                   | Agent and future app use the configured custom Notion MCP; code can call MCP without an AI intermediary                                                                                                                            | Explicit owner preference, 26 Oct                                                                                           |
| Final action                    | One Export per post approves the snapshot, replaces latest generated output and directly updates its Notion entry                                                                                                                  | Owner, 26 Oct; implemented 27 Oct; historical JSON download remains a backup only                                           |

The 54 px gap is operationally measured between layout frame/block edges, rather than a glyph baseline. Quote overlays are a separate composition. The published Terra post confirms that layout. Headline length is a soft word target. Type sizes 86/37/20–21 px stay provisional until a direct read of the current Figma frames. Final tagline, bio, avatar, cadence, and template migration remain open.

### Owner writing and publishing decisions — 27 October

The writing and publishing decisions, each dated 27 October 2026, Asia/Jakarta, are recorded separately below. The growth-research entry follows them. The published Terra post later confirmed the repo layout and set a soft headline-length target. Type sizes were not promoted.

#### 1. Voice and captions

The owner's brand guide governs slide-copy and caption voice over the 25 October neutral-news ban in brand/editorial-style.md. He chose these caption rules: a hook in the first one or two lines, because readers only see that much before selengkapnya and the audience is tech-curious laypeople, so the opener is not a stiff official name; three paragraphs of about 100–150 words; one closing question; footer `Sumber: X / Foto: Y`. kamu/kita is allowed when it is natural. The approved GPT-6.1 Terra caption is the worked example in brand/editorial-style.md. The preference log is brand/style-feedback-log.md.

#### 2. Hashtags

At most five hashtags per post. Include `#akalmesin` when it is useful for the archive; the other tags name that post. The limit is Instagram's, since December 2025, as recorded in research/instagram-growth-strategy-2026-10-27.md. The owner's guide still says 8–10 in one place. That number must not be copied into the repo.

#### 3. AI-illustration line in the caption

When a slide image is AI-generated, the caption includes a line such as `Ilustrasi slide 5: AI / akalmesin`, in addition to the on-slide credit.

#### 4. Emphasis on detail slides

Bold the single most important phrase on each detail slide. A benchmark slide may bold two phrases. A price slide also gets one.

#### 5. "benchmark"

Use the loanword benchmark instead of tolok ukur in slides, captions, and alt text.

#### 6. Postiz after Ready to Publish

After the owner approves a post and it is Ready to Publish in the Notion content schedule, a separate publisher bot creates a Postiz draft. The bot schedules that draft only after the owner gives a date and time (WIB). Nothing is published without his explicit say-so. This does not change story selection, copy approval, design approval, or the Notion handoff. No Postiz URL, API key, or token belongs in the docs.

### Instagram growth research — 27 October

The owner sent the research now saved, unchanged below a short header, as research/instagram-growth-strategy-2026-10-27.md. It was checked 27 October 2026. It is not an Insights audit. There is no Insights export yet, so no result has been logged.

Adopted as rules, in brand/editorial-style.md and docs/workflow.md:

- The original explanation is visible inside the post, not only in the caption.
- Editorial test: if the akalmesin contribution disappeared, would readers still learn almost the same thing?
- The weak-versus-stronger contribution examples (pricing chart, robot demo, translated announcement, vendor benchmark).
- Each story answers what changes for the reader, and who would send it to whom.
- One clear job per slide. This does not replace brief, expanded, or in-depth depth, and it does not require five slides.
- Hooks name the question the post will answer. Vague suspense is out.
- At most five hashtags, with `#akalmesin` when useful.
- Never present a generated scene as documentary evidence. Realistic synthetic video or audio, including generated narration, needs the platform label. A caption credit does not replace that label.
- After a post is actually live, log the scorecard at 24 hours and at seven days. Do not invent the numbers.

Left as proposals in docs/growth-proposals.md, not approved brand or cadence changes:

- Display name and bio copy.
- Which posts to pin.
- Series names Kabar Mesin, Masuk Akal, and Cek Klaim.
- The first-month plan and any weekly frequency.

The note's audience sentence, Reels length, Trial Reels, and audio on carousels stay in the research file. They are not production rules.

### Published layout and headline length — 27 October

GPT-6.1 Terra, Version A (Main + four details), was published on 27 October 2026, WIB, with the repo layout. That publication confirms the layout:

- No article label.
- Photo credit inside the photo.
- Exactly 54 px from the final text block to the photo.
- The photo runs to the bottom edge.
- No footer row and no navigation arrow.

The owner's 26 October guide describes an article label, a footer arrow, and a fixed 1080 × 584 photo window. Those are not adopted. See brand/brand-guide.md.

Headline length is a soft guideline: about 4–6 words, plus a supporting line of about 6–9 words. Aim for it. A longer factual line is acceptable when a shorter cut would drop the development. It is not a hard cap, and type is not shrunk to force the count.

Type sizes stay provisional. Headline 86 px, supporting text 37 px, and labels 20–21 px are the 24 October snapshot of old node `1:191`. They are not a measurement of the current Figma frames. Do not copy them into approved brand tokens until those frames are read. The follow-up is a TODO in docs/status.md.

### Export implementation — 27 October

The missing button is now implemented in the local HTML editor. One Export per post approves that revision, renders all slides, saves the repo package and calls the configured custom Notion MCP directly, with spinner/progress and verified same-page updates. Ordinary edits autosave without approval or external writes. Stable IDs, browser recovery, SQLite save/job checkpoints and immutable snapshots preserve in-flight/newer drafts. Current controls edit text/captions; image/crop controls remain separate future work. Tests use fixtures and the live Notion connection was checked read-only; implementation does not approve existing posts. See docs/editor.md.

### Simplified Notion properties — owner revision, 26 October

The owner rejected the initial excess of columns and kept Topic as a single-select. The final seven columns are Post, Status, Format, Topic, Caption, Assets and Publish date. Sources, editorial depth, photo credits, publishing URL, account context and export identity/revision/hash/time belong inside each post’s managed page section. No hidden Content ID column is retained. The local page-ID mapping and visible exact body marker provide identity; recovery without a mapping scans the dedicated data source’s page bodies. Existing values must be checked before removing columns; preserve human rows and notes. This supersedes the initial 15-field setup below.

### New output database — initial setup, 26 October

The owner selected a brand-new database under the akalmesin account and explicitly authorized adding suitable properties. Preserved Post and added 15 native fields, including native Status, Account relation, editorial content and publishing metadata, Content ID and export revision/hash. The custom MCP's addition-only tool verified the schema by readback. Exact IDs/types/options are in docs/notion-content-schema.json. The old calendar remains a historical reference; no content was migrated or published. Active config/local plan now use the new target and Caption field.

The standard plugin was explicitly rejected. The future export worker can call the existing custom MCP directly through code, reusing its authorized connection. The single-button editor/worker remains design work rather than an implemented feature.

### One-button Export — workflow decision, 26 October

The owner wants the normal flow to be editing all slides/caption and clicking one Export, with code saving the repo and synchronizing Notion without an AI intermediary. The owner clarified that repeat exports may overwrite output and requested loading feedback while Notion takes time. Treat the future Export click as explicit approval of the exact frozen snapshot and authorization to update that post's calendar entry. No second routine approval dialog or chat instruction is needed after it.

docs/single-button-export.md defines the proposed local service, source of truth, durable per-post jobs, revision conflicts, rendering/validation, progress, Notion identity/field ownership, upload/retry/readback rules and acceptance cases. Current static v5 tooling remains implemented as before; the new action/client is not yet built, no schema was changed and no story was approved or uploaded by this design discussion. Unduh perubahan remains a data download.

### Reproducibility tooling — 26 October

Batch selection and review metadata are data-driven, with separate output folders preserving prior reviews. The HTML editor saves slide/caption drafts locally by source/template revision and downloads JSON; the importer validates freshness, keeps backups, updates captions and invalidates approvals. workflow.json binds actual owner evidence to copy and final artifacts. Never invent or automatically infer human approval. The existing three stories carry a legacy design-review exception with no approvals; new stories need copy approval before rendering.

Node/npm/dependencies and Playwright Chromium setup are pinned and checked. Saved finished photo treatments remain the reproducible assets; generation prompts alone do not promise an identical result. Notion preparation is a local approval-guarded plan plus receipt validation; actual remote execution/readback remains through MCP/API after explicit final approval. No brand token was promoted or real content uploaded by this tooling work.

### Review stages and Notion handoff — latest clarification, 26 October

The owner selects stories from a research shortlist, then reviews the full plain-text copy before design begins. Copy includes headline, subheading/summary, details, useful verified quotes and caption. After copy approval, deliver the established editable HTML review. Incorporate design adjustments and wait for explicit final approval of the relevant post/revision; only then send it to the specified Notion Social Media Content Calendar. This approval authorizes the handoff without another redundant permission question. It does not authorize Instagram publication or scheduling.

The linked database/schema were verified through MCP/API with no mutations. The current eight-slide batch remains in design review and is not retroactively approved. Older stories can enter a shortlist when still relevant/discussed, with dates and evidence kept clear. docs/workflow.md defines the sequence and per-story approval records; templates/editorial-copy.md provides the text-only proposal form.

### In-depth coverage — 26 October

The owner wants **3–5 detail slides for in-depth news**. Interpret this as one Main plus 3–5 substantive details, with a verified quote optional and additional. Briefs can remain Main + caption; expanded reports can remain shorter. Avoid filler or repeating the cover to meet the count. The builder checks the in-depth range from brand/tokens.json, excluding Main/quotes.

RoboGym is expanded from one detail to three, covering infrastructure/access, data-generation methods and tasks/limits, plus the existing quote. Two other official TUM photos accompany the new details. Claude remains a shorter expanded report and PC a brief. Old review packages/tabs are preserved; revision 3 is separate.

### Owner photo revision 2 — 26 October

All displayed photo/illustration credits are white and **left-aligned**, keeping the smooth black gradient. Quote/testimonial layouts omit the photo-credit line; provenance stays in captions and source files. A supporting slide must use a different original photo or generated illustration from the Main; recropping, zooming and retinting do not count as a different image. These instructions supersede earlier left/right choice and Main-photo reuse.

Current batch replacements: generated computing illustration for Claude detail, a different official TUM robot-training photograph for RoboGym detail, and a separate official archival David Reger portrait for the quote. Builder/renderer checks enforce these rules. Existing in-browser review is preserved; revision 2 is delivered separately.

### HTML reimplementation — 26 October

The owner authorized rebuilding the three previous posts entirely in HTML/CSS, using DESIGN.md and approved exports, after being told unresolved values would be identified for review. Separate provisional review tokens make that implementation possible without pretending to have exact current Figma measurements. No Figma file was accessed or changed.

The revised batch uses 2 slides for Claude, 3 for RoboGym (including a sourced translated Reger quote) and 1 for PC shipments with a complete caption. Counts are story-specific. Sources were rechecked; the correct 22 October RoboGym article replaces the related 23 October Convergence Center link in the new package. Prior source packages and approved photo treatments stay unchanged.

The review page supports text editing and download of changes; source JSON and PNGs require reconciliation/rebuild. This is an owner-review implementation, not approval of provisional token choices or publication. Original batch scripts remain historical; new scripts provide the active HTML route.

### Design-system documentation — owner clarification, 25 October

The owner clarified that the 54 px gap was an example within the broader design-token system. Root `DESIGN.md` is now the central visual specification for colors, typography, spacing, geometry, reusable elements, four layout variants, photography and credits. JSON/CSS are its portable counterparts. The existing confirmed 54 px value remains; this clarification broadens documentation scope rather than changing that value.

The token inventory explicitly includes unmeasured current type metrics, header/divider/content spacing, credit insets, quote attribution spacing, divider styling and gradient stops. These remain null/pending until a direct Figma read; the old snapshot must not silently supply them. New documentation does not claim a completed measurement pass or renderer migration.

### Historical 24 October production

Three stories with three slides each were researched and delivered at Figma board `20:2`. That count and the black data/off-white context panels were batch choices, not current requirements. The owner subsequently replaced the layout and clarified the news voice.

The owner approved and ran the network-free local importer after the MCP Starter limit and desktop failures. The nine editable slides were verified. Do not rerun it or ask for the same approval; its duplicate guard and old reference protect that historical batch. Preserve its outputs and the owner's revisions. It is not the template for new work.

Older green/two-blue palettes, exploratory avatar, casual profile copy, and series names are historical proposals. The 25 October update changes local guidance; it does not claim that the old drafts, renderer, Figma file or Notion guide were rewritten during this update.

## 2026-10-28 — Photo credits out of the copy hash

Credit edits after copy approval were forcing a copy re-approval (OpenAI post, t64u). Owner approved the fix (t65u, "Yes"): credits move out of `copyRevision` into `creditsRevision`; final approval still covers them via `designRevision`. Strict line patterns plus the `credit_fragment` check stop copy being smuggled into credit text. Old approvals are honoured through `legacyCopyRevision` only for unchanged content; new approvals store `copyRule: 2`.

## 2026-10-28 — Single-pass review; Save is the approval

Owner (t67u–t69u, authorised t69u: "…only the copy that still my attention. You can make change now"): one review HTML with real slides and editable copy. A Save applied by `review:apply` with every check green counts as both the copy and final approval. A Save with zero changes is an approval. A failed check means no approval. Design rule 2 removes slide alt text from `designRevision` (alt stays in the export). Old final approvals without `designRule` are checked against `legacyDesignRevision`. The `selected` gate is no longer required. The placeholder copy editor and `approve --gate` remain available as fallbacks.
