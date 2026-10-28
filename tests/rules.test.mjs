// t55u: the quote photo must be the quoted person (declared subject), images never repeat,
// and every check is deterministic (same input → same verdict).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {ROOT, readJSON} from '../scripts/core.mjs';
import {checkPost, normName} from '../scripts/quality.mjs';
import {blueInk} from '../scripts/blue-ink.mjs';
import {KIMI} from './helpers.mjs';

const FIX = path.join(ROOT, 'tests/fixtures/quote-post'), base = readJSON(path.join(FIX, 'post.json'));
const codes = (p, dir) => checkPost(p, undefined, {dir}).issues.map(i => i.code);
const edit = f => { const p = structuredClone(base); f(p.slides[0], p); return p; };

test('fixture quote passes the person-photo rules (with files)', () => {
  assert.deepEqual(codes(base, FIX).filter(c => c.startsWith('quote_') || c === 'image_reused'), []);
});
test('name match is case/diacritic-insensitive but exact; aliases are explicit', () => {
  assert.equal(normName('  DÁRIO   amodei '), normName('Dario Amodei'));
  assert.ok(!codes(edit(s => { s.imageSource.subject = 'dário AMODEI'; })).includes('quote_photo_subject'));
  assert.ok(!codes(edit(s => { s.imageSource.subject = 'Dario'; })).includes('quote_photo_subject'));
  assert.ok(codes(edit(s => { s.imageSource.subject = 'Dario'; s.subjectAliases = []; })).includes('quote_photo_subject'));
  assert.ok(codes(edit(s => { s.imageSource.subject = 'Dario Amodei, CEO'; })).includes('quote_photo_subject'));
});
test('missing subject or another subject fails', () => {
  assert.ok(codes(edit(s => { delete s.imageSource.subject; })).includes('quote_photo_subject'));
  assert.ok(codes(edit(s => { s.imageSource.subject = 'Anthropic office'; })).includes('quote_photo_subject'));
});
test('quote photo kind must be a real photo of a person', () => {
  for (const kind of ['ai-illustration', 'object', 'logo', 'chart', 'source-photo', undefined])
    assert.ok(codes(edit(s => { s.imageSource.kind = kind; })).includes('quote_photo_kind'), String(kind));
  for (const kind of ['news-photo', 'portrait-photo']) assert.ok(!codes(edit(s => { s.imageSource.kind = kind; })).includes('quote_photo_kind'));
});
test('PROVENANCE.md must list the person', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'akalmesin-prov-'));
  fs.cpSync(FIX, dir, {recursive: true});
  fs.writeFileSync(path.join(dir, 'assets/PROVENANCE.md'), '# Provenance\n\nno person listed\n');
  assert.ok(codes(base, dir).includes('quote_provenance'));
});
test('a slide may not reuse the Main image (same id, or same bytes under another id)', () => {
  const kimi = readJSON(path.join(KIMI, 'post.json'));
  const sameId = structuredClone(kimi); sameId.slides[2].imageSource.id = sameId.slides[0].imageSource.id;
  assert.ok(codes(sameId).includes('image_reused'));
  const sameBytes = structuredClone(kimi); sameBytes.slides[2].imageSource.originalFile = sameBytes.slides[0].imageSource.originalFile;
  assert.ok(!codes(sameBytes).includes('image_reused'), 'bytes are only checked with dir');
  assert.ok(codes(sameBytes, KIMI).includes('image_reused'));
  assert.ok(!codes(kimi, KIMI).includes('image_reused'));
});
test('determinism: checkPost gives identical verdicts on repeated runs', () => {
  const kimi = readJSON(path.join(KIMI, 'post.json'));
  for (const [p, d] of [[kimi, KIMI], [base, FIX]]) assert.deepEqual(checkPost(p, undefined, {dir: d}), checkPost(structuredClone(p), undefined, {dir: d}));
});
test('determinism: blue ink produces identical bytes twice (seeded grain)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'akalmesin-ink-')), src = path.join(FIX, base.slides[0].imageSource.originalFile);
  await blueInk(src, path.join(dir, 'a.png'), {maxWidth: 540}); await blueInk(src, path.join(dir, 'b.png'), {maxWidth: 540});
  assert.ok(fs.readFileSync(path.join(dir, 'a.png')).equals(fs.readFileSync(path.join(dir, 'b.png'))));
});
