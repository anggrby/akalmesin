import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {readJSON, writeJSON, copyRevision, loadPost, requireApproval} from '../scripts/core.mjs';
import {approve} from '../scripts/approve.mjs';
import {recordEdits} from '../scripts/copy-record.mjs';
import {manifest} from '../scripts/export.mjs';
import {tmpPost} from './helpers.mjs';

const ownerEdit = (dir, change) => {
  const {post} = loadPost(dir),
    f = path.join(dir, 'edits.json');
  const slides = post.slides.map(s => ({
    slug: post.slug,
    slideId: s.id,
    fields: s.layout === 'main' ? {headline: s.headline.join('\n'), summary: s.summary, credit: s.credit} : {'paragraph-0': s.paragraphs[0], credit: s.credit}
  }));
  change(slides);
  writeJSON(f, {
    schemaVersion: 3,
    kind: 'owner-edits',
    mode: 'copy',
    slug: post.slug,
    baseRevision: copyRevision(post),
    slides,
    captions: [{slug: post.slug, paragraphs: post.caption}]
  });
  return f;
};

test('approval needs verbatim words and a source', () => {
  const dir = tmpPost();
  assert.throws(() => approve(dir, {gate: 'copy', source: 'chat'}), /--words/);
  assert.throws(() => approve(dir, {gate: 'copy', words: 'ok'}), /--source/);
  assert.throws(() => approve(dir, {gate: 'publish', words: 'ok', source: 'x'}), /--gate/);
  const a = approve(dir, {gate: 'copy', words: '  Approved.  ', source: 'chat t1u', at: '2026-10-28T04:27:10Z'});
  assert.equal(a.words, 'Approved.');
  assert.equal(a.atWIB, '2026-10-28 11:27 WIB');
});
test('copy approval refuses copy that fails editorial checks', () => {
  const dir = tmpPost(),
    p = readJSON(path.join(dir, 'post.json'));
  p.caption[2] = p.caption[2].replace(/\?$/, '.');
  writeJSON(path.join(dir, 'post.json'), p);
  assert.throws(() => approve(dir, {gate: 'copy', words: 'ok', source: 's'}), /pertanyaan/);
});
test('recording edits logs the diff and clears copy approval', () => {
  const dir = tmpPost();
  approve(dir, {gate: 'copy', words: 'ok', source: 's'});
  const f = ownerEdit(dir, s => {
    s[1].fields['paragraph-0'] = s[1].fields['paragraph-0'].replace('juga mencatat', 'mencatat');
  });
  const r = recordEdits(dir, f, {who: 'owner'});
  assert.equal(r.changes.length, 1);
  const {workflow} = loadPost(dir);
  assert.equal(workflow.approvals.copy, null);
  assert.equal(workflow.history.at(-2).event, 'approval-invalidated');
  const log = fs.readFileSync(path.join(dir, 'edits.log.md'), 'utf8');
  assert.match(log, /02-benchmark · paragraph-0/);
  assert.match(log, /words: −"juga"/);
  assert.match(log, /WIB/);
  assert.doesNotMatch(log, /03-3d-game-web/);
});
test('stale edits are refused instead of overwriting newer text', () => {
  const dir = tmpPost();
  const f = ownerEdit(dir, s => {
    s[0].fields.summary = 'Versi lama.';
  });
  recordEdits(
    dir,
    ownerEdit(dir, s => {
      s[0].fields.summary = 'Versi baru dulu.';
    })
  );
  assert.throws(() => recordEdits(dir, f), /made on revision/);
});
test('design-mode edits mark the design stale; final needs a fresh check', () => {
  const dir = tmpPost();
  const f = ownerEdit(dir, s => {
    s[4].fields.credit = 'FOTO: KIMI / MOONSHOT AI';
  });
  const e = readJSON(f);
  e.mode = 'design';
  writeJSON(f, e);
  recordEdits(dir, f);
  assert.equal(loadPost(dir).workflow.designStale, true);
  approve(dir, {gate: 'copy', words: 'ok', source: 's'});
  assert.throws(() => approve(dir, {gate: 'final', words: 'ok', source: 's'}), /design:check/);
});
test('final requires current copy approval; export requires current final', () => {
  const dir = tmpPost();
  assert.throws(() => approve(dir, {gate: 'final', words: 'ok', source: 's'}), /"copy" is not approved/);
  assert.throws(() => manifest(dir), /not approved/);
  const wf = loadPost(dir).workflow;
  wf.approvals.copy = {revision: 'x'.repeat(64)};
  assert.throws(() => requireApproval(wf, 'copy', copyRevision(loadPost(dir).post)), /stale/);
});
test('legacy schemaVersion 2 edits map through legacyRevisions', () => {
  const dir = tmpPost(),
    {post} = loadPost(dir);
  const wf = readJSON(path.join(dir, 'workflow.json'));
  wf.legacyRevisions = {abc: copyRevision(post)};
  writeJSON(path.join(dir, 'workflow.json'), wf);
  const f = path.join(dir, 'legacy.json');
  writeJSON(f, {
    schemaVersion: 2,
    kind: 'text-review-edits',
    sourceRevisions: {[post.slug]: 'abc'},
    slides: [{slug: post.slug, slideId: '01-main', fields: {summary: 'Baru.'}}],
    captions: []
  });
  assert.equal(recordEdits(dir, f).changes.length, 1);
  writeJSON(f, {...readJSON(f), sourceRevisions: {[post.slug]: 'zzz'}});
  assert.throws(() => recordEdits(dir, f), /no base revision/);
});
