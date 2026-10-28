import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {readJSON, writeJSON, copyRevision, legacyCopyRevision, creditsRevision, designRevision, copyApprovalCurrent, requireCopyApproval, splitCaptionCredits, loadPost} from '../scripts/core.mjs';
import {approve} from '../scripts/approve.mjs';
import {checkPost} from '../scripts/quality.mjs';
import {tmpPost} from './helpers.mjs';

const edit = (dir, fn) => { const f = path.join(dir, 'post.json'), p = readJSON(f); fn(p); writeJSON(f, p); return loadPost(dir); };
const footerIdx = p => p.caption.findIndex(x => /Foto\s*:/.test(x));

test('credit and Foto-footer changes keep the copy approval current but change credits/design', () => {
  const dir = tmpPost();
  approve(dir, {gate: 'copy', words: 'ok', source: 's'});
  const before = loadPost(dir);
  const {post, workflow, paths} = edit(dir, p => {
    p.slides[0].credit = 'FOTO: KIMI / MOONSHOT AI VIA X';
    const i = footerIdx(p); p.caption[i] = p.caption[i].replace(/Foto\s*:.*$/m, 'Foto: Moonshot AI via X');
  });
  assert.equal(copyRevision(post), copyRevision(before.post));
  assert.equal(copyApprovalCurrent(workflow.approvals.copy, post), true);
  assert.doesNotThrow(() => requireCopyApproval(workflow, post));
  assert.notEqual(creditsRevision(post), creditsRevision(before.post));
  assert.notEqual(designRevision(post, paths.dir), designRevision(before.post, before.paths.dir));
});
for (const [name, fn] of [
  ['paragraph', p => { const s = p.slides.find(x => x.paragraphs); s.paragraphs[0] += ' Tambahan.'; }],
  ['hashtag', p => { const i = p.caption.findIndex(x => x.includes('#')); p.caption[i] += ' #baru'; }],
  ['Sumber line', p => { const i = footerIdx(p); p.caption[i] = p.caption[i].replace(/Sumber\s*:\s*/, 'Sumber: Reuters, '); }],
]) test(`${name} change makes the copy approval stale`, () => {
  const dir = tmpPost();
  approve(dir, {gate: 'copy', words: 'ok', source: 's'});
  const {post, workflow} = edit(dir, fn);
  assert.equal(copyApprovalCurrent(workflow.approvals.copy, post), false);
  assert.throws(() => requireCopyApproval(workflow, post), /stale/);
});
test('sentences smuggled into credit fragments are rejected', () => {
  for (const foto of ['Moonshot AI. Model ini terbaik di dunia', 'Moonshot AI; klaim tambahan', 'Moonshot AI — padahal salah', 'Moonshot AI / Sumber: rahasia',
    'a b c d e f g h i j k l m n o p']) {
    const {post, paths} = edit(tmpPost(), p => { const i = footerIdx(p); p.caption[i] = p.caption[i].replace(/Foto\s*:.*$/m, 'Foto: ' + foto); });
    assert.ok(checkPost(post, undefined, {dir: paths.dir}).errors.some(e => e.code === 'credit_fragment'), foto);
  }
  const {post, paths} = edit(tmpPost(), p => { p.slides[0].credit = 'FOTO: KIMI / MOONSHOT AI. INI MODEL TERBAIK'; });
  assert.ok(checkPost(post, undefined, {dir: paths.dir}).errors.some(e => e.code === 'credit_fragment'));
  const loose = edit(tmpPost(), p => { p.caption.push('Ilustrasi slide 3: AI / akalmesin, dan model ini menang'); });
  assert.ok(checkPost(loose.post, undefined, {dir: loose.paths.dir}).errors.some(e => e.code === 'credit_fragment'));
  // and a non-matching footer line stays in the copy hash entirely
  assert.equal(splitCaptionCredits(['Sumber: A / Foto: B. Kalimat']).fragments.length, 1);
  assert.equal(splitCaptionCredits(['Ilustrasi slide 3: AI / akalmesin plus']).text[0], 'Ilustrasi slide 3: AI / akalmesin plus');
});
test('legacy approvals stay valid only while the content is unchanged', () => {
  const dir = tmpPost();
  const wf = readJSON(path.join(dir, 'workflow.json'));
  wf.approvals.copy = {gate: 'copy', words: 'ok', source: 's', revision: legacyCopyRevision(loadPost(dir).post)};
  writeJSON(path.join(dir, 'workflow.json'), wf);
  let {post, workflow} = loadPost(dir);
  assert.equal(copyApprovalCurrent(workflow.approvals.copy, post), true);
  ({post, workflow} = edit(dir, p => { p.slides[0].credit = 'FOTO: LAIN / SUMBER LAIN'; }));
  assert.equal(copyApprovalCurrent(workflow.approvals.copy, post), false, 'legacy rule hashed credits, so a credit change needs a new approval');
  assert.equal(copyApprovalCurrent({revision: legacyCopyRevision(post), copyRule: 2}, post), false, 'new-rule approvals never use the legacy hash');
  assert.equal(approve(dir, {gate: 'copy', words: 'ok', source: 's'}).copyRule, 2);
});
