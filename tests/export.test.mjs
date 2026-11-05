import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {ROOT, readJSON, writeJSON, designRevision} from '../scripts/core.mjs';
import {planSlot, nextSlot, notionFormat, exportPost, richText, topicFor, client, manifest, bodyBlocks, legacyTexts} from '../scripts/export.mjs';
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
      store.uploads.set(id, {...JSON.parse(body), name: JSON.parse(body).filename});
      return json({id});
    }
    if ((m = p.match(/^file_uploads\/(.+)\/send$/))) {
      const u = store.uploads.get(m[1]),
        chunk = Buffer.from(await body.get('file').arrayBuffer());
      if (body.get('part_number')) u.parts = [...(u.parts || []), [Number(body.get('part_number')), chunk]];
      else u.bytes = chunk;
      return json({});
    }
    if ((m = p.match(/^file_uploads\/(.+)\/complete$/))) {
      const u = store.uploads.get(m[1]);
      u.bytes = Buffer.concat(u.parts.sort((x, y) => x[0] - y[0]).map(x => x[1]));
      u.completed = true;
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
  assert.match(props['Publish date'].date.start, /T\d\d:\d\d:00\+07:00$/);
  assert.equal(wf.notion.publishDate.source, 'auto');
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

function reelPost(mp4Bytes) {
  const dir = approvedPost();
  fs.mkdirSync(path.join(dir, 'reel'), {recursive: true});
  fs.mkdirSync(path.join(dir, 'out/reel'), {recursive: true});
  fs.writeFileSync(path.join(dir, 'reel/reel.json'), JSON.stringify({publishAs: 'reel-only'}));
  fs.writeFileSync(path.join(dir, 'out/reel/reel.mp4'), mp4Bytes);
  writeJSON(path.join(dir, 'reel/check.json'), {mp4: 'reel.mp4', sha256: sha(mp4Bytes), bytes: mp4Bytes.length, passed: true, results: []});
  const wf = readJSON(path.join(dir, 'workflow.json'));
  wf.approvals.final.revision = designRevision(readJSON(path.join(dir, 'post.json')), dir);
  writeJSON(path.join(dir, 'workflow.json'), wf);
  return dir;
}
test('reel-only export attaches the checked mp4 first, verifies it by hash and size, and writes posting notes', async () => {
  const dir = reelPost(Buffer.from('fake-mp4-bytes')),
    s = fakeNotion(),
    n = await exportPost(dir, opts(s)),
    m = manifest(dir),
    pg = s.pages.get(n.pageId);
  const names = pg.properties.Assets.files.map(f => f.name);
  assert.equal(names[0], m.slug + '-reel.mp4');
  assert.equal(names.length, m.assets.length);
  assert.equal([...s.uploads.values()][0].content_type, 'video/mp4');
  assert.equal(n.uploadedAssetHashes[0], sha(Buffer.from('fake-mp4-bytes')));
  assert.equal(pg.properties.Format.select.name, 'Reel / video');
  const texts = pg.blocks.map(text);
  assert.ok(texts.includes('Posting notes'));
  assert.ok(texts.some(t => /one Instagram Reel from .*-reel\.mp4/.test(t)));
  assert.equal(pg.properties.Caption.rich_text.map(t => t.text.content).join(''), m.properties.Caption);
});
test('reel-only export refuses an mp4 that reel:check did not pass (before any network call)', async () => {
  const dir = reelPost(Buffer.from('a'));
  fs.writeFileSync(path.join(dir, 'out/reel/reel.mp4'), 'changed');
  const s = fakeNotion();
  await assert.rejects(exportPost(dir, opts(s)), /not the file reel:check passed/);
  assert.equal(s.calls.length, 0);
});
test('files over 20 MB upload multi-part and are completed', async () => {
  const big = crypto.randomBytes(21 * 1024 * 1024),
    dir = reelPost(big),
    s = fakeNotion(),
    n = await exportPost(dir, opts(s));
  const u = [...s.uploads.values()][0];
  assert.equal(u.mode, 'multi_part');
  assert.equal(u.number_of_parts, 3);
  assert.ok(u.completed);
  assert.equal(n.uploadedAssetHashes[0], sha(big));
});
test('carousel export writes posting notes naming the PNG order and caption source', async () => {
  const dir = approvedPost(),
    s = fakeNotion(),
    n = await exportPost(dir, opts(s));
  const texts = s.pages.get(n.pageId).blocks.map(text);
  assert.ok(texts.some(t => /Post as: one carousel from the PNGs in Assets, in that order/.test(t)));
  assert.ok(texts.some(t => /Caption: the Caption property, verbatim/.test(t)));
});

const NOW = Date.parse('2026-11-05T10:30:00+07:00');
const row = (id, status, start) => ({id, status, start});
test('planSlot: last posts 1 Nov 13/14/15 WIB → next exports get 2 Nov 13:00, 14:00, 15:00 in order', () => {
  const rows = [
    row('a', 'Published', '2026-11-01T13:00:00+07:00'),
    row('b', 'Published', '2026-11-01T14:00:00+07:00'),
    row('c', 'Scheduled', '2026-11-01T15:00:00+07:00')
  ];
  const now = Date.parse('2026-11-01T16:00:00+07:00'),
    autoIds = new Set(),
    got = [];
  for (let i = 0; i < 4; i++) {
    const s = planSlot(rows, {now, autoIds});
    got.push(s.start);
    rows.push(row('n' + i, 'Ready to Publish', s.start));
    autoIds.add('n' + i);
  }
  assert.deepEqual(got, ['2026-11-02T13:00:00+07:00', '2026-11-02T14:00:00+07:00', '2026-11-02T15:00:00+07:00', '2026-11-03T13:00:00+07:00']);
});
test('planSlot: empty database → fallback 10:00/15:00/20:00 WIB from today, never in the past', () => {
  const s = planSlot([], {now: NOW});
  assert.equal(s.start, '2026-11-05T15:00:00+07:00');
  assert.ok(s.fallback);
});
test('planSlot: mixed time zones convert to WIB; taken slots and Draft/empty/all-day rows handled', () => {
  const rows = [
    row('a', 'Published', '2026-11-04T03:00:00.000Z'), // 10:00 WIB
    row('b', 'Scheduled', '2026-11-04T09:00:00+01:00'), // 15:00 WIB
    row('c', 'Draft', '2026-11-09T08:00:00+07:00'), // Draft: not the reference day
    row('d', 'Ready to Publish', null),
    row('e', 'Error', '2026-11-05T10:00:00+07:00'), // taken even though not reference
    row('f', 'Ready to Publish', '2026-11-05T15:00:00+07:00') // taken (reference day becomes 5 Nov)
  ];
  const s = planSlot(rows, {now: Date.parse('2026-11-04T20:00:00+07:00')});
  assert.equal(s.template, '2026-11-05');
  assert.deepEqual(s.times, ['15:00']);
  assert.equal(s.start, '2026-11-06T15:00:00+07:00');
  const t = planSlot(rows.slice(0, 5), {now: Date.parse('2026-11-04T20:00:00+07:00')});
  assert.deepEqual(t.times, ['10:00', '15:00']);
  assert.equal(t.start, '2026-11-05T15:00:00+07:00', '10:00 on 5 Nov is taken by the Error row');
});
test('planSlot: all-day dates are no slot (fallback times on the next day); past templates advance to the future', () => {
  const a = planSlot([row('a', 'Published', '2026-11-04')], {now: Date.parse('2026-11-04T08:00:00+07:00')});
  assert.ok(a.fallback);
  assert.equal(a.start, '2026-11-05T10:00:00+07:00');
  const b = planSlot([row('a', 'Published', '2026-10-01T13:00:00+07:00')], {now: NOW});
  assert.equal(b.start, '2026-11-05T13:00:00+07:00');
  const c = planSlot([row('a', 'Published', '2026-10-01T09:00:00+07:00')], {now: NOW});
  assert.equal(c.start, '2026-11-06T09:00:00+07:00');
});
test('export: --publish-at overrides, --no-publish-date leaves it empty, both read back', async () => {
  const dir = approvedPost(),
    s = fakeNotion(),
    n = await exportPost(dir, {...opts(s), publishAt: '2026-11-07T06:00:00Z'});
  assert.equal(s.pages.get(n.pageId).properties['Publish date'].date.start, '2026-11-07T13:00:00+07:00');
  assert.equal(n.publishDate.source, 'flag');
  assert.ok(
    s.pages
      .get(n.pageId)
      .blocks.map(text)
      .some(t => /Planned slot: 2026-11-07 13:00 WIB \(set with --publish-at\)/.test(t))
  );
  const d2 = approvedPost(),
    s2 = fakeNotion(),
    n2 = await exportPost(d2, {...opts(s2), publishDate: false});
  assert.equal(s2.pages.get(n2.pageId).properties['Publish date'].date, null);
  await assert.rejects(exportPost(approvedPost(), {...opts(fakeNotion()), publishAt: '2026-11-07'}), /with offset/);
});
test('export: auto slot from the queried rows, recorded in posting notes and receipt; updates keep the date', async () => {
  const other = {
    id: 'other',
    properties: {Status: {status: {name: 'Published'}}, 'Publish date': {date: {start: '2030-01-01T13:00:00+07:00'}}},
    blocks: []
  };
  const dir = approvedPost(),
    s = fakeNotion({pages: [other]}),
    n = await exportPost(dir, {...opts(s), now: NOW});
  assert.equal(n.publishDate.start, '2030-01-02T13:00:00+07:00');
  assert.ok(
    s.pages
      .get(n.pageId)
      .blocks.map(text)
      .some(t => /Planned slot: 2030-01-02 13:00 WIB \(auto-assigned\)/.test(t))
  );
  assert.deepEqual(s.pages.get('other').properties, other.properties, 'other rows untouched');
  const again = await exportPost(dir, {...opts(s), now: NOW});
  assert.equal(again.action, 'updated');
  assert.equal(s.pages.get(n.pageId).properties['Publish date'].date.start, '2030-01-02T13:00:00+07:00');
});
/** Real temp root whose content/posts/<slug> is the post dir, so autoAssignedIds(root) reads the actual receipt. */
function rootWith(dir) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'akalmesin-root-'));
  fs.mkdirSync(path.join(root, 'content/posts'), {recursive: true});
  fs.symlinkSync(dir, path.join(root, 'content/posts', path.basename(dir)));
  return root;
}
const pub = (id, start) => ({id, properties: {Status: {status: {name: 'Published'}}, 'Publish date': {date: {start}}}, blocks: []});
const NOW1 = Date.parse('2026-11-01T15:00:00+07:00');
test('export: an update keeps the auto publishDate receipt, so nextSlot does not skip a day (PR #3 review)', async () => {
  const dir = approvedPost(),
    root = rootWith(dir),
    s = fakeNotion({pages: [pub('r1', '2026-11-01T13:00:00+07:00'), pub('r2', '2026-11-01T14:00:00+07:00')]}),
    o = {...opts(s), now: NOW1, root};
  const n = await exportPost(dir, o);
  assert.equal(n.publishDate.start, '2026-11-02T13:00:00+07:00');
  assert.equal((await nextSlot(client(o), {now: NOW1, root})).start, '2026-11-02T14:00:00+07:00');
  const again = await exportPost(dir, o);
  assert.equal(again.action, 'updated');
  assert.equal(again.publishDate.source, 'auto');
  assert.equal(again.publishDate.carriedOver, true);
  assert.equal(readJSON(path.join(dir, 'workflow.json')).notion.publishDate.source, 'auto', 'receipt on disk keeps it');
  assert.equal(s.pages.get(n.pageId).properties['Publish date'].date.start, '2026-11-02T13:00:00+07:00', 'Notion date untouched');
  assert.equal((await nextSlot(client(o), {now: NOW1, root})).start, '2026-11-02T14:00:00+07:00', 'not 3 Nov');
});
test('export: if the owner changed the Notion date before an update, the auto receipt is dropped', async () => {
  const dir = approvedPost(),
    root = rootWith(dir),
    s = fakeNotion({pages: [pub('r1', '2026-11-01T13:00:00+07:00'), pub('r2', '2026-11-01T14:00:00+07:00')]}),
    o = {...opts(s), now: NOW1, root};
  const n = await exportPost(dir, o);
  s.pages.get(n.pageId).properties['Publish date'] = {date: {start: '2026-11-03T09:00:00+07:00'}};
  const again = await exportPost(dir, o);
  assert.equal(again.publishDate, undefined);
  assert.equal(readJSON(path.join(dir, 'workflow.json')).notion.publishDate, undefined);
  assert.equal(s.pages.get(n.pageId).properties['Publish date'].date.start, '2026-11-03T09:00:00+07:00', "owner's date untouched");
});
