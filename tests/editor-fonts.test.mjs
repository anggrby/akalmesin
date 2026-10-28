// Copy-review editor embeds only small subset fonts (owner t61u); review HTML too (t67u); the PNG renders keep the full brand fonts.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {ROOT, readJSON, fontCSS} from '../scripts/core.mjs';
import {editorHTML, editorFontCSS} from '../scripts/copy-review.mjs';
import {KIMI} from './helpers.mjs';

const post = readJSON(path.join(KIMI, 'post.json')),
  cov = readJSON(path.join(ROOT, 'templates/html/fonts/coverage.json'));

test('copy-review editor is small and carries no full-size fonts', () => {
  const html = editorHTML(post, 'copy');
  assert.ok(Buffer.byteLength(html) < 120 * 1024, `copy-review.html is ${Math.round(Buffer.byteLength(html) / 1024)} KB`);
  assert.ok(!html.includes('font/ttf'), 'no full TTF embedded');
  assert.equal((html.match(/font\/woff2/g) || []).length, 2);
  assert.ok(!html.includes(fs.readFileSync(path.join(ROOT, 'brand/fonts/Manrope.ttf')).toString('base64').slice(0, 400)));
});
test('subset covers Indonesian copy and the punctuation the owner types', () => {
  for (const c of 'aáéèíóúüñçAZ09—–“”‘’…•%€$@#&*()[]/\\?!:;,.\'"') assert.ok(cov.unicodes.Manrope.includes(c), c);
  assert.ok(editorFontCSS(post).slim);
});
test('a character outside the subset falls back to the full fonts', () => {
  const ch = [...cov.droppedFromManrope][0],
    p = structuredClone(post);
  p.caption[0] += ' ' + ch;
  const f = editorFontCSS(p);
  assert.equal(f.slim, false);
  assert.deepEqual(f.missing, [ch]);
  assert.equal(f.css, fontCSS());
});
test('review HTML (t67u) uses the slim fonts too; PNG renders keep the full brand fonts', () => {
  const html = editorHTML(post, 'review');
  assert.ok(!html.includes('font/ttf'));
  assert.equal((html.match(/font\/woff2/g) || []).length, 2);
});
