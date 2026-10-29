// Single-pass review (t67u–t69u): one review HTML, one Simpan = the owner's approval when every check passes.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {
  ROOT,
  readJSON,
  writeJSON,
  writeFile,
  loadPost,
  launchBrowser,
  copyRevision,
  designRevision,
  legacyDesignRevision,
  finalApprovalCurrent,
  copyApprovalCurrent,
  editableFields,
  DESIGN_RULE
} from '../scripts/core.mjs';
import {reviewBuild, reviewApply} from '../scripts/review.mjs';
import {editorHTML} from '../scripts/copy-review.mjs';
import {embedJPEG} from '../scripts/design-build.mjs';
import {blueInk} from '../scripts/blue-ink.mjs';
import {manifest} from '../scripts/export.mjs';
import {tmpPost, KIMI} from './helpers.mjs';

let browser;
test.before(async () => (browser = await launchBrowser()));
test.after(() => browser?.close());

/** Same schema the review editor's Simpan writes. */
function saveFile(dir, change = () => {}) {
  const {post, paths} = loadPost(dir);
  const slides = post.slides.map(s => ({slug: post.slug, slideId: s.id, fields: editableFields(s)}));
  const captions = [{slug: post.slug, paragraphs: [...post.caption]}];
  change(slides, captions[0].paragraphs);
  const f = path.join(dir, `edits-${Math.random().toString(36).slice(2)}.json`);
  writeJSON(f, {
    schemaVersion: 3,
    brand: 'akalmesin',
    kind: 'owner-edits',
    mode: 'review',
    slug: post.slug,
    baseRevision: copyRevision(post),
    designRevision: designRevision(post, paths.dir),
    slides,
    captions,
    savedAt: '2026-10-28T14:00:00.000Z'
  });
  return f;
}
const built = new Map();
async function builtPost() {
  const dir = tmpPost();
  await reviewBuild(dir);
  return dir;
}

test('apply with one changed sentence: logged alone, re-rendered, single approval for copy + final', async () => {
  const dir = await builtPost();
  const f = saveFile(dir, s => {
    s[1].fields['paragraph-0'] = s[1].fields['paragraph-0'].replace('juga mencatat', 'mencatat');
  });
  const r = await reviewApply(dir, f);
  assert.deepEqual(r.problems, []);
  assert.equal(r.approved, true);
  const {post, paths, workflow} = loadPost(dir);
  const {copy, final} = workflow.approvals;
  assert.equal(copy.words, 'Saved in review editor 2026-10-28T14:00:00.000Z');
  assert.match(copy.source, new RegExp('^' + path.basename(f) + ' sha256:[0-9a-f]{64}$'));
  assert.equal(final.words, copy.words);
  assert.equal(copy.revision, copyRevision(post));
  assert.equal(final.revision, designRevision(post, paths.dir));
  assert.equal(final.copyRevision, copy.revision);
  assert.equal(workflow.history.filter(h => h.event === 'approved').length, 1, 'one approval record');
  assert.equal(workflow.history.at(-1).gate, 'review');
  assert.equal(workflow.stage, 'export');
  assert.doesNotThrow(() => manifest(dir));
  const log = fs.readFileSync(path.join(dir, 'edits.log.md'), 'utf8');
  assert.match(log, /words: −"juga"/);
  const diff = log.slice(log.indexOf('02-benchmark · paragraph-0'));
  const lines = diff.split('```diff')[1].split('```')[0].trim().split('\n');
  assert.ok(
    lines.every(l => !l.startsWith('  ') || /words:/.test(l)),
    'unchanged sentences are not logged'
  );
  assert.equal(lines.filter(l => l.startsWith('-')).length, 1);
});

test('apply with no changes is a pure approval', async () => {
  const dir = await builtPost(),
    before = fs.readFileSync(path.join(dir, 'post.json'), 'utf8');
  const r = await reviewApply(dir, saveFile(dir));
  assert.equal(r.approved, true);
  assert.deepEqual(r.changes, []);
  assert.equal(fs.readFileSync(path.join(dir, 'post.json'), 'utf8'), before);
  const {workflow} = loadPost(dir);
  assert.equal(workflow.approvals.final.context, 'no changes');
  assert.match(fs.readFileSync(path.join(dir, 'edits.log.md'), 'utf8'), /review save \(no changes\)/);
});

test('overflow blocks approval and is reported readably', async () => {
  const dir = await builtPost();
  const f = saveFile(dir, s => {
    s[0].fields.headline = 'Headline yang terlalu panjang sekali untuk muat di kotak judul slide utama akalmesin';
  });
  const r = await reviewApply(dir, f);
  assert.equal(r.approved, false);
  assert.ok(
    r.problems.some(p => /overflow|outside/i.test(p)),
    r.problems.join('; ')
  );
  const {workflow} = loadPost(dir);
  assert.equal(workflow.approvals.copy, null);
  assert.equal(workflow.approvals.final, null);
  assert.match(fs.readFileSync(path.join(dir, 'edits.log.md'), 'utf8'), /NOT approved/);
});

test('stale review files are refused (design changed since the HTML was made)', async () => {
  const dir = await builtPost(),
    f = saveFile(dir);
  const e = readJSON(f);
  e.designRevision = 'x'.repeat(64);
  writeJSON(f, e);
  await assert.rejects(reviewApply(dir, f), /Regenerate the review/);
});

test('alt text is not approved: changing it invalidates nothing', async () => {
  const dir = await builtPost();
  assert.equal((await reviewApply(dir, saveFile(dir))).approved, true);
  const p = readJSON(path.join(dir, 'post.json'));
  p.slides[0].alt = 'Alt text baru yang lebih deskriptif.';
  writeJSON(path.join(dir, 'post.json'), p);
  const {post, paths, workflow} = loadPost(dir);
  assert.ok(copyApprovalCurrent(workflow.approvals.copy, post));
  assert.ok(finalApprovalCurrent(workflow.approvals.final, post, paths.dir));
  assert.equal(workflow.approvals.final.designRule, DESIGN_RULE);
  assert.match(JSON.stringify(manifest(dir).body), /Alt text baru yang lebih deskriptif/, 'alt still goes to Notion');
});

test("a design change (dark mode, t94u) makes the fixture's old light-mode final approval stale; copy approval survives", () => {
  const {post, paths, workflow} = loadPost(KIMI);
  assert.equal(workflow.approvals.final.revision.slice(0, 12), '7bfb0d4853cd', 'recorded under the light design');
  assert.notEqual(legacyDesignRevision(post, paths.dir).slice(0, 12), '7bfb0d4853cd', 'tokens/post.css/logo are hashed');
  assert.equal(finalApprovalCurrent(workflow.approvals.final, post, paths.dir), false);
  assert.ok(copyApprovalCurrent(workflow.approvals.copy, post));
  assert.equal(
    finalApprovalCurrent({...workflow.approvals.final, designRule: DESIGN_RULE}, post, paths.dir),
    false,
    'new-rule approvals never use the legacy hash'
  );
});

async function openEditor(html) {
  const ctx = await browser.newContext({viewport: {width: 1440, height: 1000}, acceptDownloads: true}),
    page = await ctx.newPage(),
    errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(pathToFileURL(html).href);
  await page.waitForFunction(() => !document.getElementById('status').textContent.startsWith('memeriksa'));
  return {ctx, page, errors};
}

test('review editor: real slides, photo list, live overflow disables Simpan, Simpan with no edits approves', async () => {
  const dir = await builtPost(),
    html = path.join(dir, 'out', '2026-10-28-kimi-k3-1-pro.html');
  const {ctx, page, errors} = await openEditor(html);
  assert.equal(await page.locator('[data-placeholder]').count(), 0);
  assert.equal(await page.locator('.photo-panel li').count(), 5);
  assert.equal(await page.locator('#save').isDisabled(), false);
  const head = page.locator('.slide-frame [data-slide="01-main"] [data-edit="headline"]');
  const original = await head.innerHTML();
  await head.evaluate(el => {
    el.firstElementChild.textContent = 'Headline terlalu panjang '.repeat(6);
    el.dispatchEvent(new Event('input', {bubbles: true}));
  });
  await page.waitForFunction(() => document.getElementById('save').disabled);
  assert.match(await page.locator('#status').textContent(), /Simpan nonaktif — teks meluap: 01-main/);
  await head.evaluate((el, h) => {
    el.innerHTML = h;
    el.dispatchEvent(new Event('input', {bubbles: true}));
  }, original);
  await page.waitForFunction(() => !document.getElementById('save').disabled);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#save')]);
  const f = path.join(dir, 'save.json');
  await dl.saveAs(f);
  assert.deepEqual(errors, []);
  await ctx.close();
  const e = readJSON(f);
  assert.equal(e.mode, 'review');
  assert.equal(e.blocked, undefined);
  const r = await reviewApply(dir, f);
  assert.deepEqual(r.changes, []);
  assert.equal(r.approved, true);
});

test('review editor measures the quote layout too', async () => {
  const FIX = path.join(ROOT, 'tests/fixtures/quote-post'),
    post = readJSON(path.join(FIX, 'post.json')),
    s = post.slides[0];
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'akalmesin-qr-')),
    img = path.join(tmp, 'ink.png'),
    html = path.join(tmp, 'review.html');
  await blueInk(path.join(FIX, s.imageSource.originalFile), img, s.imageSource.process);
  writeFile(html, editorHTML(post, 'review', {[s.id]: await embedJPEG(img)}, {designRevision: 'test'}));
  const {ctx, page, errors} = await openEditor(html);
  assert.equal(await page.locator('#save').isDisabled(), false);
  await page.locator('.slide-frame [data-edit="quote"]').evaluate(el => {
    el.textContent = 'Kutipan yang terlalu panjang. '.repeat(12);
    el.dispatchEvent(new Event('input', {bubbles: true}));
  });
  await page.waitForFunction(() => document.getElementById('save').disabled);
  assert.match(await page.locator('#status').textContent(), /quote/);
  assert.deepEqual(errors, []);
  await ctx.close();
});
