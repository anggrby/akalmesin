// Editorial rules a machine can check (ported from editorial-quality.mjs).
// Taste, truth and attribution stay with the owner.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {ROOT, readJSON, captionBody, countWords, isDetail, splitCaptionCredits, ILLUSTRATION_LINE} from './core.mjs';

export const loadPolicy = (root = ROOT) => readJSON(path.join(root, 'brand/editorial-policy.json'));
const CREDIT = /^(FOTO|ILUSTRASI AI): .+ \/ .+/;
const CREDIT_MAX = 100,
  CREDIT_MAX_WORDS = 14,
  CREDIT_PREFIX = /^(FOTO|ILUSTRASI AI): /;
/** Person-name comparison: case-, diacritic- and spacing-insensitive, exact otherwise. */
export const normName = s =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('id')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
export const PERSON_PHOTO_KINDS = ['news-photo', 'portrait-photo'];

/** Pure rules. Pass {dir} (the post folder) to also check image files and PROVENANCE.md. */
export function checkPost(post, policy = loadPolicy(), {dir} = {}) {
  const {caption: rules, detail, wording} = policy,
    issues = [];
  const add = (code, message, severity = 'error') => issues.push({code, severity, message});
  const paragraphs = Array.isArray(post.caption) ? post.caption : [];
  const caption = paragraphs.join('\n\n'),
    body = captionBody(paragraphs);
  const words = countWords(body.join(' '));
  if (body.length !== rules.bodyParagraphs) add('caption_paragraphs', `Caption perlu ${rules.bodyParagraphs} paragraf isi; ditemukan ${body.length}.`);
  if (words < rules.suggestedWordMinimum || words > rules.suggestedWordMaximum)
    add('caption_length', `Caption sekitar ${words} kata; panduan ${rules.suggestedWordMinimum}–${rules.suggestedWordMaximum} kata.`, 'warning');
  if ((body.join(' ').match(/\?/g) || []).length !== rules.closingQuestionCount || !body.at(-1)?.trim().endsWith('?'))
    add('closing_question', 'Caption perlu satu pertanyaan di akhir paragraf terakhir.');
  const footer = caption
    .split(/\r?\n/)
    .map(l => /^\s*Sumber\s*:\s*(.+?)\s*\/\s*Foto\s*:\s*(.+?)\s*$/i.exec(l))
    .find(Boolean);
  if (!footer) add('caption_footer', 'Tambahkan footer Sumber: … / Foto: … di caption.');
  // Credit fragments are outside the copy revision (t65u), so they must stay short credits, never sentences.
  const badCredit = t => t.length > CREDIT_MAX || countWords(t) > CREDIT_MAX_WORDS || /[.!?;](\s|$)|[—–]|\b(?:Sumber|Foto)\s*:/i.test(t);
  for (const frag of splitCaptionCredits(paragraphs).fragments.filter(x => /^Foto:/.test(x)))
    if (badCredit(frag.replace(/^Foto:\s*/, '')))
      add('credit_fragment', `Bagian "Foto:" di footer harus kredit singkat (≤${CREDIT_MAX} karakter, ≤${CREDIT_MAX_WORDS} kata, tanpa kalimat): "${frag}".`);
  for (const line of caption.split(/\r?\n/))
    if (/^\s*Ilustrasi\s+slide\b/i.test(line) && !ILLUSTRATION_LINE.test(line))
      add('credit_fragment', `Baris ilustrasi harus persis "Ilustrasi slide N: AI / akalmesin": "${line.trim()}".`);
  const tags = [...caption.matchAll(/#[\p{L}\p{N}_]+/gu)].length;
  if (tags > rules.maxHashtags) add('hashtag_limit', `Maksimal ${rules.maxHashtags} hashtag; ditemukan ${tags}.`);
  const allText = [caption, post.title];
  for (const [i, slide] of (post.slides || []).entries()) {
    allText.push(...(slide.headline || []), slide.summary || '', ...(slide.paragraphs || []), slide.alt || '');
    if (slide.layout === 'quote') {
      allText.push(slide.quote || '', slide.author || '', slide.role || '');
      if (!slide.quote?.trim() || !slide.author?.trim() || !slide.role?.trim())
        add('quote_fields', `Slide ${slide.id}: quote perlu teks kutipan, nama, dan jabatan.`);
      if (slide.credit) add('quote_credit', `Slide ${slide.id}: slide kutipan tidak memakai kredit foto; catat di sources/PROVENANCE.`);
      if (!slide.quoteSource?.trim()) add('quote_source', `Slide ${slide.id}: simpan sumber asli kutipan di quoteSource.`);
      // Quote photo must be the quoted person (declared subject; a face cannot be verified by code).
      const src = slide.imageSource || {},
        names = [slide.author, ...(slide.subjectAliases || [])].map(normName).filter(Boolean);
      if (!src.subject?.trim()) add('quote_photo_subject', `Slide ${slide.id}: imageSource.subject harus nama orang yang dikutip.`);
      else if (!names.includes(normName(src.subject)))
        add('quote_photo_subject', `Slide ${slide.id}: foto kutipan harus foto ${slide.author}, bukan "${src.subject}".`);
      if (!PERSON_PHOTO_KINDS.includes(src.kind))
        add('quote_photo_kind', `Slide ${slide.id}: imageSource.kind harus ${PERSON_PHOTO_KINDS.join(' atau ')} (foto asli orangnya), bukan "${src.kind}".`);
      if (dir && src.subject) {
        const prov = path.join(dir, 'assets/PROVENANCE.md');
        if (!fs.existsSync(prov) || !normName(fs.readFileSync(prov, 'utf8')).includes(normName(src.subject)))
          add('quote_provenance', `Slide ${slide.id}: assets/PROVENANCE.md harus mencatat ${src.subject}.`);
      }
    } else if (!CREDIT.test(slide.credit || '')) add('credit_format', `Slide ${slide.id}: kredit harus "FOTO: SUBJEK / SUMBER".`);
    else if (badCredit(slide.credit.replace(CREDIT_PREFIX, '')))
      add('credit_fragment', `Slide ${slide.id}: kredit harus singkat (≤${CREDIT_MAX} karakter, ≤${CREDIT_MAX_WORDS} kata, tanpa kalimat).`);
    if (!slide.alt?.trim()) add('alt_missing', `Slide ${slide.id}: alt text kosong.`);
    if (slide.imageSource?.kind === 'ai-illustration' && !new RegExp(`Ilustrasi\\s+slide\\s+${i + 1}\\s*:\\s*AI\\s*\\/\\s*akalmesin`, 'i').test(caption))
      add('illustration_disclosure', `Tambahkan Ilustrasi slide ${i + 1}: AI / akalmesin pada caption.`);
    if (isDetail(slide)) {
      const text = (slide.paragraphs || []).join('\n'),
        phrases = [...text.matchAll(/\*\*([^*\n]+)\*\*/g)];
      if (!phrases.length || text.replace(/\*\*([^*\n]+)\*\*/g, '').includes('**'))
        add('detail_emphasis', `Slide ${slide.id}: tandai frasa penting dengan **teks**.`);
      const price = slide.emphasisKind === 'price' || /(?:^|-)harga(?:-|$)/i.test(slide.id) || /^\s*(?:harga|tarif)\b/i.test(text);
      const bench = !price && text.toLocaleLowerCase('id').includes(wording.prefer.toLocaleLowerCase('id'));
      if (phrases.length > (bench ? detail.benchmarkMaxEmphasisPhrases : detail.maxEmphasisPhrases))
        add('detail_emphasis_count', `Slide ${slide.id}: terlalu banyak frasa tebal.`);
    }
  }
  // No image may repeat within a post (same source id, or same original bytes when dir is given).
  const seen = new Map();
  for (const s of post.slides || []) {
    const keys = [s.imageSource?.id && 'id:' + s.imageSource.id];
    const f = dir && s.imageSource?.originalFile && path.join(dir, s.imageSource.originalFile);
    if (f && fs.existsSync(f)) keys.push('sha:' + createHash('sha256').update(fs.readFileSync(f)).digest('hex'));
    for (const k of keys.filter(Boolean)) {
      if (seen.has(k) && seen.get(k) !== s.id)
        add('image_reused', `Slide ${s.id}: gambar sama dengan slide ${seen.get(k)}; setiap slide perlu gambar berbeda.`);
      else seen.set(k, s.id);
    }
  }
  if (post.slides?.[0]?.layout !== 'main') add('main_first', 'Slide pertama harus Main.');
  const avoid = wording.avoid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  if (new RegExp('\\b' + avoid + '\\b', 'i').test(allText.join('\n'))) add('benchmark_wording', `Gunakan ${wording.prefer}, bukan ${wording.avoid}.`);
  return {
    wordCount: words,
    bodyParagraphs: body.length,
    issues,
    errors: issues.filter(i => i.severity === 'error'),
    warnings: issues.filter(i => i.severity === 'warning')
  };
}
