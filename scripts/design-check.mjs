// npm run design:check -- <slug>
// Step 7: proves the build matches the approved copy and the brand rules before final review.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import sharp from 'sharp';
import {
  ROOT,
  loadPost,
  parseArgs,
  readJSON,
  writeJSON,
  copyRevision,
  copyApprovalCurrent,
  designRevision,
  buildCurrent,
  processedImage,
  fileHash,
  launchBrowser,
  isMain,
  fail,
  imageGaps
} from './core.mjs';
import {checkPost} from './quality.mjs';
import {inkStats, looksInked} from './blue-ink.mjs';
import {inspectLayout} from './design-build.mjs';

/** opts.review: checked before the single review approval, so a missing copy approval is not a problem. */
export async function designCheck(ref, {review = false} = {}) {
  const {paths, post, workflow} = loadPost(ref);
  const problems = [],
    add = m => problems.push(m),
    result = {slides: []};
  const buildFile = path.join(paths.out, 'build.json');
  if (!fs.existsSync(buildFile)) throw Error('No build; run npm run design:build -- ' + post.slug);
  const build = readJSON(buildFile),
    revision = designRevision(post, paths.dir);
  if (!buildCurrent(build, post, paths.dir)) add('Build is stale: post.json or images changed after design:build');
  if (!review && !copyApprovalCurrent(workflow.approvals.copy, post)) add('Copy approval missing or stale');
  if (workflow.designStale) add('Text was edited in design review; rebuild');
  const q = checkPost(post, undefined, {dir: paths.dir});
  q.errors.forEach(e => add('Editorial: ' + e.message));
  if (build.slides.length !== post.slides.length) add('PNG count differs from slide count');
  const browser = await launchBrowser();
  try {
    const page = await (await browser.newContext({viewport: {width: 1080, height: 1350}})).newPage();
    for (const [i, s] of post.slides.entries()) {
      const b = build.slides[i] || {},
        png = path.join(ROOT, b.png || 'missing');
      const expected = `${String(i + 1).padStart(2, '0')}-${s.id}.png`;
      if (path.basename(png) !== expected) add(`Slide ${i + 1}: expected ${expected}, got ${path.basename(png)}`);
      if (!fs.existsSync(png)) {
        add('Missing PNG ' + expected);
        continue;
      }
      const meta = await sharp(png).metadata();
      if (meta.width !== 1080 || meta.height !== 1350) add(`${expected} is ${meta.width}×${meta.height}`);
      if (fileHash(png) !== b.pngHash) add(`${expected} changed after build`);
      const ink = await inkStats(processedImage(paths.dir, s));
      if (s.imageSource?.treatment !== 'none' && !looksInked(ink)) add(`${s.id}: image does not look blue-inked (${JSON.stringify(ink)})`);
      await page.goto(pathToFileURL(path.join(ROOT, b.html)).href);
      await page.evaluate(async () => {
        await document.fonts.ready;
      });
      const geo = await page.evaluate(inspectLayout, imageGaps());
      geo.violations.forEach(v => add(`${s.id}: ${v}`));
      result.slides.push({id: s.id, png: b.png, ink, gap: geo.textPhotoGap, photoHeight: geo.photo?.height});
    }
    // Negative control: an overlong headline must be caught, never silently shrunk.
    await page.goto(pathToFileURL(path.join(ROOT, build.slides[0].html)).href);
    await page.evaluate(async () => {
      await document.fonts.ready;
      document.querySelector('.headline-line, .quote-text').textContent = 'Headline terlalu panjang '.repeat(20);
    });
    const stress = await page.evaluate(inspectLayout, imageGaps());
    if (!stress.violations.some(v => v.startsWith('Text overflow'))) add('Overflow guard did not fire');
  } finally {
    await browser.close();
  }
  const finalHTML = path.join(paths.out, post.slug + '.html');
  if (!fs.existsSync(finalHTML)) add('Final HTML missing');
  else if (fs.statSync(finalHTML).size > 20 * 1024 * 1024) add('Final HTML over 20 MB');
  const report = {
    schemaVersion: 1,
    slug: post.slug,
    designRevision: revision,
    copyRevision: copyRevision(post),
    checkedAt: new Date().toISOString(),
    passed: !problems.length,
    problems,
    warnings: q.warnings.map(w => w.message),
    ...result
  };
  writeJSON(path.join(paths.out, 'check.json'), report);
  return report;
}

if (isMain(import.meta.url))
  try {
    const r = await designCheck(parseArgs()._[0]);
    for (const s of r.slides) console.log(`  ${s.id}: ink onRamp ${(s.ink.onRamp * 100).toFixed(1)}% · gap ${s.gap}px`);
    r.warnings.forEach(w => console.log('  ⚠ ' + w));
    if (r.passed)
      console.log(`✓ design ${r.designRevision.slice(0, 12)} passes. Show out/contact-sheet.png and out/${r.slug}.html to the owner for final approval.`);
    else {
      r.problems.forEach(p => console.log('  ✗ ' + p));
      process.exitCode = 1;
    }
  } catch (e) {
    fail(e);
  }
