// Quote layout (owner sheets + owner example, t54u): no masthead, no photo credit, tokens only.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {ROOT, readJSON, writeFile, launchBrowser, imageGaps, tokenVars, editableFields} from '../scripts/core.mjs';
import {renderSlide, renderSlidePage} from '../templates/html/post.mjs';
import {pageCSS} from '../scripts/copy-review.mjs';
import {inspectLayout} from '../scripts/design-build.mjs';
import {blueInk} from '../scripts/blue-ink.mjs';
import {checkPost} from '../scripts/quality.mjs';

const FIX = path.join(ROOT, 'tests/fixtures/quote-post'),
  post = readJSON(path.join(FIX, 'post.json')),
  slide = post.slides[0];
const T = readJSON(path.join(ROOT, 'brand/tokens.json')),
  Q = T.layout.quote;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'akalmesin-quote-')),
  img = path.join(tmp, 'ink.png');
let browser;
test.before(async () => {
  browser = await launchBrowser();
  await blueInk(path.join(FIX, slide.imageSource.originalFile), img, slide.imageSource.process);
});
test.after(() => browser?.close());

async function render(s, mutate) {
  const html = path.join(tmp, s.id + '.html');
  writeFile(html, renderSlidePage({post, slide: s, imageURL: pathToFileURL(img).href, css: pageCSS()}));
  const page = await browser.newPage({viewport: {width: 1080, height: 1350}});
  await page.goto(pathToFileURL(html).href);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map(i => i.decode()));
  });
  if (mutate) await page.evaluate(mutate);
  const r = await page.evaluate(inspectLayout, imageGaps());
  r.dom = await page.evaluate(() => ({
    masthead: !!document.querySelector('.masthead, .wordmark, .category'),
    credit: !!document.querySelector('.credit'),
    mark: document.querySelector('.quote-mark').getBoundingClientRect().toJSON(),
    color: getComputedStyle(document.querySelector('.quote-text')).color
  }));
  await page.close();
  return r;
}

test('quote renders with no masthead, no credit, inside the sheet content box', async () => {
  const r = await render(slide);
  assert.deepEqual(r.violations, []);
  assert.equal(r.dom.masthead, false);
  assert.equal(r.dom.credit, false);
  const b = r.quote.block;
  assert.equal(b.x, Q.sampleBox.x);
  assert.equal(b.width, Q.sampleBox.width);
  assert.equal(b.bottom, Q.sampleBox.y + Q.sampleBox.height);
  assert.equal(b.y, Q.sampleBox.y, 'two-line example fills the 512 px sample box exactly');
  assert.ok(r.quote.lines >= 1 && r.quote.lines <= Q.statementMaxLines);
  assert.equal(r.dom.color, 'rgb(238, 238, 238)');
});
test('overlong quote fails visibly instead of shrinking', async () => {
  const r = await render(slide, () => {
    document.querySelector('.quote-text').textContent = 'Kutipan yang terlalu panjang sekali '.repeat(6);
  });
  assert.ok(
    r.violations.some(v => v.startsWith('Text overflow: quote')),
    r.violations.join('; ')
  );
});
test('quote placeholder has no credit and editable fields are quote/author/role', () => {
  const html = renderSlide({post, slide});
  assert.match(html, /data-placeholder/);
  assert.doesNotMatch(html, /class="credit"|class="masthead"/);
  assert.deepEqual(Object.keys(editableFields(slide)), ['quote', 'author', 'role']);
});
test('quote CSS values come from tokens.json', () => {
  const v = tokenVars();
  assert.equal(v['quote-mark-size'], Q.mark.size + 'px');
  assert.equal(v['quote-mark-color'], T.color[Q.mark.color].value);
  assert.equal(v['quote-side'], Q.side + 'px');
  assert.equal(v['quote-bottom'], Q.bottom + 'px');
  assert.equal(v['quote-stack-gap'], Q.stackGap + 'px');
  assert.equal(v['quote-author-to-role'], Q.authorToRole + 'px');
  assert.ok(!('quoteMark' in T.unmeasured));
});
test('quality: a quote slide must not carry a photo credit and needs its source', () => {
  const codes = p => checkPost(p).issues.map(i => i.code);
  assert.ok(!codes(post).some(c => c.startsWith('quote_') || c === 'credit_format'));
  const bad = structuredClone(post);
  bad.slides[0].credit = 'FOTO: X / Y';
  delete bad.slides[0].quoteSource;
  assert.ok(codes(bad).includes('quote_credit'));
  assert.ok(codes(bad).includes('quote_source'));
});
