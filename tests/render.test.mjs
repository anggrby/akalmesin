// Browser tests: slide geometry, the placeholder editor's Simpan round trip, overflow guard, blue ink.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {readJSON, launchBrowser, writeFile, loadPost, imageGaps} from '../scripts/core.mjs';
import {renderSlidePage} from '../templates/html/post.mjs';
import {pageCSS, editorHTML} from '../scripts/copy-review.mjs';
import {inspectLayout} from '../scripts/design-build.mjs';
import {recordEdits} from '../scripts/copy-record.mjs';
import {inkStats, looksInked} from '../scripts/blue-ink.mjs';
import {KIMI, tmpPost} from './helpers.mjs';

const post = readJSON(path.join(KIMI, 'post.json'));
let browser;
test.before(async () => {
  browser = await launchBrowser();
});
test.after(() => browser?.close());

async function layoutOf(slide, imageURL, mutate) {
  const dir = fs.mkdtempSync(path.join(path.dirname(tmpPost()), 'r')),
    html = path.join(dir, 's.html');
  writeFile(html, renderSlidePage({post, slide, imageURL, css: pageCSS()}));
  const page = await browser.newPage({viewport: {width: 1080, height: 1350}});
  await page.goto(pathToFileURL(html).href);
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  if (mutate) await page.evaluate(mutate);
  const r = await page.evaluate(inspectLayout, imageGaps());
  await page.close();
  return r;
}

test('every Kimi slide meets geometry rules with its processed image', async () => {
  for (const s of post.slides) {
    const img = pathToFileURL(path.join(KIMI, 'assets/processed', s.id + '-blue-ink.png')).href;
    const r = await layoutOf(s, img);
    assert.deepEqual(r.violations, [], s.id);
    assert.equal(r.canvas.width, 1080);
    assert.equal(r.canvas.height, 1350);
    assert.equal(r.textPhotoGap, imageGaps()[s.layout]);
  }
});
test('placeholder is flagged so it can never reach a final build', async () => {
  const r = await layoutOf(post.slides[1], null);
  assert.deepEqual(r.violations, ['Placeholder still present']);
});
test('overlong headline fails visibly instead of shrinking', async () => {
  const img = pathToFileURL(path.join(KIMI, 'assets/processed/01-main-blue-ink.png')).href;
  const r = await layoutOf(post.slides[0], img, () => {
    document.querySelector('.headline-line').textContent = 'Headline terlalu panjang '.repeat(20);
  });
  assert.ok(r.violations.some(v => v.startsWith('Text overflow')));
});
test('editor: edit, bold, Simpan, then copy:record applies exactly that change', async () => {
  const dir = tmpPost(),
    {post: p} = loadPost(dir),
    html = path.join(dir, 'out/copy-review.html');
  writeFile(html, editorHTML(p, 'copy'));
  const ctx = await browser.newContext({viewport: {width: 1440, height: 1000}, acceptDownloads: true}),
    page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(pathToFileURL(html).href);
  assert.equal(await page.locator('[data-placeholder]').count(), 5);
  await page.locator('[data-slide="01-main"] [data-edit="summary"]').fill('Ringkasan baru dari owner.');
  const para = page.locator('[data-slide="03-3d-game-web"] [data-edit="paragraph-0"]');
  await para.evaluate(el => {
    const r = document.createRange();
    const t = el.firstChild;
    r.setStart(t, 0);
    r.setEnd(t, 5);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    el.focus();
  });
  await page.keyboard.press('Control+b');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#save')]);
  const file = path.join(dir, 'edits.json');
  await dl.saveAs(file);
  const edits = readJSON(file);
  assert.equal(edits.kind, 'owner-edits');
  assert.equal(edits.slides.length, 5);
  assert.match(edits.slides[2].fields['paragraph-0'], /^\*\*Cukup\*\* bermodalkan/);
  assert.deepEqual(errors, []);
  const r = recordEdits(dir, file);
  assert.deepEqual(
    r.changes.map(c => c.where),
    ['01-main · summary', '03-3d-game-web · paragraph-0']
  );
  await ctx.close();
});
test('blue-ink check separates treated images from originals', async () => {
  for (const s of post.slides) assert.ok(looksInked(await inkStats(path.join(KIMI, 'assets/processed', s.id + '-blue-ink.png'))), s.id);
  assert.ok(!looksInked(await inkStats(path.join(KIMI, 'assets/originals/kimi-godot-game.webp'))));
  assert.ok(!looksInked(await inkStats(path.join(KIMI, 'assets/originals/kimi-hallu-bench-chart.webp'))));
});
