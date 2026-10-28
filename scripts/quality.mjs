// Editorial rules a machine can check (ported from editorial-quality.mjs).
// Taste, truth and attribution stay with the owner.
import path from 'node:path';
import {ROOT, readJSON, captionBody, countWords, isDetail} from './core.mjs';

export const loadPolicy = (root = ROOT) => readJSON(path.join(root, 'brand/editorial-policy.json'));
const CREDIT = /^(FOTO|ILUSTRASI AI): .+ \/ .+/;

export function checkPost(post, policy = loadPolicy()) {
  const {caption: rules, detail, wording} = policy, issues = [];
  const add = (code, message, severity = 'error') => issues.push({code, severity, message});
  const paragraphs = Array.isArray(post.caption) ? post.caption : [];
  const caption = paragraphs.join('\n\n'), body = captionBody(paragraphs);
  const words = countWords(body.join(' '));
  if (body.length !== rules.bodyParagraphs) add('caption_paragraphs', `Caption perlu ${rules.bodyParagraphs} paragraf isi; ditemukan ${body.length}.`);
  if (words < rules.suggestedWordMinimum || words > rules.suggestedWordMaximum) add('caption_length', `Caption sekitar ${words} kata; panduan ${rules.suggestedWordMinimum}–${rules.suggestedWordMaximum} kata.`, 'warning');
  if ((body.join(' ').match(/\?/g) || []).length !== rules.closingQuestionCount || !body.at(-1)?.trim().endsWith('?')) add('closing_question', 'Caption perlu satu pertanyaan di akhir paragraf terakhir.');
  const footer = caption.split(/\r?\n/).map(l => /^\s*Sumber\s*:\s*(.+?)\s*\/\s*Foto\s*:\s*(.+?)\s*$/i.exec(l)).find(Boolean);
  if (!footer) add('caption_footer', 'Tambahkan footer Sumber: … / Foto: … di caption.');
  const tags = [...caption.matchAll(/#[\p{L}\p{N}_]+/gu)].length;
  if (tags > rules.maxHashtags) add('hashtag_limit', `Maksimal ${rules.maxHashtags} hashtag; ditemukan ${tags}.`);
  const allText = [caption, post.title];
  for (const [i, slide] of (post.slides || []).entries()) {
    allText.push(...(slide.headline || []), slide.summary || '', ...(slide.paragraphs || []), slide.alt || '');
    if (!CREDIT.test(slide.credit || '')) add('credit_format', `Slide ${slide.id}: kredit harus "FOTO: SUBJEK / SUMBER".`);
    if (!slide.alt?.trim()) add('alt_missing', `Slide ${slide.id}: alt text kosong.`);
    if (slide.imageSource?.kind === 'ai-illustration' && !new RegExp(`Ilustrasi\\s+slide\\s+${i + 1}\\s*:\\s*AI\\s*\\/\\s*akalmesin`, 'i').test(caption))
      add('illustration_disclosure', `Tambahkan Ilustrasi slide ${i + 1}: AI / akalmesin pada caption.`);
    if (isDetail(slide)) {
      const text = (slide.paragraphs || []).join('\n'), phrases = [...text.matchAll(/\*\*([^*\n]+)\*\*/g)];
      if (!phrases.length || text.replace(/\*\*([^*\n]+)\*\*/g, '').includes('**')) add('detail_emphasis', `Slide ${slide.id}: tandai frasa penting dengan **teks**.`);
      const price = slide.emphasisKind === 'price' || /(?:^|-)harga(?:-|$)/i.test(slide.id) || /^\s*(?:harga|tarif)\b/i.test(text);
      const bench = !price && text.toLocaleLowerCase('id').includes(wording.prefer.toLocaleLowerCase('id'));
      if (phrases.length > (bench ? detail.benchmarkMaxEmphasisPhrases : detail.maxEmphasisPhrases)) add('detail_emphasis_count', `Slide ${slide.id}: terlalu banyak frasa tebal.`);
    }
  }
  if (post.slides?.[0]?.layout !== 'main') add('main_first', 'Slide pertama harus Main.');
  const avoid = wording.avoid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  if (new RegExp('\\b' + avoid + '\\b', 'i').test(allText.join('\n'))) add('benchmark_wording', `Gunakan ${wording.prefer}, bukan ${wording.avoid}.`);
  return {wordCount: words, bodyParagraphs: body.length, issues, errors: issues.filter(i => i.severity === 'error'), warnings: issues.filter(i => i.severity === 'warning')};
}
