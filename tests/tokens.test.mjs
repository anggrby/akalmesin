// brand/tokens.json is the only design-token source (owner sheets, 2026-10-28). No Figma anywhere.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {ROOT, readJSON, tokenVars, slideTokensCSS} from '../scripts/core.mjs';
import {STOPS} from '../scripts/blue-ink.mjs';

const T = readJSON(path.join(ROOT, 'brand/tokens.json'));
const ROLES = ['main-headline', 'quote', 'wordmark', 'author', 'main-summary', 'detail-body', 'author-role', 'metadata'];

test('tokens.json has every sheet role with numeric size, line height and tracking', () => {
  assert.deepEqual(Object.keys(T.type).sort(), [...ROLES].sort());
  for (const r of ROLES) {
    const t = T.type[r];
    assert.equal(typeof t.size, 'number', r);
    assert.equal(typeof t.tracking, 'number', r);
    assert.equal(typeof t.weight, 'number', r);
    assert.ok(typeof t.lineHeight === 'number' || t.lineHeight === 'auto', r);
  }
  for (const s of T.source.sheets) assert.ok(fs.existsSync(path.join(ROOT, s)), s);
  assert.equal(T.type['author-role'].weight, 300);
  assert.equal(T.type['author-role'].family, 'Manrope');
  assert.equal(T.stroke.divider.color, '#000000');
  assert.deepEqual(
    Object.values(T.color).map(c => c.value),
    ['#000000', '#EEEEEE', '#FFFFFF']
  );
});
test('rendered CSS variables come from tokens.json', () => {
  const v = tokenVars(),
    css = slideTokensCSS();
  for (const r of ROLES) {
    const t = T.type[r];
    assert.equal(v[`type-${r}-size`], t.size + 'px');
    assert.equal(v[`type-${r}-weight`], t.weight);
    assert.equal(v[`type-${r}-tracking`], t.tracking + 'em');
    if (t.lineHeight !== 'auto') assert.equal(v[`type-${r}-line-height`], t.lineHeight + 'px');
    assert.ok(css.includes(`--type-${r}-size:${t.size}px`));
  }
  assert.equal(v['divider-color'], T.stroke.divider.color);
  assert.equal(v['overlay-quote'], 'linear-gradient(to bottom, rgb(217 217 217 / 0) 0%, rgb(0 0 0 / 1) 100%)');
  assert.equal(v['main-summary-to-image'], T.layout.main.summaryToImage + 'px');
  // post.css carries no design literals: every font/colour comes from a variable.
  const post = fs.readFileSync(path.join(ROOT, 'templates/html/post.css'), 'utf8').split('/* ---- copy-review placeholder')[0].split('/* Editor UI only')[0];
  assert.doesNotMatch(post, /#[0-9a-f]{3,6}\b/i);
  for (const m of post.matchAll(/var\(--([\w-]+)/g))
    assert.ok(
      m[1] in v ||
        ['side', 'header-top', 'row-to-divider', 'divider-to-content', 'content-width', 'copy-to-image', 'image-position', 'image-scale'].includes(m[1]),
      'undefined token ' + m[1]
    );
});
test('blue ink is a photo-treatment parameter, not a colour token', () => {
  assert.ok(!Object.values(T.color).some(c => c.value === T.photoTreatment.inkHex));
  assert.deepEqual(
    STOPS[1][1],
    [1, 3, 5].map(i => parseInt(T.photoTreatment.inkHex.slice(i, i + 2), 16))
  );
});
// The single allowed mention is the "no Figma" provenance note in tokens.json.
test('no Figma references in brand/, templates/, scripts/', () => {
  const hits = [];
  const walk = d => {
    for (const e of fs.readdirSync(d, {withFileTypes: true})) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) walk(f);
      else if (/\.(md|json|mjs|js|css|txt|html)$/.test(e.name) && /figma/i.test(fs.readFileSync(f, 'utf8').replace('; no Figma.', '.')))
        hits.push(path.relative(ROOT, f));
    }
  };
  for (const d of ['brand', 'templates', 'scripts']) walk(path.join(ROOT, d));
  assert.deepEqual(hits, []);
});
