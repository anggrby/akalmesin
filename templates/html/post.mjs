// Slide renderer shared by copy:review (placeholders) and design:build (real images).
export const escapeHTML = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const e = escapeHTML;

/** Only **bold** markup is accepted in detail text; everything else is escaped. */
export function renderEmphasis(value) {
  const input = String(value), re = /\*\*([^*\n]+)\*\*/g;
  let out = '', last = 0, m;
  while ((m = re.exec(input))) { out += e(input.slice(last, m.index)) + '<strong>' + e(m[1]) + '</strong>'; last = re.lastIndex; }
  return out + e(input.slice(last));
}

/** One 1080×1350 <article>. imageURL null → grey placeholder labelled with the planned image + credit. */
export function renderSlide({post, slide, imageURL = null}) {
  const header = `<header class="masthead"><div class="masthead-row"><div class="wordmark">akalmesin</div><div class="category">${e(post.category)}</div></div></header>`;
  const copy = slide.layout === 'main'
    ? `<h1 class="headline" data-edit="headline">${slide.headline.map(l => `<span class="headline-line">${e(l)}</span>`).join('')}</h1><p class="summary" data-edit="summary">${e(slide.summary)}</p>`
    : slide.paragraphs.map((p, i) => `<p class="detail-copy" data-edit="paragraph-${i}">${renderEmphasis(p)}</p>`).join('');
  const media = imageURL
    ? `<img src="${e(imageURL)}" alt="${e(slide.alt)}" draggable="false">`
    : `<div class="placeholder" data-placeholder>GAMBAR: ${e(slide.plannedImage || slide.imageSource?.subject || 'belum dipilih')} — ${e(slide.credit)}</div>`;
  return `<article class="post post-${e(slide.layout)}" data-slide="${e(slide.id)}" style="--image-position:${e(slide.imagePosition || '50% 50%')}" aria-label="${e(slide.alt)}">${header}<div class="copy">${copy}</div><figure class="photo">${media}<p class="credit" data-edit="credit">${e(slide.credit)}</p></figure></article>`;
}

/** Standalone page with one slide, used for PNG screenshots. */
export function renderSlidePage({post, slide, imageURL, css}) {
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=1080"><title>${e(post.title)} — ${e(slide.id)}</title><style>${css}</style></head><body>${renderSlide({post, slide, imageURL})}</body></html>`;
}

/** The editor: every slide + caption, contenteditable, "Simpan" downloads edits.json.
 * mode "copy" = grey placeholders; mode "design" = real images. No server needed. */
export function renderEditor({post, mode, baseRevision, images = {}, css, editorCSS, clientJS, policy}) {
  const slides = post.slides.map((slide, i) => `<section class="slide-card"><div class="slide-label">${i + 1}. ${e(slide.id)}<span class="slide-warn" data-warn-for="${e(slide.id)}"></span></div><div class="slide-frame"><div class="slide-scale">${renderSlide({post, slide, imageURL: images[slide.id] || null})}</div></div><details class="alt"><summary>Alt text</summary><p>${e(slide.alt)}</p></details></section>`).join('');
  const caption = post.caption.map((p, i) => `<div class="caption-paragraph" contenteditable="true" data-caption-paragraph="${i}">${e(p)}</div>`).join('');
  const data = JSON.stringify({slug: post.slug, mode, baseRevision, slideIds: post.slides.map(s => s.id), layouts: Object.fromEntries(post.slides.map(s => [s.id, s.layout])), policy}).replaceAll('<', '\\u003c');
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(post.title)} — ${mode === 'copy' ? 'review teks' : 'review desain'}</title><style>${css}\n${editorCSS}</style></head><body class="editor mode-${e(mode)}">
<header class="toolbar"><div><strong>akalmesin</strong> · ${e(post.slug)} · ${mode === 'copy' ? 'Review teks (gambar = placeholder)' : 'Review desain'}</div><div class="tools"><span id="status" aria-live="polite"></span><button id="save" type="button">Simpan</button></div></header>
<p class="hint">Klik teks untuk mengedit. Ctrl/⌘+B = tebal (disimpan sebagai **teks**). Enter di judul = baris baru. "Simpan" mengunduh file edits.json — kirim file itu ke agent.</p>
<main class="slides">${slides}</main>
<section class="caption-panel"><h2>Caption <span id="wordcount"></span></h2>${caption}<ul id="warnings"></ul></section>
<script type="application/json" id="editor-data">${data}</script><script>${clientJS}</script></body></html>`;
}
