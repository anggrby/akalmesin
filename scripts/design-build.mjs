// npm run design:build -- <slug>
// Step 6–7: blue-ink every original, render each slide to a 1080×1350 PNG, a contact sheet,
// a design-mode editor and the self-contained final HTML. Requires current copy approval.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import sharp from 'sharp';
import {ROOT, loadPost, parseArgs, writeFile, writeJSON, saveWorkflow, appendLog, copyRevision, designRevision, processedImage, requireApproval, fileHash, launchBrowser, wib, isMain, fail, rel} from './core.mjs';
import {blueInk} from './blue-ink.mjs';
import {renderSlidePage} from '../templates/html/post.mjs';
import {pageCSS, editorHTML} from './copy-review.mjs';

/** Runs inside the page: geometry rules from brand/design.md. */
export function inspectLayout() {
  const post = document.querySelector('.post'), b = post.getBoundingClientRect(), v = [];
  const rect = el => { const r = el.getBoundingClientRect(); return {x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom, right: r.right}; };
  if (b.width !== 1080 || b.height !== 1350) v.push('Canvas dimensions');
  for (const el of document.querySelectorAll('[data-edit], .wordmark, .category')) {
    const r = el.getBoundingClientRect(), st = getComputedStyle(el);
    if (r.left < b.left - .5 || r.right > b.right + .5 || r.top < b.top - .5 || r.bottom > b.bottom + .5) v.push('Text outside canvas: ' + (el.dataset.edit || el.className));
    if (el.scrollWidth > el.clientWidth + 1 || (st.overflowY === 'hidden' && el.scrollHeight > el.clientHeight + 1)) v.push('Text overflow: ' + (el.dataset.edit || el.className));
  }
  const credit = document.querySelector('.credit'), cs = credit && getComputedStyle(credit), photo = document.querySelector('.photo');
  if (!credit) v.push('Photo credit missing');
  else { if (cs.color !== 'rgb(255, 255, 255)') v.push('Credit must be white'); if (cs.textAlign !== 'left') v.push('Credit must be left-aligned'); }
  let gap = null, pr = null;
  if (photo) {
    gap = photo.getBoundingClientRect().top - document.querySelector('.copy').getBoundingClientRect().bottom; pr = rect(photo);
    if (Math.abs(gap - 54) > .1) v.push('Text/photo gap is ' + gap);
    if (pr.height < 360) v.push('Photo too short for useful crop');
    if (Math.abs(pr.bottom - b.bottom) > .1) v.push('Photo does not reach canvas bottom');
    if (credit) { const c = credit.getBoundingClientRect(); if (c.top < pr.y || c.bottom > pr.bottom) v.push('Credit outside photo'); }
  }
  if ([...document.images].some(i => !i.complete || !i.naturalWidth)) v.push('Image not loaded');
  if (document.querySelector('[data-placeholder]')) v.push('Placeholder still present');
  const faces = [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family);
  if (!faces.includes('Manrope') || !faces.includes('IBM Plex Mono')) v.push('Bundled fonts not loaded');
  return {canvas: rect(post), photo: pr, textPhotoGap: gap, violations: v};
}

async function contactSheet(files, target, cols = 3) {
  const tw = 360, th = 450, g = 16, p = 24, rows = Math.ceil(files.length / cols);
  const layers = await Promise.all(files.map(async (f, i) => ({input: await sharp(f).resize(tw, th).png().toBuffer(), left: p + (i % cols) * (tw + g), top: p + Math.floor(i / cols) * (th + g)})));
  await sharp({create: {width: p * 2 + cols * tw + (cols - 1) * g, height: p * 2 + rows * th + (rows - 1) * g, channels: 3, background: '#D7D7D7'}}).composite(layers).png().toFile(target);
}

export async function designBuild(ref) {
  const {paths, post, workflow} = loadPost(ref);
  requireApproval(workflow, 'copy', copyRevision(post));
  const slidesDir = path.join(paths.out, 'slides'), pngDir = path.join(paths.out, 'png');
  fs.rmSync(slidesDir, {recursive: true, force: true}); fs.rmSync(pngDir, {recursive: true, force: true});
  const images = [];
  for (const s of post.slides) {
    if (!s.imageSource?.originalFile) throw Error(`Slide ${s.id} has no imageSource.originalFile`);
    const src = path.join(paths.dir, s.imageSource.originalFile), dst = processedImage(paths.dir, s);
    if (!fs.existsSync(src)) throw Error('Missing original ' + rel(src));
    if (s.imageSource.treatment === 'none') fs.copyFileSync(src, dst); else await blueInk(src, dst, s.imageSource.process || {});
    images.push(dst);
  }
  const css = pageCSS(), browser = await launchBrowser(), slides = [], errors = [];
  try {
    const ctx = await browser.newContext({viewport: {width: 1080, height: 1350}, deviceScaleFactor: 1, colorScheme: 'light', reducedMotion: 'reduce'});
    await ctx.route(/^https?:\/\//, r => r.abort());
    const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
    for (const [i, s] of post.slides.entries()) {
      const html = path.join(slidesDir, `${s.id}.html`), png = path.join(pngDir, `${String(i + 1).padStart(2, '0')}-${s.id}.png`);
      writeFile(html, renderSlidePage({post, slide: s, imageURL: pathToFileURL(images[i]).href, css}));
      await page.goto(pathToFileURL(html).href, {waitUntil: 'load'});
      await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(i => i.decode())); });
      const layout = await page.evaluate(inspectLayout);
      if (layout.violations.length) throw Error(`${s.id}: ${layout.violations.join('; ')}`);
      fs.mkdirSync(pngDir, {recursive: true});
      await page.locator('.post').screenshot({path: png, type: 'png', animations: 'disabled'});
      slides.push({id: s.id, layout: s.layout, html: rel(html), png: rel(png), pngHash: fileHash(png), imageHash: fileHash(images[i]), geometry: layout});
    }
    if (errors.length) throw Error('Browser errors: ' + errors.join('; '));
  } finally { await browser.close(); }
  const pngs = slides.map(s => path.join(ROOT, s.png));
  await contactSheet(pngs, path.join(paths.out, 'contact-sheet.png'));
  // Final HTML: one file, images embedded as 1080-px JPEG so it opens anywhere.
  const embedded = {};
  for (const [i, s] of post.slides.entries()) embedded[s.id] = 'data:image/jpeg;base64,' + (await sharp(images[i]).resize({width: 1080, withoutEnlargement: true}).jpeg({quality: 88}).toBuffer()).toString('base64');
  writeFile(path.join(paths.out, `${post.slug}.html`), editorHTML(post, 'design', embedded));
  const build = {schemaVersion: 1, slug: post.slug, copyRevision: copyRevision(post), designRevision: designRevision(post, paths.dir), builtAt: new Date().toISOString(), slides};
  writeJSON(path.join(paths.out, 'build.json'), build);
  workflow.designStale = false; workflow.stage = 'design-check';
  if (workflow.approvals.final && workflow.approvals.final.revision !== build.designRevision) {
    workflow.history.push({event: 'approval-invalidated', gate: 'final', reason: 'design rebuilt', at: build.builtAt, approval: workflow.approvals.final}); workflow.approvals.final = null;
  }
  workflow.history.push({event: 'design-built', designRevision: build.designRevision, at: build.builtAt});
  saveWorkflow(paths, workflow);
  appendLog(paths.log, `${wib()} — design build`, `Design revision ${build.designRevision.slice(0, 12)} · ${slides.length} PNGs · blue ink from originals (crop/pad in post.json).`);
  return build;
}

if (isMain(import.meta.url)) try {
  const b = await designBuild(parseArgs()._[0]);
  console.log(`✓ ${b.slides.length} slides rendered → design ${b.designRevision.slice(0, 12)}\n  next: npm run design:check -- ${b.slug}`);
} catch (e) { fail(e); }
