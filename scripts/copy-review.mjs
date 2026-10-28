// npm run copy:review -- <slug> [--screenshot file.png]
// Step 3–4: writes out/copy-proposal.md (plain text for chat) and out/copy-review.html,
// a self-contained text-only editor with grey image placeholders. Open it, edit, press Simpan.
import fs from 'node:fs';
import path from 'node:path';
import {ROOT, loadPost, parseArgs, writeFile, saveWorkflow, copyRevision, captionBody, countWords, slideTokensCSS, fontCSS, launchBrowser, isMain, fail, rel} from './core.mjs';
import {checkPost, loadPolicy} from './quality.mjs';
import {renderEditor} from '../templates/html/post.mjs';

const T = f => fs.readFileSync(path.join(ROOT, 'templates/html', f), 'utf8');
export const pageCSS = () => fontCSS() + slideTokensCSS() + T('post.css');

export function editorHTML(post, mode, images = {}) {
  return renderEditor({post, mode, baseRevision: copyRevision(post), images, css: pageCSS(), editorCSS: T('editor.css'), clientJS: T('editor-client.js'), policy: loadPolicy()});
}

export function proposalMarkdown(post, report) {
  const slides = post.slides.map((s, i) => `### ${i + 1}. ${s.id}\n` + (s.layout === 'main' ? `**${s.headline.join(' / ')}**\n\n${s.summary}` : s.paragraphs.join('\n\n')) + `\n\n_${s.credit}_ · gambar: ${s.plannedImage || s.imageSource?.subject || '—'}`).join('\n\n');
  const notes = report.issues.map(i => `- ${i.severity === 'error' ? '✗' : '⚠'} ${i.message}`).join('\n') || '- ✓ semua aturan otomatis lolos';
  return `# ${post.title}\n\nRevisi teks ${copyRevision(post).slice(0, 12)} · ${countWords(captionBody(post.caption).join(' '))} kata caption\n\n## Slide\n\n${slides}\n\n## Caption\n\n${post.caption.join('\n\n')}\n\n## Pemeriksaan\n\n${notes}\n`;
}

export async function screenshot(file, target, {width = 1440, height = 1100, fullPage = true} = {}) {
  const browser = await launchBrowser();
  try {
    const page = await (await browser.newContext({viewport: {width, height}})).newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto('file://' + path.resolve(file)); await page.evaluate(() => document.fonts.ready);
    await page.screenshot({path: target, fullPage});
    if (errors.length) throw Error('Editor script errors: ' + errors.join('; '));
  } finally { await browser.close(); }
}

export async function copyReview(ref, {shot} = {}) {
  const {paths, post, workflow} = loadPost(ref);
  const report = checkPost(post);
  writeFile(path.join(paths.out, 'copy-proposal.md'), proposalMarkdown(post, report));
  const html = path.join(paths.out, 'copy-review.html');
  writeFile(html, editorHTML(post, 'copy'));
  workflow.stage = 'copy-review';
  workflow.history.push({event: 'copy-review', revision: copyRevision(post), at: new Date().toISOString()});
  saveWorkflow(paths, workflow);
  if (shot) await screenshot(html, shot);
  return {html, report};
}

if (isMain(import.meta.url)) try {
  const a = parseArgs(); const {html, report} = await copyReview(a._[0], {shot: a.screenshot});
  console.log(`✓ ${rel(html)}\n✓ ${rel(path.join(path.dirname(html), 'copy-proposal.md'))}`);
  for (const i of report.issues) console.log(`  ${i.severity === 'error' ? '✗' : '⚠'} ${i.message}`);
} catch (e) { fail(e); }
