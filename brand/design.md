# akalmesin design and photo rules

**Source of truth:** the owner's three measured sheets in [references/](references/) (`design-values-1-typography.png`, `design-values-2-color-treatment.png`, `design-values-3-spacing-layout.png`), owner-measured 2026-10-28. They are transcribed into [tokens.json](tokens.json), the only token file. The renderer turns it into CSS variables at build time (`slideTokensCSS()` in `scripts/core.mjs`); `templates/html/post.css` uses only those variables. No external design file. If the sheets and this page ever differ, the sheets win: fix tokens.json, then this page.

## Photo quick rules

- Blue-ink treatment (#4E4FEB) on EVERY photo, including Main and charts; `npm run design:build` applies it (`scripts/blue-ink.mjs`). It is baked into the raster, not a colour token.
- Main uses a real news photo, not a wordmark/logo graphic. Never repeat the Main photo (or any photo) within a post.
- Credit: white, left-aligned, `FOTO: SUBJECT / SOURCE`, inside the image over a black gradient. AI images: `ILUSTRASI AI: SUBJECT / AKALMESIN`.
- Photo runs to the bottom edge. No article label/kicker.
- Keep originals in `assets/originals/` and provenance in `assets/PROVENANCE.md`.

## Tokens (from the sheets, px at 1080 × 1350)

### Type

| Token | Font | Size / line height / tracking | Used for |
|---|---|---|---|
| type.main-headline | Manrope Bold 700 | 86 / 100 / −4% | Main headline |
| type.quote | Manrope Bold 700 | 78 / 100 / −4% | Quote statement |
| type.wordmark | Manrope Bold 700 | 44 / auto / 0% | `akalmesin` header, all designs |
| type.author | Manrope Bold 700 | 40 / 60 / 0% | Quote author |
| type.main-summary | Manrope Regular 400 | 37 / 55 / 0% | Main summary |
| type.detail-body | Manrope Regular 400 | 40 / 60 / 0% | Detail text |
| type.author-role | Manrope Light 300 | 40 / 60 / 0% | Quote author role |
| type.metadata | IBM Plex Mono Regular 400 | 21 / auto / +10% | Category, photo credit |

### Colour and edges

| Token | Value | Used for |
|---|---|---|
| color.ink | #000000 | Primary text, header divider, Quote header |
| color.editorial-gray | #EEEEEE | Main/Detail background, quote statement and quote mark |
| color.reversed-text | #FFFFFF | Author, author role, photo credit |
| overlay.quote | linear, top → bottom, 100% opacity: #D9D9D9 at 0% alpha → #000000 at 100% alpha | Quote photo |
| stroke.divider | 1 px #000000 | Header divider |
| radius.editorial | 0 | Everything; no shadows, no effects |

### Layout

| Layout | Values |
|---|---|
| Main | 64 sides (header 952 wide); header top 50; divider y130; divider → content 57 (content y187, frame 948 wide); headline may run to 971 wide; headline → summary 32; summary → image 64; image to the bottom edge (702 tall in the sample, from y648) |
| Detail-1 / Detail-2 | 64 sides (952 wide); header top 50; wordmark row → divider 20 (divider y130); divider → body 44 (body y174); body → image 54; image to the bottom edge (702 tall in the sample). Detail-2 has no sheet and uses Detail-1 |
| Quote | No masthead. 56 left/right (column 968); content box bottom at y1294 (56 from the bottom; sample box x56 y782 968 × 512); 40 between quote mark → statement → attribution; 8 author → role; photo crop intentionally oversized; overlay over the whole frame |
| Quote mark (from his example) | Manrope Bold 700 `“` at 400 px, ink 116 × 103 at x482 y782 (centred), 104 px box, colour `color.editorial-gray` per sheet 2 |

### Not on the sheets yet (`unmeasured` in tokens.json)

Current behaviour, kept until measured: wordmark row 60 (sheet says auto; implied by 50 + 60 + 20 = y130), metadata line height 30 (auto), category right-aligned, credit inset 64 left / 44 bottom, credit gradient 260 tall at 80% black, 24 between detail paragraphs. Agent rule: a quote statement has at most 3 lines.

## Layout recipes

- **Main:** masthead → headline → summary → full-width photo to the bottom edge, credit inside. No kicker, footer strip or arrow. Main + caption can be the whole post.
- **Detail-1:** masthead → news paragraph → supporting photo.
- **Detail-2:** masthead → shorter text → larger photo (same tokens as Detail-1).
- **Quote:** no masthead (owner t54u). Full-bleed blue-inked portrait (`object-fit: cover`, focal point `imagePosition`, optional zoom `imageScale`, face in the upper area), quote overlay over the whole frame, then centred mark → statement → author / role, anchored 56 px above the bottom. No on-image photo credit: provenance goes in `sources.md` / `assets/PROVENANCE.md`. Verified wording only. A `\n` in `quote` forces the line break (his example breaks after "perlu"). Max 3 lines; longer fails the build.

  post.json slide: `{"id", "layout": "quote", "quote", "author", "role", "quoteSource", "alt", "imagePosition", "imageScale", "imageSource"}`; no `credit`. The editor edits `quote`, `author`, `role`. Reference: [references/quote-example-2026-10-28.png](references/quote-example-2026-10-28.png).

## Photography and treatment

Prefer relevant, decent photography from the original news source; save the unfiltered original and provenance. If no decent supporting photo is available, generated supporting imagery is authorized with an honest AI-illustration label and saved prompt/provenance.

Use refined blue ink based on #4E4FEB, pale highlights, clear middle tones, readable shadows and delicate halftone/engraving texture. Preserve identity and factual scene when treating a real photograph. Avoid heavy noise, coarse scan lines, moiré, a uniform blue veil, neon/cyan shifts or crushed detail. Process separately; no extra filters or noise. See [photo-treatment.md](design.md) for the approved sample prompt.

Generated imagery must not masquerade as a documentary photograph of an event or be falsely attributed to the news source. Preserve relevant focal details when cropping and inspect the result at phone size.

### Image variety — confirmed revision, 26 October

Every slide in a post must use a different original photograph or illustration. A crop, zoom, recolor or new treatment of the Main photograph is still the same image and is not allowed as a supporting-photo replacement. Prefer another relevant source photo; otherwise use an honest, clearly labeled generated illustration. Keep an original-source ID and provenance for each image. The HTML builder checks source IDs and image bytes before creating the review.

### Credit and contrast

Main/detail credits are **always left-aligned**, white, and supported by the smooth black gradient. **Quotes and testimonials omit the on-image photo-credit line entirely**; retain attribution in captions and source records. Speaker name and role still appear with the quote. These rules supersede the earlier left/right choice.

Authentic photo: **`FOTO: SUBJECT/OBJECT NAME / SOURCE`**, e.g. **`FOTO: DARIO / ANTHROPIC`**. Always white #FFFFFF and left-aligned. Adjust local contrast or use a restrained dark gradient if needed, preserving factual detail. Do not switch the credit to black to solve contrast.

Generated illustration: use an explicit label such as **`ILUSTRASI AI: PUSAT DATA / AKALMESIN`**, with the same white overlay/readability rules. Credit/provenance must describe the actual asset.

## Photo sourcing and treatment production

Updated **27 October 2026**, Asia/Jakarta. This is the asset-production procedure and approved treatment recipe. The sections above own visual treatment, image variety, cropping and on-image credit rules. [Editorial style](voice.md#captions) owns caption attribution and synthetic-media disclosure. [assets/README.md](design.md#reference-images) describes asset storage.

### Source and preserve

After copy approval, prefer a relevant, decent photograph from the original news source. Save the unfiltered original, source URL, depicted subject/object, supplier/photographer, retrieval date and any known reuse conditions in the story's source package. A credit records provenance; it does not establish reuse rights.

Each slide needs a different original source image, as specified above. Give each asset an original-source ID. A new crop or treatment does not make the same photograph a new source image.

If no decent supporting photograph is available, the owner authorizes AI-generated supporting imagery. Use the imagegen skill/tool, preserve the prompt and output, and record it as an illustration supplied by akalmesin. Never present it as documentary evidence or attribute it to a news source that did not supply it. Apply the on-slide label from DESIGN.md and the caption disclosure from editorial-style.md; realistic synthetic video/audio also needs the applicable platform label.

### Produce and check

1. Keep original, processed and generated assets separate; never overwrite the original.
2. Use the approved blue-ink recipe below as the treatment reference. Adapt the subject description to the actual source while preserving the authentic scene and identity. References guide texture and tone, not new subjects or compositions.
3. Compare the processed photo with the original. Check faces, products, architecture, factual scene details, crop and readability at phone size. Reject invented or altered documentary details.
4. Save the tool, prompt, source/output paths and provenance with the story.
5. Apply credit/gradient/layout in the design layer according to this page. Do not bake poster text into the photographic treatment.

### Approved Meta treatment sample — historical source prompt

Created with built-in image generation/editing from the original unfiltered Meta server-room photograph. The supplied references guide the blue ink, pale highlights and fine print texture.

Photo: [meta-prometheus-blue-ink.png](references/approved-blue-ink-meta-prometheus.jpg)

Design direction: editorial duotone with #4E4FEB as the ink reference; tonal values vary through the photograph. Earlier colour filters and noise are removed. The original edit preserved that sample’s typography, copy and layout. Its old layout is superseded by the 25 October Main reference; the photographic ink treatment remains approved.

### Final edit prompt

Edit the FIRST reference image only: the authentic photograph of a Meta data center server-room aisle. Return ONLY the finished rectangular photograph, no poster, no typography, no border, no layout. Keep the original wide aspect ratio, crop, camera position, perspective, rack placement, cabling, ceiling lights, floor and distant doors faithfully unchanged. This is a careful tonal and print-texture treatment of an existing news photograph; do not invent or redesign any part of the room.

The SECOND and THIRD references are STYLE references only. Use their blue ink photographic treatment, pale paper highlights and fine controlled print texture. Do not include their eagle, statue, text, red color, graphic shapes or compositions.

Create a refined editorial blue duotone suitable for a minimalist technology news brand. The signature ink hue is #4E4FEB. Use rich violet-blue ink shadows, clear middle-tone separation, and luminous neutral off-white highlights. Maintain detailed readable racks and wires, with natural photographic depth. Introduce a very delicate engraved/halftone line texture following tonal detail, inspired especially by the third reference, plus extremely subtle fine paper grain. Texture should be fine and elegant at Instagram scale, not coarse scan lines, obvious dots, moiré, or uniform static noise. Keep the ceiling highlights and floor restrained, the center aisle clear and the edges deep. Balanced contrast, no crushed detail, no foggy blue veil, no cyan, no neon lighting, no glow. Overall polished tactile ink-on-paper editorial photography rather than a simple color overlay. High quality and sharp architecture. Preserve the documentary content of the source photograph.



## Reference images

[references/](references/) holds the three token sheets, the approved blue-ink sample (`approved-blue-ink-meta-prometheus.jpg`), the owner's ink/print style references (`photo-style-eagle.jpg`, `photo-style-classical-bust.jpg`) and his 25 October Main export (`owner-main-2026-10-25.jpg`, SHA-256 `14b340a0fe311b67a5ff0cc3f144d06d6687661e30aab825e93e42a2aeaa9ab4`; it shows `FOTO: ANTHROPIC / ANTHROPIC`, but the subject/source rule wins). Font licences do not grant rights to third-party photographs; keep provenance with each use.
