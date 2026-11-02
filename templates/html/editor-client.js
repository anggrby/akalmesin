// Editor client. Serializes edits in the owner-edits format used since 2026-10-28.
// Review mode also measures every slide with design-check's own inspectLayout (embedded above) and blocks Simpan on overflow.
(() => {
  const data = JSON.parse(document.getElementById('editor-data').textContent);
  const $ = (s, el = document) => el.querySelector(s),
    $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const draftKey = 'akalmesin-draft:' + data.slug + ':' + data.baseRevision;

  // Scale each 1080px slide to its card width.
  const fit = () => $$('.slide-frame').forEach(f => f.firstElementChild.style.setProperty('--k', f.clientWidth / 1080));
  addEventListener('resize', fit);
  fit();

  $$('.post [data-edit]').forEach(el => {
    el.contentEditable = 'true';
    el.spellcheck = false;
  });

  // DOM → text with **bold** markers (detail paragraphs only keep bold).
  function serialize(el, keepBold) {
    const walk = (node, inBold) => {
      if (node.nodeType === 3) return node.nodeValue;
      if (node.nodeType !== 1) return '';
      if (node.tagName === 'BR') return '\n';
      const bold = keepBold && (['B', 'STRONG'].includes(node.tagName) || /^(bold|[6-9]00)$/.test(node.style?.fontWeight || ''));
      let v = [...node.childNodes].map(c => walk(c, inBold || bold)).join('');
      if (node.classList?.contains('headline-line') && node.nextSibling) v += '\n';
      if (node.tagName === 'DIV' && node.previousSibling) v = '\n' + v;
      return bold && !inBold && v.trim() ? '**' + v + '**' : v;
    };
    return [...el.childNodes]
      .map(c => walk(c, false))
      .join('')
      .replace(/\*\*\*\*/g, '')
      .replace(/\u00a0/g, ' ')
      .trim();
  }
  const fieldValue = el => serialize(el, el.dataset.edit.startsWith('paragraph-'));

  function collect() {
    return {
      schemaVersion: 3,
      brand: 'akalmesin',
      kind: 'owner-edits',
      mode: data.mode,
      slug: data.slug,
      baseRevision: data.baseRevision,
      ...(data.designRevision ? {designRevision: data.designRevision} : {}),
      slides: $$('.slide-frame .post').map(post => ({
        slug: data.slug,
        slideId: post.dataset.slide,
        fields: Object.fromEntries($$('[data-edit]', post).map(el => [el.dataset.edit, fieldValue(el)]))
      })),
      captions: [{slug: data.slug, paragraphs: $$('[data-caption-paragraph]').map(el => el.innerText.replace(/\u00a0/g, ' ').trim())}],
      savedAt: new Date().toISOString()
    };
  }

  // Live rules: word count + warnings mirror the design:check rules.
  function check() {
    const p = data.policy,
      edits = collect(),
      warns = [];
    const paras = edits.captions[0].paragraphs;
    const body = paras
      .flatMap(x => x.split(/\n\s*\n/))
      .map(b =>
        b
          .split('\n')
          .filter(l => !/^\s*(Sumber\s*:|Ilustrasi\s+slide\s+\d+\s*:|#)/i.test(l))
          .join('\n')
          .trim()
      )
      .filter(Boolean);
    const words = (body.join(' ').match(/[\p{L}\p{N}]+(?:[.,'’\-][\p{L}\p{N}]+)*/gu) || []).length;
    $('#wordcount').textContent = `${words} kata · panduan ${p.caption.suggestedWordMinimum}–${p.caption.suggestedWordMaximum}`;
    const all = paras.join('\n\n');
    if (body.length !== p.caption.bodyParagraphs) warns.push(`Caption perlu ${p.caption.bodyParagraphs} paragraf isi; sekarang ${body.length}.`);
    if (words < p.caption.suggestedWordMinimum || words > p.caption.suggestedWordMaximum)
      warns.push(`Caption ${words} kata (panduan ${p.caption.suggestedWordMinimum}–${p.caption.suggestedWordMaximum}).`);
    if ((body.join(' ').match(/\?/g) || []).length !== 1 || !body.at(-1)?.endsWith('?'))
      warns.push('Caption perlu satu pertanyaan penutup di akhir paragraf terakhir.');
    if (!/^\s*Sumber\s*:.+\/\s*Foto\s*:.+$/im.test(all)) warns.push('Footer "Sumber: … / Foto: …" belum ada.');
    for (const m of all.matchAll(/^\s*Sumber\s*:.+?\/\s*Foto\s*:\s*(.+?)\s*$/gim))
      if (badCreditText(m[1])) warns.push(`Bagian "Foto:" di footer harus kredit singkat, tanpa kalimat: "${m[1]}".`);
    const tags = (all.match(/#[\p{L}\p{N}_]+/gu) || []).length;
    if (tags > p.caption.maxHashtags) warns.push(`Maksimal ${p.caption.maxHashtags} hashtag; sekarang ${tags}.`);
    const texts = [all],
      blocked = [];
    for (const s of edits.slides) {
      const warn = $(`[data-warn-for="${CSS.escape(s.slideId)}"]`);
      let w = '';
      texts.push(...Object.values(s.fields));
      if (['detail1', 'detail2'].includes(data.layouts[s.slideId])) {
        const t = Object.entries(s.fields)
          .filter(([k]) => k.startsWith('paragraph-'))
          .map(([, v]) => v)
          .join('\n');
        const n = (t.match(/\*\*[^*\n]+\*\*/g) || []).length;
        const max = t.toLowerCase().includes(p.wording.prefer) ? p.detail.benchmarkMaxEmphasisPhrases : p.detail.maxEmphasisPhrases;
        if (!n) w = 'belum ada frasa tebal';
        else if (n > max) w = `${n} frasa tebal (maks ${max})`;
      }
      if (s.fields.credit !== undefined && !/^(FOTO|ILUSTRASI AI): .+ \/ .+/.test(s.fields.credit))
        w = (w ? w + ' · ' : '') + 'format kredit: FOTO: SUBJEK / SUMBER';
      else if (s.fields.credit !== undefined && badCreditText(s.fields.credit.replace(/^(FOTO|ILUSTRASI AI): /, '')))
        w = (w ? w + ' · ' : '') + 'kredit harus singkat (maks. 100 karakter, 14 kata, tanpa kalimat)';
      const over = layoutProblems(s.slideId);
      if (over.length) {
        w = (w ? w + ' · ' : '') + over.join(' · ');
        blocked.push(`${s.slideId}: ${over.join(', ')}`);
      }
      $(`.slide-frame .post[data-slide="${CSS.escape(s.slideId)}"]`)?.classList.toggle('overflowing', over.length > 0);
      if (warn) warn.textContent = w ? '⚠ ' + w : '';
    }
    if (new RegExp('\\b' + p.wording.avoid.replace(/\s+/g, '\\s+') + '\\b', 'i').test(texts.join('\n')))
      warns.push(`Gunakan "${p.wording.prefer}", bukan "${p.wording.avoid}".`);
    $('#warnings').replaceChildren(...warns.map(t => Object.assign(document.createElement('li'), {textContent: t})));
    const save = $('#save');
    save.disabled = blocked.length > 0;
    save.title = blocked.length ? 'Teks meluap: ' + blocked.join('; ') : '';
    if (blocked.length) $('#status').textContent = 'Simpan nonaktif — teks meluap: ' + blocked.join('; ');
    else if ($('#status').textContent.startsWith('Simpan nonaktif')) $('#status').textContent = '';
    edits.blocked = blocked;
    return edits;
  }

  // Unscaled copies of the slides in #measure, kept in sync with the edited text, measured with inspectLayout.
  const measured = {};
  function layoutProblems(id) {
    if (!inspectLayout || !measureReady) return [];
    const src = $(`.slide-frame .post[data-slide="${CSS.escape(id)}"]`),
      copy = measured[id];
    if (!src || !copy) return [];
    $$('[data-edit]', src).forEach(el => {
      const c = $(`[data-edit="${CSS.escape(el.dataset.edit)}"]`, copy);
      if (c && c.innerHTML !== el.innerHTML) c.innerHTML = el.innerHTML;
    });
    return inspectLayout(data.gaps, copy).violations.filter(v => /^Text (overflow|outside)/.test(v));
  }
  let measureReady = false;
  if (inspectLayout) {
    $('#save').disabled = true;
    $('#status').textContent = 'memeriksa tata letak…';
    for (const src of $$('.slide-frame .post')) {
      const copy = src.cloneNode(true);
      $$('[contenteditable]', copy).forEach(el => el.removeAttribute('contenteditable'));
      $('#measure').append(copy);
      measured[src.dataset.slide] = copy;
    }
    Promise.all([document.fonts.ready, ...$$('#measure img').map(i => i.decode().catch(() => {}))]).then(() => {
      measureReady = true;
      $('#status').textContent = '';
      check();
    });
  }

  // Ctrl/Cmd+B toggles bold only inside detail paragraphs; headline/summary/credit stay plain.
  document.addEventListener('keydown', ev => {
    const el = ev.target.closest?.('[data-edit]');
    if (!(ev.ctrlKey || ev.metaKey) || ev.key.toLowerCase() !== 'b') return;
    ev.preventDefault();
    if (el?.dataset.edit.startsWith('paragraph-')) document.execCommand('bold');
  });
  // Paste as plain text so foreign formatting never sneaks in.
  document.addEventListener('paste', ev => {
    if (!ev.target.closest?.('[contenteditable="true"]')) return;
    ev.preventDefault();
    document.execCommand('insertText', false, ev.clipboardData.getData('text/plain'));
  });
  let timer;
  document.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const ed = check();
      try {
        localStorage.setItem(draftKey, JSON.stringify(ed));
        if (!ed.blocked.length) $('#status').textContent = 'draf tersimpan di browser';
      } catch {}
    }, 300);
  });

  // Restore an unsaved browser draft for the same revision.
  try {
    const draft = JSON.parse(localStorage.getItem(draftKey) || 'null');
    if (draft) {
      for (const s of draft.slides)
        for (const [k, v] of Object.entries(s.fields)) {
          const el = $(`.slide-frame .post[data-slide="${CSS.escape(s.slideId)}"] [data-edit="${CSS.escape(k)}"]`);
          if (!el) continue;
          if (k === 'headline')
            el.replaceChildren(...v.split('\n').map(l => Object.assign(document.createElement('span'), {className: 'headline-line', textContent: l})));
          else if (k.startsWith('paragraph-'))
            el.innerHTML = v.replace(/[&<>]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;'})[c]).replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
          else el.textContent = v;
        }
      draft.captions[0].paragraphs.forEach((v, i) => {
        const el = $(`[data-caption-paragraph="${i}"]`);
        if (el) el.innerText = v;
      });
      $('#status').textContent = 'draf browser dipulihkan';
    }
  } catch {}

  $('#save').addEventListener('click', async () => {
    const edits = check();
    if (edits.blocked.length) return;
    delete edits.blocked;
    const body = JSON.stringify(edits, null, 2);
    const filename = `${data.slug}-edits-${edits.savedAt.slice(0, 19).replace(/[:T]/g, '')}.json`;
    // Set by npm run review:serve (injects window.__AKALMESIN_SAVE_URL__). file:// and plain opens still download.
    const saveUrl = typeof window.__AKALMESIN_SAVE_URL__ === 'string' ? window.__AKALMESIN_SAVE_URL__ : null;
    if (saveUrl) {
      $('#save').disabled = true;
      $('#status').textContent = 'menyimpan…';
      try {
        const r = await fetch(saveUrl, {method: 'POST', headers: {'Content-Type': 'application/json'}, body});
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw Error(j.error || 'HTTP ' + r.status);
        try {
          localStorage.removeItem(draftKey);
        } catch {}
        $('#status').textContent = 'tersimpan di ' + (j.rel || 'edits/');
        return;
      } catch (err) {
        $('#status').textContent = 'gagal tulis edits/ (' + err.message + ') — unduhan cadangan';
      } finally {
        $('#save').disabled = false;
      }
    }
    const url = URL.createObjectURL(new Blob([body], {type: 'application/json'}));
    const a = Object.assign(document.createElement('a'), {href: url, download: filename});
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    if (!saveUrl) $('#status').textContent = 'tersimpan — kirim file .json ke agent';
  });
  check();
})();
