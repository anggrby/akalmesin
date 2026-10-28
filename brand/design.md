# akalmesin design and photo rules

Visual spec, typography evidence and photo/blue-ink rules in one file. Tokens: [tokens.css](tokens.css), [tokens.json](tokens.json); layout values used by the renderer: [../templates/html/layout-tokens.json](../templates/html/layout-tokens.json). Blue ink is applied by `npm run design:build` (see [scripts/blue-ink.mjs](../scripts/blue-ink.mjs)).

## Photo quick rules (index; verbatim sections below are authoritative)

- Blue-ink treatment (#4E4FEB) on EVERY photo; it is a build step, not a manual one.
- Main uses a real news photo, not a wordmark/logo graphic. Never repeat the Main photo (or any photo) within a post.
- Credit: white, left-aligned, `FOTO: SUBJECT / SOURCE`, inside the image over a black gradient. AI images: `ILUSTRASI AI: SUBJECT / AKALMESIN`.
- Photo runs to the bottom edge. No article label/kicker.
- Keep originals in `assets/originals/` and provenance in `assets/PROVENANCE.md`.


<!-- verbatim from old repo: DESIGN.md (only link targets rewritten) -->

## akalmesin design system

Updated **27 October 2026**, Asia/Jakarta. This is the visual specification to read before designing or changing a post: foundations, typography, spacing, reusable elements, layout variants, imagery and credits.

This document is the authoritative visual specification. Use [the brand guide](voice.md) for positioning and [editorial style](voice.md) for writing and story depth. [tokens.json](tokens.json) stores confirmed machine values and explicit pending fields; [tokens.css](tokens.css) exposes their CSS counterpart. Keep them synchronized. See [the repository map](../docs/workflow.md) for source ownership.

### References and measurement status

Latest direct owner instructions take precedence. The current owner-edited Figma frames and supplied Main export define the visual direction. Where the export duplicates the photo credit, follow the owner's written subject/source rule.

| Reference | Location |
|---|---|
| Main | [Figma 37:2](https://www.figma.com/design/jmVkKDsPIp5NLu9lYXOFHf/akalmesin?node-id=37-2) |
| Detail-1 | [Figma 37:18](https://www.figma.com/design/jmVkKDsPIp5NLu9lYXOFHf/akalmesin?node-id=37-18) |
| Detail-2 | [Figma 40:40](https://www.figma.com/design/jmVkKDsPIp5NLu9lYXOFHf/akalmesin?node-id=40-40) |
| Quote | [Figma 45:50](https://www.figma.com/design/jmVkKDsPIp5NLu9lYXOFHf/akalmesin?node-id=45-50) |
| Local Main export | [owner-main.jpg](references/owner-main-2026-10-25.jpg) |
| Provenance | [25 October reference notes](design.md#reference-images) |

**Confirmed** means established by owner instruction or the continuing approved baseline. **Pending measurement** means the current numerical Figma property has not been retrieved. A pending value is not zero, a proposed default, or permission to estimate from a screenshot. Preserve the live node setting until measured. The last direct numerical snapshot is from the old 24 October frame; [historical tokens](../MIGRATION.md) must not silently fill pending current values.

### Visual principles

Editorial news media: precise, restrained, spacious and photographic. Use strong typography and relevant imagery, square corners, thin structural rules and a consistent masthead. Remove decoration and small text without editorial value. Black and off-white are primary surfaces; blue belongs in photo treatment and small accents.

The photographic Main, detail and quote layouts are reusable options. Choose story depth using [editorial style](voice.md#choosing-depth); the layouts do not impose a compulsory sequence.

### Color tokens

| Semantic token | Value | Application |
|---|---|---|
| `colors.ink` | `#000000` | Standard wordmark, headline and news text |
| `colors.paper` | `#EEEEEE` | Standard light canvas |
| `colors.accent` | `#4E4FEB` | Photo ink reference and restrained accents |
| `colors.photoCredit` | `#FFFFFF` | Credit over photography |
| `colors.quoteText` | `#FFFFFF` | Quote text over the darkened portrait |

Photo tones vary through highlights and shadows while retaining the ink direction. Do not introduce another blue or large blue cover panels. Divider color/opacity and gradient stops remain pending measurements; “thin divider” does not imply an invented numerical stroke value.

### Canvas and geometry

All measurements use pixels on the master canvas, not a scaled browser preview.

| Token | Value | Behavior |
|---|---|---|
| `canvas.width` | 1080 px | Fixed export width |
| `canvas.height` | 1350 px | Fixed export height; 4:5 |
| `canvas.cornerRadius` | 0 px | Sharp canvas/panel/image corners |
| `spacing.textMarginPx` | 64 px | Standard horizontal text margins |
| Standard content width | 952 px, derived | 1080 − 2 × 64; not a separate measured token |
| Main photo width | Full canvas | 1080 px |
| Main photo height | Adaptive | Remaining height after copy and image gap |

Do not impose a fixed text-block height or photo y position across stories. Preserve type size and edit copy first; photo crop/height responds to the text. The Main photo reaches the bottom edge. If copy leaves insufficient useful image space, edit or move detail into the caption/a detail slide instead of clipping text.

### Typography tokens

Use bundled fonts in [assets/fonts](fonts). Preserve the owner's current settings. The established role families/weights below continue the approved identity; **current numerical size, line height and tracking require direct measurement**.

| Role | Family | Weight | Alignment/color | Numerical metrics |
|---|---|---|---|---|
| Wordmark | Manrope | 700 | Left, ink | Pending measurement |
| Headline | Manrope | 700 | Left, ink | Pending measurement |
| Summary/body | Manrope | 400 | Left, ink | Pending measurement |
| Category | IBM Plex Mono | 400 | Right, ink; uppercase | Pending measurement |
| Photo credit | IBM Plex Mono | 400 | Left, white | Pending measurement |
| Quote | Preserve current Quote node | Pending measurement | Center, white | Pending measurement |
| Speaker | Preserve current Quote node | Pending measurement | With quote attribution | Pending measurement |
| Speaker role | Preserve current Quote node | Pending measurement | With quote attribution | Pending measurement |

Record font size, line height (including Figma Auto if used), letter-spacing value/unit and casing per role. Record quote/speaker/role font properties too. The old article-kicker role is superseded. Keep text native/editable in Figma, separate from the photo asset.

### Spacing and structural tokens

Spacing consists of semantic relationships. The 54 px example is one token, not the entire system. Measure the current design before assigning other numerical values; do not impose an invented uniform spacing scale.

| Relationship/token | Current value/status | Scope |
|---|---|---|
| Horizontal text margin | 64 px, confirmed | Standard text layouts |
| Text → photo | 54 px, confirmed | Main/text-above-photo details |
| Header top inset | Pending measurement | Standard masthead |
| Header → divider | Pending measurement | Standard masthead |
| Divider → article copy | Pending measurement | Main/detail content |
| Headline → summary | Pending measurement | Main |
| Credit horizontal inset | Pending measurement | Inside photo, left |
| Credit bottom inset | Pending measurement | Inside photo |
| Quote horizontal inset | Pending measurement | Portrait overlay |
| Quote bottom inset | Pending measurement | Portrait overlay |
| Quote → speaker | Pending measurement | Quote attribution |
| Speaker → role | Pending measurement | Quote attribution |
| Divider thickness/color/opacity | Pending measurement | Standard masthead |

Measure the text-to-photo gap between the **bottom of the final text frame/block and the top of the photo frame**, not a glyph baseline. Quote overlays do not use this stacking gap. Different relationships remain separate semantic tokens even if measured values later match.

### Reusable elements

| Element | Rules | Properties to retain/measure |
|---|---|---|
| Masthead | Lowercase `akalmesin` left; category right; thin divider below | Type metrics, top inset, divider gap/stroke |
| Article block | Factual headline and useful summary; detail layouts use news paragraphs | Type metrics, headline-to-summary gap, text bounds |
| Photo panel | Full-width rectangle, adaptive height, subject-aware crop | Source, focal point/crop, treatment; neutral filters |
| Credit overlay | White subject/object + source inside photo; left with the smooth gradient for visibility | Type metrics, edge insets, alignment, local contrast |
| Quote overlay | Portrait, dark bottom gradient, centered white quotation and attribution | Type metrics/insets, attribution gaps, gradient stops |

These are reusable design elements; this document does not claim they already exist as Figma components or bound variables.

### Layout recipes

#### Main

Masthead → headline → summary → text-to-photo gap → full-width photo to canvas bottom. Credit is inside the image. No separate article kicker, footer strip or navigation arrow. Headline and summary carry distinct information; their line count can vary. Main + a complete caption can be the entire post.

#### Detail-1

Masthead → substantive news paragraph → text-to-photo gap → supporting photograph. Preserve the reference hierarchy. The paragraph and photo serve the report; do not turn the layout into a mandatory checklist.

#### Detail-2

Masthead → shorter news text → text-to-photo gap → larger/tighter photo. Photo height follows the available space. Choose this when the report and subject benefit from more image space.

#### Quote

Full-bleed portrait, dark bottom gradient, centered white quotation, speaker and role. No standard masthead in the current reference. Use verified wording and save its original source/context; sample Figma text is not an authentic quotation by default.

### Photography and treatment

Prefer relevant, decent photography from the original news source; save the unfiltered original and provenance. If no decent supporting photo is available, generated supporting imagery is authorized with an honest AI-illustration label and saved prompt/provenance.

Use refined blue ink based on #4E4FEB, pale highlights, clear middle tones, readable shadows and delicate halftone/engraving texture. Preserve identity and factual scene when treating a real photograph. Avoid heavy noise, coarse scan lines, moiré, a uniform blue veil, neon/cyan shifts or crushed detail. Process separately and keep Figma filters neutral. See [photo-treatment.md](design.md) for the approved sample prompt.

Generated imagery must not masquerade as a documentary photograph of an event or be falsely attributed to the news source. Preserve relevant focal details when cropping and inspect the result at phone size.

### Image variety — confirmed revision, 26 October

Every slide in a post must use a different original photograph or illustration. A crop, zoom, recolor or new treatment of the Main photograph is still the same image and is not allowed as a supporting-photo replacement. Prefer another relevant source photo; otherwise use an honest, clearly labeled generated illustration. Keep an original-source ID and provenance for each image. The HTML builder checks source IDs and image bytes before creating the review.

### Credit and contrast

Main/detail credits are **always left-aligned**, white, and supported by the smooth black gradient. **Quotes and testimonials omit the on-image photo-credit line entirely**; retain attribution in captions and source records. Speaker name and role still appear with the quote. These rules supersede the earlier left/right choice.

Authentic photo: **`FOTO: SUBJECT/OBJECT NAME / SOURCE`**, e.g. **`FOTO: DARIO / ANTHROPIC`**. Always white #FFFFFF and left-aligned. Adjust local contrast or use a restrained dark gradient if needed, preserving factual detail. Do not switch the credit to black to solve contrast.

Generated illustration: use an explicit label such as **`ILUSTRASI AI: PUSAT DATA / AKALMESIN`**, with the same white overlay/readability rules. Credit/provenance must describe the actual asset.

### HTML implementation and provisional values

The owner authorized HTML-only review on **26 October 2026** after being told unresolved metrics would be identified. The reusable implementation is in [templates/html/editorial](../docs/workflow.md). No Figma connection is required for the current HTML route.

Confirmed values are loaded from brand/tokens.json. All unmeasured numerical type/structure and quote-font choices are explicit review defaults in [review-tokens.json](../templates/html/layout-tokens.json), not newly fetched Figma properties or approved brand tokens. The pending entries above remain pending. Reconcile defaults after owner review or a later direct measurement; [typography.md](design.md) retains the evidence ledger.

Use [docs/editor.md](../docs/workflow.md) for the current editable editor and Export operation, [docs/workflow.md](../docs/workflow.md) for stage/approval rules, and [docs/status.md](../docs/workflow.md) for active batches. The static build/render/packaging procedures remain in the template README.

### Implementation and maintenance

Figma supplies the current owner-edited reference. This document describes the visual system; JSON holds confirmed values and explicit pending fields; CSS exposes confirmed portable values. Keep them consistent. When properties become available, record source node/retrieval date and replace pending values in the relevant files together. Do not insert guessed numbers to make the inventory look complete.

The original 24 October renderer/importer reproduce the historical draft. The active HTML builder/renderer implement the revised structure for review, with provisional metrics kept explicit. Validate the whole system before delivery: typography, all applicable spacing, canvas/margins, divider, adaptive crop, treatment, credit visibility and quote attribution. A passed 54 px check alone is insufficient.


<!-- verbatim from old repo: brand/typography.md (only link targets rewritten) -->

## Typography evidence ledger

Updated **27 October 2026**, Asia/Jakarta. This file records measurement provenance and unresolved evidence. [DESIGN.md](design.md#typography-tokens) owns the current typography specification; confirmed machine values live in [tokens.json](tokens.json).

### Current reference

The owner-edited frames are Main `37:2`, Detail-1 `37:18`, Detail-2 `40:40` and Quote `45:50` in Figma file `jmVkKDsPIp5NLu9lYXOFHf`. Their reference links and supplied Main export are indexed in [DESIGN.md](design.md#references-and-measurement-status).

The new layouts were visually reviewed, but exact current font sizes, leading, tracking and coordinates have not been retrieved. The Figma MCP quota prevented a fresh property read. Visual inspection and the supplied export confirm the direction, not numerical properties. Preserve current node settings during any future Figma edit; do not estimate missing metrics from a screenshot.

### Historical numerical evidence

The last direct property read was on **24 October 2026 from old node `1:191`**. The unchanged [raw snapshot](../MIGRATION.md), [historical JSON tokens](../MIGRATION.md) and [historical CSS](../MIGRATION.md) retain that evidence.

| Old-frame role | Measured value on 24 October |
|---|---|
| Wordmark | 44 px |
| Headline | 86 px / 100 px leading / −4% tracking |
| Body | 37 px / Auto leading |
| Mono labels | 20–21 px / +10% tracking |

These describe the old frame, not a verified scale for the 25 October owner-edited frames. They must not silently fill pending current tokens.

### Authorized HTML review defaults

On **26 October 2026**, the owner authorized HTML-only implementation after being told unresolved values would be identified for review. [review-tokens.json](../templates/html/layout-tokens.json) holds these provisional implementation values separately from confirmed brand tokens. It does not establish new Figma measurements or brand approval.

When current properties become available, record source node, retrieval date, font size, line height (including Auto), letter-spacing value/unit, casing and applicable alignment. Update DESIGN.md and the confirmed JSON/CSS together, then reconcile the provisional review defaults. Pending measurements remain an evidence boundary, not a request to reconfirm the existing design.


<!-- verbatim from old repo: brand/photo-treatment.md (only link targets rewritten) -->

## Photo sourcing and treatment production

Updated **27 October 2026**, Asia/Jakarta. This is the asset-production procedure and approved treatment recipe. [DESIGN.md](design.md#photography-and-treatment) owns visual treatment, image variety, cropping and on-image credit rules. [Editorial style](voice.md#captions) owns caption attribution and synthetic-media disclosure. [assets/README.md](design.md#reference-images) describes asset storage.

### Source and preserve

After copy approval, prefer a relevant, decent photograph from the original news source. Save the unfiltered original, source URL, depicted subject/object, supplier/photographer, retrieval date and any known reuse conditions in the story's source package. A credit records provenance; it does not establish reuse rights.

Each slide needs a different original source image, as specified in DESIGN.md. Give each asset an original-source ID. A new crop or treatment does not make the same photograph a new source image.

If no decent supporting photograph is available, the owner authorizes AI-generated supporting imagery. Use the imagegen skill/tool, preserve the prompt and output, and record it as an illustration supplied by akalmesin. Never present it as documentary evidence or attribute it to a news source that did not supply it. Apply the on-slide label from DESIGN.md and the caption disclosure from editorial-style.md; realistic synthetic video/audio also needs the applicable platform label.

### Produce and check

1. Keep original, processed and generated assets separate; never overwrite the original.
2. Use the approved blue-ink recipe below as the treatment reference. Adapt the subject description to the actual source while preserving the authentic scene and identity. References guide texture and tone, not new subjects or compositions.
3. Compare the processed photo with the original. Check faces, products, architecture, factual scene details, crop and readability at phone size. Reject invented or altered documentary details.
4. Save the tool, prompt, source/output paths and provenance with the story. Keep Figma filters neutral and the previous noise effect removed if the asset is later imported there.
5. Apply credit/gradient/layout in the design layer according to DESIGN.md. Do not bake poster text into the photographic treatment.

### Approved Meta treatment sample — historical source prompt

Created with built-in image generation/editing from the original unfiltered Meta server-room photograph. The supplied references guide the blue ink, pale highlights and fine print texture.

Photo: [meta-prometheus-blue-ink.png](references/approved-blue-ink-meta-prometheus.jpg)

Design direction: editorial duotone with #4E4FEB as the ink reference; tonal values vary through the photograph. Existing Figma color filters and noise are removed. The original edit preserved that sample’s typography, copy and layout. Its old layout is superseded by the 25 October Main reference; the photographic ink treatment remains approved.

### Final edit prompt

Edit the FIRST reference image only: the authentic photograph of a Meta data center server-room aisle. Return ONLY the finished rectangular photograph, no poster, no typography, no border, no layout. Keep the original wide aspect ratio, crop, camera position, perspective, rack placement, cabling, ceiling lights, floor and distant doors faithfully unchanged. This is a careful tonal and print-texture treatment of an existing news photograph; do not invent or redesign any part of the room.

The SECOND and THIRD references are STYLE references only. Use their blue ink photographic treatment, pale paper highlights and fine controlled print texture. Do not include their eagle, statue, text, red color, graphic shapes or compositions.

Create a refined editorial blue duotone suitable for a minimalist technology news brand. The signature ink hue is #4E4FEB. Use rich violet-blue ink shadows, clear middle-tone separation, and luminous neutral off-white highlights. Maintain detailed readable racks and wires, with natural photographic depth. Introduce a very delicate engraved/halftone line texture following tonal detail, inspired especially by the third reference, plus extremely subtle fine paper grain. Texture should be fine and elegant at Instagram scale, not coarse scan lines, obvious dots, moiré, or uniform static noise. Keep the ceiling highlights and floor restrained, the center aisle clear and the edges deep. Balanced contrast, no crushed detail, no foggy blue veil, no cyan, no neon lighting, no glow. Overall polished tactile ink-on-paper editorial photography rather than a simple color overlay. High quality and sharp architecture. Preserve the documentary content of the source photograph.



## Reference images

Downscaled JPEG copies (1080 px wide) of the old repo's visual references are in [references/](references/). Byte-exact originals remain in the old repo's history (see MIGRATION.md).


<!-- verbatim from old repo: design/references/2026-10-25/README.md (only link targets rewritten) -->

## Owner's editorial reference — 25 October evidence

Received **25 October 2026**, Asia/Jakarta. `owner-main.jpg` is a byte-for-byte copy of the owner's supplied `/Users/anggrby/Downloads/Main.jpg`, 1080 × 1350. SHA-256: `14b340a0fe311b67a5ff0cc3f144d06d6687661e30aab825e93e42a2aeaa9ab4`.

Current Figma layout references in file `jmVkKDsPIp5NLu9lYXOFHf`: Main `37:2`, Detail-1 `37:18`, Detail-2 `40:40`, Quote `45:50`. Full links and current visual rules are in [DESIGN.md](design.md#references-and-measurement-status). They were visually reviewed; exact new text properties were not fetched. The exported Main is the local visual reference, not a claim that all four frames were exported or measured.

### Notes recorded on 25 October

These are dated observations/instructions retained with the reference, not a second current specification. Later revisions are maintained in [DESIGN.md](design.md) and [editorial style](voice.md); their current credit, depth, and voice rules take precedence.

- Editorial news writing for headline, caption and body; the former casual carousel style is superseded.
- Some reports need only Main + caption. Others may use detail and verified quotation slides. No fixed slide count.
- Photo height adapts to the text. **Gap between text and photo: 54 px.** For repeatable implementation, measure between the final text frame/block bottom and photo top.
- Main photograph extends to the bottom edge with its credit inside it; no old footer/arrow row or article kicker.
- Prefer original-source photos. Generated supporting imagery is permitted if no decent photo is available; label its provenance honestly as an AI illustration.
- At that date, photo credit was **always white**, with left/right placement allowed for visibility. **Superseded on 26 October:** current credits are always left-aligned over the smooth gradient; see DESIGN.md. Photo contrast may be edited for legibility.
- Credit format: **SUBJECT/OBJECT NAME / SOURCE**, e.g. **`FOTO: DARIO / ANTHROPIC`**.

The export itself displays `FOTO: ANTHROPIC / ANTHROPIC`. The owner's explicit written subject/source rule and Dario example take precedence over that duplicated text. Do not edit this reference file to conceal the discrepancy; apply the correct credit in future designs.

The image is a design reference. Its news text and portrait do not replace source verification, quote verification, or photo provenance in a publishable story package.


<!-- verbatim from old repo: assets/README.md (only link targets rewritten) -->

## Shared assets

This folder contains reusable fonts/licenses, original samples, and owner-provided style references. Story-specific imagery belongs with its [story package](../docs/workflow.md).

Sourcing, treatment, provenance, and generation procedure: [brand/photo-treatment.md](design.md). Visual composition and credits: [DESIGN.md](design.md). Those files own the current rules.

| Location | Contents |
|---|---|
| `fonts/` | Manrope variable TTF, IBM Plex Mono Regular TTF, their OFL licenses |
| `photos/originals/meta-server-room.jpg` | Earlier sample's original [Meta photograph](https://engineering.fb.com/wp-content/uploads/2026/10/Prometheus-NAO_-5-1.jpg) |
| `photos/originals/meta-from-figma-unfiltered.jpg` | Unfiltered photograph extracted from the owner reference |
| `photos/processed/meta-prometheus-blue-ink.png` | Accepted blue-ink treatment sample |
| `references/photo-style-eagle.png`, `references/photo-style-classical-bust.png` | Owner-supplied ink/print treatment references |
| `references/owner-figma-edit-before-photo-treatment.jpg` | Historical export with superseded Figma image settings |

The current owner Main export is in [design/references/2026-10-25/](design.md#reference-images). Earlier sample metadata remains in its historical packages. Font licenses do not grant rights to third-party photographs; keep image provenance with each use.
