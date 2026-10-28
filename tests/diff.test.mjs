import test from 'node:test';
import assert from 'node:assert/strict';
import {splitSentences, sentenceDiff, wordDiff, formatDiff} from '../scripts/core.mjs';

test('sentences keep decimals, version numbers and domains intact', () => {
  assert.deepEqual(splitSentences('Skor 65,7% di Kimi.ai. K3.1 Pro rilis! Benarkah?'), ['Skor 65,7% di Kimi.ai.', 'K3.1 Pro rilis!', 'Benarkah?']);
  assert.equal(splitSentences('dijanjikan **paling lambat 4 November 2026**. Lalu').length, 2);
});
test('only changed sentences are reported, with word-level runs', () => {
  const a = 'Satu dua. Lembaga independen Artificial Analysis juga mencatat. Tiga.';
  const b = 'Satu dua. Artificial Analysis juga mencatat. Tiga.';
  const d = sentenceDiff(a, b);
  assert.equal(d.length, 1);
  assert.equal(d[0].type, 'changed');
  assert.deepEqual(d[0].words, [{removed: 'Lembaga independen', added: ''}]);
});
test('removed and added sentences', () => {
  assert.deepEqual(sentenceDiff('A satu. B dua.', 'B dua.'), [{type: 'removed', before: 'A satu.'}]);
  assert.deepEqual(sentenceDiff('B dua.', 'B dua. C tiga.'), [{type: 'added', after: 'C tiga.'}]);
  assert.deepEqual(sentenceDiff('Sama.', 'Sama.'), []);
});
test('word diff and formatting', () => {
  assert.deepEqual(wordDiff('akan dibuka paling lambat', 'akan dirilis paling lambat'), [{removed: 'dibuka', added: 'dirilis'}]);
  assert.match(formatDiff(sentenceDiff('Model raksasa berkapasitas 3 triliun.', 'Model dengan 3 triliun.')), /words: −"raksasa berkapasitas" \+"dengan"/);
});
