import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {ROOT, readJSON, writeJSON, designRevision} from '../scripts/core.mjs';
import {notionFormat, exportPost, richText, topicFor, client, manifest, bodyBlocks, legacyTexts} from '../scripts/export.mjs';
import {KIMI, tmpPost} from './helpers.mjs';

const sha = b => crypto.createHash('sha256').update(b).digest('hex');
/** Kimi fixture with its real copy approval, a test final approval of the current design, and a build.json pointing at small fake PNGs (no render, no network). */
function approvedPost() {
  const dir = tmpPost({fresh: false}),
    out = path.join(dir, 'out'),
    build = readJSON(path.join(KIMI, 'out/build.json'));
  fs.mkdirSync(path.join(out, 'png'), {recursive: true});
  build.slides = build.slides.map((s, i) => {
    const f = path.join(out, 'png', `${s.id}.png`),
      b = Buffer.from('png-' + i);
    fs.writeFileSync(f, b);
    return {...s, png: path.relative(ROOT, f), pngHash: sha(b)};
  });
  writeJSON(path.join(out, 'build.json'), build);
  const wf = readJSON(path.join(dir, 'workflow.json'));
  wf.notion = null;
  wf.approvals.final = {gate: 'final', words: 'test fixture', source: 'test', revision: designRevision(readJSON(path.join(dir, 'post.json')), dir)};
  writeJSON(path.join(dir, 'workflow.json'), wf);
  return dir;
}
/** In-memory Notion: pages, blocks, file uploads. Records every call. */
function fakeNotion({pages = [], failOnce = {}} = {}) {
  const store = {pages: new Map(pages.map(p => [p.id, p])), uploads: new Map(), calls: [], n: 0};
  const json = (body, status = 200) => ({ok: status < 300, status, headers: {get: () => '0'}, json: async () => body, arrayBuffer: async () => body});
  store.fetch = async (url, {method, body} = {}) => {
    const u = new URL(url),
      p = u.pathname.replace('/v1/', '');
    store.calls.push(method + ' ' + p);
    const key = method + ' ' + p.split('/')[0];
    if (failOnce[key]) {
      failOnce[key]--;
      return json({message: 'slow down'}, 429);
    }
    if (u.host === 'files.test') return json(store.uploads.get(p.slice(1)).bytes);
    let m;
    if (method === 'POST' && p.endsWith('/query')) return json({results: [...store.pages.values()].map(({blocks, ...x}) => x), has_more: false});
    if ((m = p.match(/^blocks\/(.+)\/children$/))) {
      const pg = store.pages.get(m[1]);
      if (method === 'GET') return json({results: pg.blocks, has_more: false});
      pg.blocks.push(...JSON.parse(body).children.map(b => ({...b, id: 'b' + store.n++})));
      return json({});
    }
    if (method === 'DELETE' && (m = p.match(/^blocks\/(.+)$/))) {
      for (const pg of store.pages.values()) pg.blocks = pg.blocks.filter(b => b.id !== m[1]);
      return json({});
    }
    if (p === 'file_uploads') {
      const id = 'u' + store.n++;
      store.uploads.set(id, {name: JSON.parse(body).filename});
      return json({id});
    }
    if ((m = p.match(/^file_uploads\/(.+)\/send$/))) {
      store.uploads.get(m[1]).bytes = Buffer.from(await body.get('file').arrayBuffer());
      return json({});
    }
    const toProps = props => ({
      ...props,
      Assets: {files: props.Assets.files.map(f => ({name: f.name, type: 'file', file: {url: 'https://files.test/' + f.file_upload.id}}))}
    });
    if (method === 'POST' && p === 'pages') {
      const b = JSON.parse(body),
        id = 'page-' + store.n++;
      store.pages.set(id, {
        id,
        url: 'https://www.notion.so/' + id,
        parent: b.parent,
        properties: toProps(b.properties),
        blocks: b.children.map(x => ({...x, id: 'b' + store.n++}))
      });
      return json({id});
    }
    if ((m = p.match(/^pages\/(.+)$/))) {
      const pg = store.pages.get(m[1]);
      if (method === 'PATCH') pg.properties = {...pg.properties, ...toProps(JSON.parse(body).properties)};
      const {blocks, ...x} = pg;
      return json(x);
    }
    return json({message: 'unexpected ' + key}, 400);
  };
  return store;
}
const opts = s => ({token: 'test-token', fetch: s.fetch, sleep: async () => {}});

test('export refuses without a current final approval (before any network call)', async () => {
  const dir = approvedPost(),
    wf = readJSON(path.join(dir, 'workflow.json'));
  wf.approvals.final = null;
  writeJSON(path.join(dir, 'workflow.json'), wf);
  const s = fakeNotion();
  await assert.rejects(exportPost(dir, opts(s)), /final/);
  assert.equal(s.calls.length, 0);
});
test('export creates once, then finds the page by marker and updates it (no duplicate)', async () => {
  const dir = approvedPost(),
    s = fakeNotion({failOnce: {'POST file_uploads': 1}});
  const first = await exportPost(dir, opts(s));
  assert.equal(first.action, 'created');
  assert.equal(s.pages.size, 1);
  const second = await exportPost(dir, opts(s));
  assert.equal(second.action, 'updated');
  assert.equal(second.pageId, first.pageId);
  assert.equal(s.pages.size, 1);
  const blocks = s.pages.get(first.pageId).blocks.map(b => b[b.type].rich_text.map(t => t.text.content).join(''));
  assert.equal(blocks.filter(t => t === 'akalmesin-managed-end').length, 1, 'managed section replaced, not appended twice');
});
test('export keeps human notes outside the managed section and refuses ambiguous duplicates', async () => {
  const dir = approvedPost(),
    s = fakeNotion();
  const {pageId} = await exportPost(dir, opts(s));
  s.pages.get(pageId).blocks.push({id: 'note', type: 'paragraph', paragraph: {rich_text: [{text: {content: 'catatan Angger'}}]}});
  await exportPost(dir, opts(s));
  assert.ok(s.pages.get(pageId).blocks.some(b => b.id === 'note'));
  s.pages.set('dup', {...s.pages.get(pageId), id: 'dup', blocks: [...s.pages.get(pageId).blocks]});
  await assert.rejects(exportPost(dir, opts(s)), /2 pages carry/);
});
test('assets upload in slide order and the receipt is written', async () => {
  const dir = approvedPost(),
    s = fakeNotion(),
    n = await exportPost(dir, opts(s)),
    m = manifest(dir);
  const files = s.pages.get(n.pageId).properties.Assets.files.map(f => f.name);
  assert.deepEqual(
    files,
    m.assets.map(a => path.basename(a.file))
  );

  const wf = readJSON(path.join(dir, 'workflow.json'));
  assert.equal(wf.notion.pageId, n.pageId);
  assert.equal(wf.notion.assetsMatchBuild, true);
  assert.match(wf.notion.exportedAtWIB, / WIB$/);
  assert.deepEqual(
    wf.notion.uploadedAssetHashes,
    m.assets.map(a => a.sha256)
  );
  assert.equal(wf.stage, 'notion-delivered');
  const props = s.pages.get(n.pageId).properties;
  assert.equal(props.Status.status.name, 'Ready to Publish');
  assert.equal(props.Format.select.name, 'Carousel');
  assert.equal(props['Publish date'].date, null);
});
test('rich_text is chunked at 2000 characters and rejoins exactly', () => {
  const long = 'ą'.repeat(4500),
    r = richText(long);
  assert.deepEqual(
    r.map(x => x.text.content.length),
    [2000, 2000, 500]
  );
  assert.equal(r.map(x => x.text.content).join(''), long);
  const m = manifest(approvedPost());
  m.body = 'x'.repeat(2500);
  assert.ok(bodyBlocks(m).every(b => b[b.type].rich_text.every(t => t.text.content.length <= 2000)));
});
test('topic mapping accepts the five topics and fails loudly otherwise', () => {
  assert.equal(topicFor('AI'), 'AI');
  assert.equal(topicFor('ROBOTIKA'), 'Robotika');
  assert.equal(topicFor('TUTORIAL AI'), 'TUTORIAL AI');
  assert.equal(topicFor('PROGRAMMING'), 'PROGRAMMING');
  assert.equal(topicFor('KOMPUTER'), 'KOMPUTER');
  assert.equal(topicFor('TEKNOLOGI'), 'TEKNOLOGI');
  assert.equal(topicFor('SAINS'), 'SAINS');
  assert.throws(() => topicFor('Software'), /no Notion Topic/);
  assert.throws(() => topicFor('ai'), /no Notion Topic/);
  assert.throws(() => topicFor(undefined), /no Notion Topic/);
});
test('client needs a token and never puts it in errors', async () => {
  assert.throws(() => client({token: ''}), /NOTION_UPLOAD_TOKEN/);
  const api = client({token: 'secret-xyz', fetch: async () => ({ok: false, status: 400, json: async () => ({message: 'bad'})}), sleep: async () => {}});
  await assert.rejects(api.call('GET', 'pages/x'), e => !e.message.includes('secret-xyz') && /HTTP 400/.test(e.message));
});

// ---------- --adopt-legacy (t56u) ----------
const text = b => b[b.type].rich_text.map(t => t.plain_text ?? t.text.content).join('');
/** A page shaped like the real connector-made Kimi row: legacy blocks, no end line, owner set Published + date, old files. */
function legacyPage(dir, extra = []) {
  const legacy = readJSON(path.join(dir, 'notion-legacy-body.json')).children.map((b, i) => ({...b, id: 'legacy' + i, has_children: false}));
  return {
    id: 'legacy-page',
    url: 'https://www.notion.so/legacy-page',
    parent: {data_source_id: '405f909f-26a5-8029-8e7a-000b3f2a28a4'},
    blocks: [...legacy, ...extra],
    properties: {
      Status: {status: {name: 'Published'}},
      'Publish date': {date: {start: '2026-10-28T12:00:00.000+07:00', end: null, time_zone: null}},
      Assets: {files: [{name: '01-main.png', type: 'file', file: {url: 'https://files.test/old'}}]}
    }
  };
}
const note = {id: 'human', type: 'paragraph', has_children: false, paragraph: {rich_text: [{text: {content: 'catatan Angger: ganti jam tayang'}}]}};

test('adopt-legacy takes over a connector-made page: managed body, new ordered assets, owner Status/date kept; rerun is a plain update', async () => {
  const dir = approvedPost(),
    s = fakeNotion({pages: [legacyPage(dir)]}),
    m = manifest(dir);
  assert.equal(legacyTexts(dir).length, 3);
  await assert.rejects(exportPost(dir, opts(s)), /no "akalmesin-managed-end" line/, 'normal export still refuses');
  assert.ok(!s.calls.some(c => /^(PATCH|DELETE)|file_uploads/.test(c)), 'and refuses before writing anything');
  const plan = await exportPost(dir, {...opts(s), adoptLegacy: true, dryRun: true});
  assert.deepEqual(plan.foreign, []);
  assert.equal(plan.deleteBlocks.length, 3);
  assert.deepEqual(plan.replaceAssets.from, ['01-main.png']);
  assert.ok(!s.calls.some(c => /^(PATCH|DELETE)|file_uploads/.test(c)), 'dry run writes nothing');
  const r = await exportPost(dir, {...opts(s), adoptLegacy: true});
  const pg = s.pages.get('legacy-page');
  assert.equal(r.action, 'adopted');
  assert.equal(s.pages.size, 1);
  assert.deepEqual(pg.blocks.map(text), bodyBlocks(m).map(text));
  assert.deepEqual(
    pg.properties.Assets.files.map(f => f.name),
    m.assets.map(a => path.basename(a.file))
  );
  assert.equal(pg.properties.Status.status.name, 'Published');
  assert.equal(pg.properties['Publish date'].date.start, '2026-10-28T12:00:00.000+07:00');
  assert.equal(r.assetsMatchBuild, true);
  assert.deepEqual(r.adoptedLegacy.deletedBlocks, ['legacy0', 'legacy1', 'legacy2']);
  const again = await exportPost(dir, {...opts(s), adoptLegacy: true});
  assert.equal(again.action, 'updated');
  assert.deepEqual(s.pages.get('legacy-page').blocks.map(text), bodyBlocks(m).map(text));
});
test('adopt-legacy refuses a page with a foreign block (no writes) unless that block is listed in --force-blocks', async () => {
  const dir = approvedPost(),
    s = fakeNotion({pages: [legacyPage(dir, [note])]});
  await assert.rejects(exportPost(dir, {...opts(s), adoptLegacy: true}), e => /Refusing to adopt/.test(e.message) && /human .*catatan Angger/.test(e.message));
  await assert.rejects(exportPost(dir, {...opts(s), adoptLegacy: true, forceBlocks: ['other']}), /Refusing to adopt/);
  assert.ok(!s.calls.some(c => /^(PATCH|DELETE)|file_uploads/.test(c)), 'refusal happens before any write or upload');
  assert.ok(s.pages.get('legacy-page').blocks.some(b => b.id === 'human'));
  const edited = legacyPage(dir);
  edited.blocks[1] = {...edited.blocks[1], paragraph: {rich_text: [{text: {content: text(edited.blocks[1]) + ' (diedit)'}}]}};
  await assert.rejects(exportPost(dir, {...opts(fakeNotion({pages: [edited]})), adoptLegacy: true}), /legacy1/, 'an edited generated block counts as foreign');
  const r = await exportPost(dir, {...opts(s), adoptLegacy: true, forceBlocks: ['human']});
  assert.equal(r.action, 'adopted');
  assert.deepEqual(r.adoptedLegacy.forcedBlocks, ['human']);
  assert.ok(!s.pages.get('legacy-page').blocks.some(b => b.id === 'human'));
});
test('normal pages are unaffected by adopt-legacy, and updates keep the owner Status / Publish date', async () => {
  const dir = approvedPost(),
    s = fakeNotion(),
    {pageId} = await exportPost(dir, opts(s));
  const pg = s.pages.get(pageId);
  pg.properties.Status = {status: {name: 'Published'}};
  pg.properties['Publish date'] = {date: {start: '2026-11-01'}};
  const before = pg.blocks.map(text);
  const r = await exportPost(dir, {...opts(s), adoptLegacy: true});
  assert.equal(r.action, 'updated');
  assert.deepEqual(s.pages.get(pageId).blocks.map(text), before);
  assert.equal(s.pages.get(pageId).properties.Status.status.name, 'Published');
  assert.equal(s.pages.get(pageId).properties['Publish date'].date.start, '2026-11-01');
  await assert.rejects(exportPost(approvedPost(), {...opts(fakeNotion()), adoptLegacy: true}), /only takes over an existing page/);
});

test('notionFormat: reel-only reel.json → Reel / video; else Carousel / Single image', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'akal-fmt-'));
  try {
    const post = {slides: [{}, {}]};
    assert.equal(notionFormat(post, dir), 'Carousel');
    assert.equal(notionFormat({slides: [{}]}, dir), 'Single image');
    fs.mkdirSync(path.join(dir, 'reel'));
    fs.writeFileSync(path.join(dir, 'reel/reel.json'), '{}');
    assert.equal(notionFormat(post, dir), 'Carousel');
    fs.writeFileSync(path.join(dir, 'reel/reel.json'), JSON.stringify({publishAs: 'reel-only'}));
    assert.equal(notionFormat(post, dir), 'Reel / video');
    fs.writeFileSync(path.join(dir, 'reel/reel.json'), JSON.stringify({publishAs: 'both'}));
    assert.throws(() => notionFormat(post, dir), /publishAs/);
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
});
