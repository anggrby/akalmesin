// Slide renderer shared by copy:review (placeholders) and design:build (real images).
export const escapeHTML = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]);
const e = escapeHTML;

/** Only **bold** markup is accepted in detail text; everything else is escaped. */
export function renderEmphasis(value) {
  const input = String(value),
    re = /\*\*([^*\n]+)\*\*/g;
  let out = '',
    last = 0,
    m;
  while ((m = re.exec(input))) {
    out += e(input.slice(last, m.index)) + '<strong>' + e(m[1]) + '</strong>';
    last = re.lastIndex;
  }
  return out + e(input.slice(last));
}

/** One 1080×1350 <article>. imageURL null → grey placeholder labelled with the planned image + credit. */
export function renderSlide({post, slide, imageURL = null}) {
  if (slide.layout === 'quote') return renderQuote({slide, imageURL});
  const header = `<header class="masthead"><div class="masthead-row"><div class="wordmark wordmark-logo" role="img" aria-label="akalmesin"></div><div class="category">${e(post.category)}</div></div></header>`;
  const copy =
    slide.layout === 'main'
      ? `<h1 class="headline" data-edit="headline">${slide.headline.map(l => `<span class="headline-line">${e(l)}</span>`).join('')}</h1><p class="summary" data-edit="summary">${e(slide.summary)}</p>`
      : slide.paragraphs.map((p, i) => `<p class="detail-copy" data-edit="paragraph-${i}">${renderEmphasis(p)}</p>`).join('');
  const media = imageURL
    ? `<img src="${e(imageURL)}" alt="${e(slide.alt)}" draggable="false">`
    : `<div class="placeholder" data-placeholder>GAMBAR: ${e(slide.plannedImage || slide.imageSource?.subject || 'belum dipilih')} — ${e(slide.credit)}</div>`;
  return `<article class="post post-${e(slide.layout)}" data-slide="${e(slide.id)}" style="--image-position:${e(slide.imagePosition || '50% 50%')}" aria-label="${e(slide.alt)}">${header}<div class="copy">${copy}</div><figure class="photo">${media}<p class="credit" data-edit="credit">${e(slide.credit)}</p></figure></article>`;
}

/** Quote: full-bleed photo, quote overlay, mark + statement + author/role. No masthead, no photo credit. */
function renderQuote({slide, imageURL}) {
  const media = imageURL
    ? `<img class="quote-photo" src="${e(imageURL)}" alt="${e(slide.alt)}" draggable="false">`
    : `<div class="placeholder" data-placeholder>GAMBAR: ${e(slide.plannedImage || slide.imageSource?.subject || 'belum dipilih')}</div>`;
  const style = `--image-position:${e(slide.imagePosition || '50% 25%')};--image-scale:${Number(slide.imageScale) || 1}`;
  return `<article class="post post-quote" data-slide="${e(slide.id)}" style="${style}" aria-label="${e(slide.alt)}">${media}<div class="quote-shade"></div><div class="quote-block"><p class="quote-mark" aria-hidden="true">\u201C</p><p class="quote-text" data-edit="quote">${e(slide.quote)}</p><div class="quote-attribution"><p class="quote-speaker" data-edit="author">${e(slide.author)}</p><p class="quote-role" data-edit="role">${e(slide.role)}</p></div></div></article>`;
}

/** Standalone page with one slide, used for PNG screenshots. */
export function renderSlidePage({post, slide, imageURL, css}) {
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=1080"><title>${e(post.title)} — ${e(slide.id)}</title><style>${css}</style></head><body>${renderSlide({post, slide, imageURL})}</body></html>`;
}

/** The editor: every slide + caption, contenteditable, "Simpan" downloads edits.json. No server needed.
 * mode "copy" = grey placeholders (legacy two-gate flow); mode "review" = the real slides with real images, a photo
 * list (source/licence/credit) and live checks; Simpan in review mode is the owner's single approval (npm run review:apply). */
export function renderEditor({
  post,
  mode,
  baseRevision,
  designRevision = null,
  gaps = {},
  inspectSource = null,
  creditSource = null,
  images = {},
  css,
  editorCSS,
  clientJS,
  policy
}) {
  const review = mode === 'review';
  const slides = post.slides
    .map(
      (slide, i) =>
        `<section class="slide-card"><div class="slide-label">${i + 1}. ${e(slide.id)}<span class="slide-warn" data-warn-for="${e(slide.id)}"></span></div><div class="slide-frame"><div class="slide-scale">${renderSlide({post, slide, imageURL: images[slide.id] || null})}</div></div><details class="alt"><summary>Alt text (tidak perlu disetujui)</summary><p>${e(slide.alt)}</p></details></section>`
    )
    .join('');
  const photos = review
    ? `<section class="photo-panel"><h2>Foto</h2><ol>${post.slides
        .map(s => {
          const src = s.imageSource || {},
            url = src.sourceURL || src.originalURL;
          return `<li><strong>${e(s.id)}</strong> — ${e(src.subject || s.plannedImage || '—')}<br><span class="meta">${e(src.supplier || '—')} · ${e(src.license || 'lisensi —')} · ${e(src.kind || '')}${src.treatment === 'none' ? ' · tanpa blue-ink' : ''}</span>${url ? `<br><a href="${e(url)}" target="_blank" rel="noopener">${e(url)}</a>` : ''}${s.credit ? `<br><span class="meta">Kredit di slide: ${e(s.credit)}</span>` : ''}</li>`;
        })
        .join('')}</ol></section>`
    : '';
  const caption = post.caption.map((p, i) => `<div class="caption-paragraph" contenteditable="true" data-caption-paragraph="${i}">${e(p)}</div>`).join('');
  const data = JSON.stringify({
    slug: post.slug,
    mode,
    baseRevision,
    designRevision,
    gaps,
    slideIds: post.slides.map(s => s.id),
    layouts: Object.fromEntries(post.slides.map(s => [s.id, s.layout])),
    policy
  }).replaceAll('<', '\\u003c');
  const label = review ? 'Review (teks + desain) — Simpan = setuju' : 'Review teks (gambar = placeholder)';
  const hint = review
    ? 'Ini slide asli. Klik teks di slide atau caption untuk mengedit; Ctrl/⌘+B = tebal. "Simpan" mengunduh file edits.json — kirim ke agent. Simpan tanpa perubahan = setuju apa adanya. Simpan nonaktif selama ada teks yang meluap.'
    : 'Klik teks untuk mengedit. Ctrl/⌘+B = tebal (disimpan sebagai **teks**). Enter di judul = baris baru. "Simpan" mengunduh file edits.json — kirim file itu ke agent.';
  const code =
    (inspectSource ? `const inspectLayout = (${inspectSource});\n` : 'const inspectLayout = null;\n') +
    (creditSource ? `const badCreditText = (${creditSource});\n` : 'const badCreditText = () => false;\n');
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(post.title)} — ${review ? 'review' : 'review teks'}</title><style>${css}\n${editorCSS}</style></head><body class="editor mode-${e(mode)}">
<header class="toolbar"><div><strong>akalmesin</strong> · ${e(post.slug)} · ${label}</div><div class="tools"><span id="status" aria-live="polite"></span><button id="save" type="button">Simpan</button></div></header>
<p class="hint">${hint}</p>
<div class="review-body"><main class="slides">${slides}</main>${photos}</div>
<section class="caption-panel"><h2>Caption <span id="wordcount"></span></h2>${caption}<ul id="warnings"></ul></section>
<div id="measure" aria-hidden="true"></div>
<script type="application/json" id="editor-data">${data}</script><script>${code.replaceAll('</script', '<\\/script')}${clientJS}</script></body></html>`;
}
