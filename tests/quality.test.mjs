import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {readJSON, captionBody, countWords} from '../scripts/core.mjs';
import {checkPost} from '../scripts/quality.mjs';
import {KIMI} from './helpers.mjs';

const post = () => structuredClone(readJSON(path.join(KIMI, 'post.json')));
const codes = p => checkPost(p).issues.map(i => i.code);

test('approved Kimi post has no errors (length is only a warning)', () => {
  const r = checkPost(post());
  assert.deepEqual(r.errors, []);
  assert.deepEqual(
    r.warnings.map(w => w.code),
    ['caption_length']
  );
});
test('caption rules', () => {
  const p = post();
  p.caption[2] = p.caption[2].replace(/\?$/, '.');
  assert.ok(codes(p).includes('closing_question'));
  const q = post();
  q.caption[3] = q.caption[3].replace(/Sumber:.*\n/, '');
  assert.ok(codes(q).includes('caption_footer'));
  const h = post();
  h.caption[3] += ' #a #b';
  assert.ok(codes(h).includes('hashtag_limit'));
  assert.equal(captionBody(post().caption).length, 3);
  assert.equal(countWords('65,7% K3.1 Kimi.ai dua–tiga'), 5); // en dash splits, as in the old repo
});
test('wording, emphasis and credit rules', () => {
  const p = post();
  p.slides[3].paragraphs[0] += ' Ini tolok ukur.';
  assert.ok(codes(p).includes('benchmark_wording'));
  const e = post();
  e.slides[2].paragraphs[0] = e.slides[2].paragraphs[0].replace(/\*\*/g, '');
  assert.ok(codes(e).includes('detail_emphasis'));
  const many = post();
  many.slides[2].paragraphs[0] += ' **satu** **dua**';
  assert.ok(codes(many).includes('detail_emphasis_count'));
  const c = post();
  c.slides[1].credit = 'Moonshot AI';
  assert.ok(codes(c).includes('credit_format'));
});
test('caption guide is 100–160 body words, warning only', () => {
  const p = readJSON(new URL('../brand/editorial-policy.json', import.meta.url).pathname);
  assert.equal(p.caption.suggestedWordMinimum, 100);
  assert.equal(p.caption.suggestedWordMaximum, 160);
  assert.deepEqual(captionBody(['a b', 'c', 'd?\n\nSumber: X / Foto: Y\nIlustrasi slide 2: AI / akalmesin\n\n#akalmesin #x']), ['a b', 'c', 'd?']);
});
