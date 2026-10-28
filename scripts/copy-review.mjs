// npm run copy:review -- <slug> [--screenshot file.png]
// Step 3–4: writes out/copy-proposal.md (plain text for chat) and out/copy-review.html,
// a self-contained text-only editor with grey image placeholders. Open it, edit, press Simpan.
import fs from 'node:fs';
import path from 'node:path';
import {
  ROOT,
  loadPost,
  parseArgs,
  writeFile,
  saveWorkflow,
  copyRevision,
  captionBody,
  countWords,
  slideTokensCSS,
  fontCSS,
  launchBrowser,
  isMain,
  fail,
  rel
} from './core.mjs';
import {checkPost, loadPolicy} from './quality.mjs';
import {renderEditor} from '../templates/html/post.mjs';

const T = f => fs.readFileSync(path.join(ROOT, 'templates/html', f), 'utf8');
export const pageCSS = (fonts = fontCSS()) => fonts + slideTokensCSS() + T('post.css');

const FONTS = path.join(ROOT, 'templates/html/fonts');
/** Every character the editor will show for this post (copy + UI strings). */
const editorChars = post => new Set([...JSON.stringify(post) + T('editor-client.js') + T('editor.css')]);
/**
 * Small fonts for the copy-review editor only (scripts/fonts-subset.py: Manrope 300–700 and Plex Mono 400,
 * Latin + punctuation, woff2). Falls back to the full brand fonts if the post uses a character outside the subset.
 * The design build and the final HTML always use the full fonts.
 */
export function editorFontCSS(post) {
  const cov = JSON.parse(fs.readFileSync(path.join(FONTS, 'coverage.json'), 'utf8')), dropped = new Set([...cov.droppedFromManrope]);
  const missing = [...editorChars(post)].filter(c => dropped.has(c)); // chars the full font draws but the subset lacks
  if (missing.length) return {css: fontCSS(), slim: false, missing};
  const face = (family, weight) => `@font-face{font-family:'${family}';src:url(data:font/woff2;base64,${fs.readFileSync(path.join(FONTS, cov.files[family])).toString('base64')}) format('woff2');font-weight:${weight};font-display:block}`;
  return {css: face('Manrope', cov.weights.Manrope) + face('IBM Plex Mono', cov.weights['IBM Plex Mono']), slim: true, missing};
}

export function editorHTML(post, mode, images = {}) {
  const fonts = mode === 'copy' ? editorFontCSS(post).css : fontCSS();
  return renderEditor({post, mode, baseRevision: copyRevision(post), images, css: pageCSS(fonts), editorCSS: T('editor.css'), clientJS: T('editor-client.js'), policy: loadPolicy()});
}

export function proposalMarkdown(post, report) {
  const slides = post.slides
    .map(
      (s, i) =>
        `### ${i + 1}. ${s.id}\n` +
        (s.layout === 'main' ? `**${s.headline.join(' / ')}**\n\n${s.summary}` : s.paragraphs.join('\n\n')) +
        `\n\n_${s.credit}_ · gambar: ${s.plannedImage || s.imageSource?.subject || '—'}`
    )
    .join('\n\n');
  const notes = report.issues.map(i => `- ${i.severity === 'error' ? '✗' : '⚠'} ${i.message}`).join('\n') || '- ✓ semua aturan otomatis lolos';
  return `# ${post.title}\n\nRevisi teks ${copyRevision(post).slice(0, 12)} · ${countWords(captionBody(post.caption).join(' '))} kata caption\n\n## Slide\n\n${slides}\n\n## Caption\n\n${post.caption.join('\n\n')}\n\n## Pemeriksaan\n\n${notes}\n`;
}

export async function screenshot(file, target, {width = 1440, height = 1100, fullPage = true} = {}) {
  const browser = await launchBrowser();
  try {
    const page = await (await browser.newContext({viewport: {width, height}})).newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('file://' + path.resolve(file));
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({path: target, fullPage});
    if (errors.length) throw Error('Editor script errors: ' + errors.join('; '));
  } finally {
    await browser.close();
  }
}

export async function copyReview(ref, {shot} = {}) {
  const {paths, post, workflow} = loadPost(ref);
  const report = checkPost(post);
  writeFile(path.join(paths.out, 'copy-proposal.md'), proposalMarkdown(post, report));
  const html = path.join(paths.out, 'copy-review.html');
  const f = editorFontCSS(post);
  if (!f.slim) console.warn(`⚠ Full fonts embedded: the copy uses characters outside the editor subset (${f.missing.join(' ')}). Add them to scripts/fonts-subset.py if they recur.`);
  writeFile(html, editorHTML(post, 'copy'));
  workflow.stage = 'copy-review';
  workflow.history.push({event: 'copy-review', revision: copyRevision(post), at: new Date().toISOString()});
  saveWorkflow(paths, workflow);
  if (shot) await screenshot(html, shot);
  return {html, report};
}

if (isMain(import.meta.url))
  try {
    const a = parseArgs();
    const {html, report} = await copyReview(a._[0], {shot: a.screenshot});
    console.log(`✓ ${rel(html)}\n✓ ${rel(path.join(path.dirname(html), 'copy-proposal.md'))}`);
    for (const i of report.issues) console.log(`  ${i.severity === 'error' ? '✗' : '⚠'} ${i.message}`);
  } catch (e) {
    fail(e);
  }
