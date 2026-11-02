// review:serve — localhost Simpan writes into edits/ (download remains the file:// path).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {loadPost, launchBrowser, readJSON, copyRevision, designRevision, editableFields} from '../scripts/core.mjs';
import {reviewBuild, reviewApply} from '../scripts/review.mjs';
import {startReviewServer, writeOwnerEdits, editsFilename} from '../scripts/review-serve.mjs';
import {tmpPost} from './helpers.mjs';

let browser;
test.before(async () => (browser = await launchBrowser()));
test.after(() => browser?.close());

function sampleEdits(dir, change = () => {}) {
  const {post, paths} = loadPost(dir);
  const slides = post.slides.map(s => ({slug: post.slug, slideId: s.id, fields: editableFields(s)}));
  const captions = [{slug: post.slug, paragraphs: [...post.caption]}];
  change(slides, captions[0].paragraphs);
  return {
    schemaVersion: 3,
    brand: 'akalmesin',
    kind: 'owner-edits',
    mode: 'review',
    slug: post.slug,
    baseRevision: copyRevision(post),
    designRevision: designRevision(post, paths.dir),
    slides,
    captions,
    savedAt: '2026-11-02T08:00:00.000Z'
  };
}

test('writeOwnerEdits validates slug/kind and writes under edits/', async () => {
  const dir = tmpPost();
  const edits = sampleEdits(dir);
  const w = writeOwnerEdits(dir, edits);
  assert.equal(w.filename, editsFilename(edits.slug, edits.savedAt));
  assert.ok(fs.existsSync(w.file));
  assert.equal(readJSON(w.file).kind, 'owner-edits');
  assert.throws(() => writeOwnerEdits(dir, {...edits, kind: 'nope'}), /kind must be owner-edits/);
  assert.throws(() => writeOwnerEdits(dir, {...edits, slug: 'other'}), /expected/);
  const w2 = writeOwnerEdits(dir, edits);
  assert.match(w2.filename, /-2\.json$/);
});

test('review:serve Simpan POSTs into edits/ (no download)', async () => {
  const dir = tmpPost();
  await reviewBuild(dir);
  const srv = await startReviewServer(dir, {port: 0});
  const ctx = await browser.newContext({viewport: {width: 1440, height: 1000}, acceptDownloads: true});
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  let download = null;
  page.on('download', d => {
    download = d;
  });
  try {
    await page.goto(srv.url);
    await page.waitForFunction(() => !document.getElementById('status').textContent.startsWith('memeriksa'));
    assert.equal(await page.evaluate(() => window.__AKALMESIN_SAVE_URL__), '/save');
    assert.equal(await page.locator('#save').isDisabled(), false);
    await page.click('#save');
    await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('tersimpan di'));
    assert.equal(download, null, 'served Simpan must not trigger a download');
    const status = await page.locator('#status').textContent();
    assert.match(status, /edits/);
    const editsDir = path.join(dir, 'edits');
    const files = fs.readdirSync(editsDir).filter(f => f.endsWith('.json'));
    assert.equal(files.length, 1);
    const saved = readJSON(path.join(editsDir, files[0]));
    assert.equal(saved.mode, 'review');
    assert.equal(saved.slug, loadPost(dir).post.slug);
    const r = await reviewApply(dir, path.join(editsDir, files[0]));
    assert.equal(r.approved, true);
    assert.deepEqual(errors, []);
  } finally {
    await ctx.close();
    await srv.close();
  }
});

test('POST /save rejects wrong slug', async () => {
  const dir = tmpPost();
  await reviewBuild(dir);
  const srv = await startReviewServer(dir, {port: 0});
  try {
    const bad = {...sampleEdits(dir), slug: 'not-this-post'};
    const res = await fetch(new URL('/save', srv.url), {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(bad)
    });
    assert.equal(res.status, 400);
    const j = await res.json();
    assert.equal(j.ok, false);
    assert.match(j.error, /expected/);
  } finally {
    await srv.close();
  }
});
