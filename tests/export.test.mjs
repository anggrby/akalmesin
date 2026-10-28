import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {ROOT, readJSON, writeJSON} from '../scripts/core.mjs';
import {exportPost, richText, topicFor, client, manifest, bodyBlocks} from '../scripts/export.mjs';
import {KIMI, tmpPost} from './helpers.mjs';

const sha = b => crypto.createHash('sha256').update(b).digest('hex');
/** Kimi fixture with its real approvals and a build.json pointing at small fake PNGs (no render, no network). */
function approvedPost() {
  const dir = tmpPost({fresh: false}), out = path.join(dir, 'out'), build = readJSON(path.join(KIMI, 'out/build.json'));
  fs.mkdirSync(path.join(out, 'png'), {recursive: true});
  build.slides = build.slides.map((s, i) => { const f = path.join(out, 'png', `${s.id}.png`), b = Buffer.from('png-' + i); fs.writeFileSync(f, b); return {...s, png: path.relative(ROOT, f), pngHash: sha(b)}; });
  writeJSON(path.join(out, 'build.json'), build);
  const wf = readJSON(path.join(dir, 'workflow.json')); wf.notion = null; writeJSON(path.join(dir, 'workflow.json'), wf);
  return dir;
}
/** In-memory Notion: pages, blocks, file uploads. Records every call. */
function fakeNotion({pages = [], failOnce = {}} = {}) {
  const store = {pages: new Map(pages.map(p => [p.id, p])), uploads: new Map(), calls: [], n: 0};
  const json = (body, status = 200) => ({ok: status < 300, status, headers: {get: () => '0'}, json: async () => body, arrayBuffer: async () => body});
  store.fetch = async (url, {method, body} = {}) => {
    const u = new URL(url), p = u.pathname.replace('/v1/', ''); store.calls.push(method + ' ' + p);
    const key = method + ' ' + p.split('/')[0];
    if (failOnce[key]) { failOnce[key]--; return json({message: 'slow down'}, 429); }
    if (u.host === 'files.test') return json(store.uploads.get(p.slice(1)).bytes);
    let m;
    if (method === 'POST' && p.endsWith('/query')) return json({results: [...store.pages.values()].map(({blocks, ...x}) => x), has_more: false});
    if ((m = p.match(/^blocks\/(.+)\/children$/))) { const pg = store.pages.get(m[1]); if (method === 'GET') return json({results: pg.blocks, has_more: false}); pg.blocks.push(...JSON.parse(body).children.map(b => ({...b, id: 'b' + store.n++}))); return json({}); }
    if (method === 'DELETE' && (m = p.match(/^blocks\/(.+)$/))) { for (const pg of store.pages.values()) pg.blocks = pg.blocks.filter(b => b.id !== m[1]); return json({}); }
    if (p === 'file_uploads') { const id = 'u' + store.n++; store.uploads.set(id, {name: JSON.parse(body).filename}); return json({id}); }
    if ((m = p.match(/^file_uploads\/(.+)\/send$/))) { store.uploads.get(m[1]).bytes = Buffer.from(await body.get('file').arrayBuffer()); return json({}); }
    const toProps = props => ({...props, Assets: {files: props.Assets.files.map(f => ({name: f.name, type: 'file', file: {url: 'https://files.test/' + f.file_upload.id}}))}});
    if (method === 'POST' && p === 'pages') { const b = JSON.parse(body), id = 'page-' + store.n++; store.pages.set(id, {id, url: 'https://www.notion.so/' + id, parent: b.parent, properties: toProps(b.properties), blocks: b.children.map(x => ({...x, id: 'b' + store.n++}))}); return json({id}); }
    if ((m = p.match(/^pages\/(.+)$/))) { const pg = store.pages.get(m[1]); if (method === 'PATCH') pg.properties = toProps(JSON.parse(body).properties); const {blocks, ...x} = pg; return json(x); }
    return json({message: 'unexpected ' + key}, 400);
  };
  return store;
}
const opts = s => ({token: 'test-token', fetch: s.fetch, sleep: async () => {}});

test('export refuses without a current final approval (before any network call)', async () => {
  const dir = approvedPost(), wf = readJSON(path.join(dir, 'workflow.json')); wf.approvals.final = null; writeJSON(path.join(dir, 'workflow.json'), wf);
  const s = fakeNotion();
  await assert.rejects(exportPost(dir, opts(s)), /final/);
  assert.equal(s.calls.length, 0);
});
test('export creates once, then finds the page by marker and updates it (no duplicate)', async () => {
  const dir = approvedPost(), s = fakeNotion({failOnce: {'POST file_uploads': 1}});
  const first = await exportPost(dir, opts(s));
  assert.equal(first.action, 'created'); assert.equal(s.pages.size, 1);
  const second = await exportPost(dir, opts(s));
  assert.equal(second.action, 'updated'); assert.equal(second.pageId, first.pageId); assert.equal(s.pages.size, 1);
  const blocks = s.pages.get(first.pageId).blocks.map(b => b[b.type].rich_text.map(t => t.text.content).join(''));
  assert.equal(blocks.filter(t => t === 'akalmesin-managed-end').length, 1, 'managed section replaced, not appended twice');
});
test('export keeps human notes outside the managed section and refuses ambiguous duplicates', async () => {
  const dir = approvedPost(), s = fakeNotion(); const {pageId} = await exportPost(dir, opts(s));
  s.pages.get(pageId).blocks.push({id: 'note', type: 'paragraph', paragraph: {rich_text: [{text: {content: 'catatan Angger'}}]}});
  await exportPost(dir, opts(s));
  assert.ok(s.pages.get(pageId).blocks.some(b => b.id === 'note'));
  s.pages.set('dup', {...s.pages.get(pageId), id: 'dup', blocks: [...s.pages.get(pageId).blocks]});
  await assert.rejects(exportPost(dir, opts(s)), /2 pages carry/);
});
test('assets upload in slide order and the receipt is written', async () => {
  const dir = approvedPost(), s = fakeNotion(), n = await exportPost(dir, opts(s)), m = manifest(dir);
  const files = s.pages.get(n.pageId).properties.Assets.files.map(f => f.name);
  assert.deepEqual(files, m.assets.map(a => path.basename(a.file)));

  const wf = readJSON(path.join(dir, 'workflow.json'));
  assert.equal(wf.notion.pageId, n.pageId); assert.equal(wf.notion.assetsMatchBuild, true); assert.match(wf.notion.exportedAtWIB, / WIB$/);
  assert.deepEqual(wf.notion.uploadedAssetHashes, m.assets.map(a => a.sha256)); assert.equal(wf.stage, 'notion-delivered');
  const props = s.pages.get(n.pageId).properties;
  assert.equal(props.Status.status.name, 'Ready to Publish'); assert.equal(props.Format.select.name, 'Carousel'); assert.equal(props['Publish date'].date, null);
});
test('rich_text is chunked at 2000 characters and rejoins exactly', () => {
  const long = 'ą'.repeat(4500), r = richText(long);
  assert.deepEqual(r.map(x => x.text.content.length), [2000, 2000, 500]);
  assert.equal(r.map(x => x.text.content).join(''), long);
  const m = manifest(approvedPost()); m.body = 'x'.repeat(2500);
  assert.ok(bodyBlocks(m).every(b => b[b.type].rich_text.every(t => t.text.content.length <= 2000)));
});
test('topic mapping accepts the five topics and fails loudly otherwise', () => {
  assert.equal(topicFor('AI'), 'AI'); assert.equal(topicFor('robotics'), 'Robotika'); assert.equal(topicFor('Chip'), 'Chip');
  assert.throws(() => topicFor('Sains'), /no Notion Topic/); assert.throws(() => topicFor(undefined), /no Notion Topic/);
});
test('client needs a token and never puts it in errors', async () => {
  assert.throws(() => client({token: ''}), /NOTION_UPLOAD_TOKEN/);
  const api = client({token: 'secret-xyz', fetch: async () => ({ok: false, status: 400, json: async () => ({message: 'bad'})}), sleep: async () => {}});
  await assert.rejects(api.call('GET', 'pages/x'), e => !e.message.includes('secret-xyz') && /HTTP 400/.test(e.message));
});
