// npm run export -- <slug> --dry-run   → out/notion-manifest.json only (no network)
// npm run export -- <slug>             → one command, Notion REST API (token: NOTION_UPLOAD_TOKEN):
//   find page by body marker → create or update it → upload PNGs in order → read back + SHA-256
//   check → receipt in workflow.json. Re-running updates the same page; it never makes a second one.
// npm run export -- <slug> --adopt-legacy [--force-blocks id,id] [--dry-run]
//   → take over an older connector-made page (marker, no end line); see docs/workflow.md step 8.
// `--post <slug>` works too. Step 8. Requires a current final approval. Never publishes or schedules.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  ROOT,
  TOPICS,
  loadPost,
  parseArgs,
  readJSON,
  writeJSON,
  saveWorkflow,
  copyRevision,
  designRevision,
  requireApproval,
  requireFinalApproval,
  requireCopyApproval,
  fileHash,
  wib,
  isMain,
  fail,
  rel
} from './core.mjs';

export const NOTION = {
  dataSourceId: '405f909f-26a5-8029-8e7a-000b3f2a28a4',
  databaseId: '405f909f-26a5-8057-ad0a-e9562fe9c915',
  accountPageId: '403f909f-26a5-80a6-bb5f-ff38accdc8d0',
  version: '2025-09-03'
};
const PAGE_ID = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;

/** Post category → Notion Topic select. Unknown categories fail loudly (no silent default). */
const TOPIC_ALIASES = {
  ai: 'AI',
  robotika: 'Robotika',
  robotics: 'Robotika',
  komputasi: 'Komputasi',
  computing: 'Komputasi',
  chip: 'Chip',
  chips: 'Chip',
  semiconductor: 'Chip',
  software: 'Software'
};
export function topicFor(category) {
  const t =
    TOPIC_ALIASES[
      String(category || '')
        .trim()
        .toLowerCase()
    ];
  if (!t || !TOPICS.includes(t)) throw Error(`category "${category}" has no Notion Topic; use one of ${TOPICS.join(', ')}`);
  return t;
}

export function manifest(ref) {
  const {paths, post, workflow} = loadPost(ref);
  requireCopyApproval(workflow, post);
  const final = requireFinalApproval(workflow, post, paths.dir);
  const build = readJSON(path.join(paths.out, 'build.json'));
  const assets = build.slides.map(s => {
    const file = path.join(ROOT, s.png),
      bytes = fs.statSync(file).size;
    if (fileHash(file) !== s.pngHash) throw Error(s.png + ' changed after the approved build');
    if (bytes > 20 * 1024 * 1024) throw Error(s.png + ' exceeds Notion 20 MB upload limit');
    return {slideId: s.id, file: s.png, sha256: s.pngHash, bytes};
  });
  const topic = topicFor(post.category);
  const contentId = post.contentId || 'akalmesin:' + post.slug,
    marker = 'akalmesin-content-id:' + contentId;
  const body = [
    '# Approved copy',
    ...post.slides.map(s => `## ${s.id}\n\n` + (s.layout === 'main' ? `${s.headline.join(' ')}\n\n${s.summary}` : s.paragraphs.join('\n\n'))),
    '# Caption',
    post.caption.join('\n\n'),
    '# Sources',
    post.sources.map(s => `- [${s.title}](${s.url})`).join('\n'),
    '# Alt text and photo credits',
    post.slides.map(s => `${s.id}: ${s.alt}\n\n${s.credit}`).join('\n\n'),
    '# Approval',
    `"${final.words}" — ${final.source}, ${final.atWIB}`,
    `Approved design revision: ${final.revision}`,
    '# Source ledger',
    fs.readFileSync(path.join(paths.dir, 'sources.md'), 'utf8').trim(),
    '# Export metadata',
    [marker, 'Account: akalmesin', 'Editorial depth: ' + post.format, 'Slide count: ' + post.slides.length].join('\n\n')
  ].join('\n\n');
  return {
    schemaVersion: 1,
    slug: post.slug,
    destination: NOTION,
    approvedRevision: final.revision,
    approval: final,
    existingPageId: workflow.notion?.pageId || null,
    lookup: `Before creating, query data source ${NOTION.dataSourceId} and read page bodies for the exact marker "${marker}". Never match by title alone.`,
    properties: {
      Post: post.title,
      Status: 'Ready to Publish',
      Format: post.slides.length === 1 ? 'Single image' : 'Carousel',
      Caption: post.caption.join('\n\n'),
      Topic: topic,
      'Publish date': null,
      Assets: assets.map(a => path.basename(a.file))
    },
    contentId,
    bodyMarker: marker,
    body,
    assets,
    generatedAt: new Date().toISOString()
  };
}

// ---------- Notion REST client ----------
const API = 'https://api.notion.com/v1/',
  END = 'akalmesin-managed-end';
const sleepMs = ms => new Promise(r => setTimeout(r, ms));

/** One client per run. Retries 429 and 5xx (honouring Retry-After); never logs the token. */
export function client({token = process.env.NOTION_UPLOAD_TOKEN, fetch: f = globalThis.fetch, sleep = sleepMs, tries = 5} = {}) {
  if (!token) throw Error('Set NOTION_UPLOAD_TOKEN in the environment (see AGENTS.md; never paste it into chat or tracked files).');
  async function call(method, url, body, {form, retry = true} = {}) {
    for (let i = 1; ; i++) {
      const r = await f(url.startsWith('http') ? url : API + url, {
        method,
        headers: {Authorization: 'Bearer ' + token, 'Notion-Version': NOTION.version, ...(body && !form ? {'Content-Type': 'application/json'} : {})},
        body: form ? body : body && JSON.stringify(body)
      });
      if (r.ok) return r.json();
      const transient = r.status === 429 || r.status >= 500;
      if (!transient || !retry || i >= tries) {
        let msg = '';
        try {
          msg = (await r.json()).message || '';
        } catch {}
        throw Error(`Notion ${method} ${url.split('?')[0]} → HTTP ${r.status} ${msg}`.trim());
      }
      await sleep(Math.min(30000, (Number(r.headers?.get?.('retry-after')) || 2 ** i) * 1000));
    }
  }
  return {call, fetch: f};
}

/** Plain text → rich_text items of ≤2000 chars each (Notion's per-item limit). */
export function richText(text, limit = 2000) {
  const out = [];
  for (let i = 0; i < text.length; i += limit) out.push({type: 'text', text: {content: text.slice(i, i + limit)}});
  return out.length ? out : [{type: 'text', text: {content: ''}}];
}
/** Inline markdown (**bold**, [text](url)) → rich_text, chunked. */
function inline(md) {
  const out = [],
    re = /\*\*(.+?)\*\*|\[([^\]]+)\]\((https?:[^)\s]+)\)/g;
  let last = 0,
    m;
  const push = (t, extra = {}) => {
    for (const x of richText(t))
      if (t) out.push({...x, text: {...x.text, ...(extra.link ? {link: {url: extra.link}} : {})}, ...(extra.bold ? {annotations: {bold: true}} : {})});
  };
  while ((m = re.exec(md))) {
    push(md.slice(last, m.index));
    m[1] ? push(m[1], {bold: true}) : push(m[2], {link: m[3]});
    last = re.lastIndex;
  }
  push(md.slice(last));
  return out.length ? out : [{type: 'text', text: {content: ''}}];
}
const block = (type, md) => ({object: 'block', type, [type]: {rich_text: inline(md)}});
/** The manifest body markdown → Notion blocks: marker paragraph, managed content, end marker. */
export function bodyBlocks(m) {
  const blocks = [block('paragraph', m.bodyMarker)];
  for (const para of m.body.split(/\n{2,}/)) {
    const lines = para.split('\n');
    if (/^# /.test(para)) blocks.push(block('heading_1', para.slice(2)));
    else if (/^## /.test(para)) blocks.push(block('heading_2', para.slice(3)));
    else if (/^### /.test(para)) blocks.push(block('heading_3', para.slice(4)));
    else if (lines.every(l => /^\s*[-*] /.test(l))) lines.forEach(l => blocks.push(block('bulleted_list_item', l.replace(/^\s*[-*] /, ''))));
    else if (para.trim()) blocks.push(block('paragraph', para));
  }
  blocks.push(block('paragraph', END));
  return blocks;
}
const plain = b => (b[b.type]?.rich_text || []).map(t => t.plain_text ?? t.text?.content ?? '').join('');

async function children(api, id) {
  const all = [];
  let cursor;
  do {
    const r = await api.call('GET', `blocks/${id}/children?page_size=100${cursor ? '&start_cursor=' + cursor : ''}`);
    all.push(...r.results);
    cursor = r.has_more && r.next_cursor;
  } while (cursor);
  return all;
}
/** Every live page in the Posts data source whose body contains the exact marker paragraph. */
export async function findByMarker(api, marker) {
  const pages = [];
  let cursor;
  do {
    const r = await api.call('POST', `data_sources/${NOTION.dataSourceId}/query`, {page_size: 100, ...(cursor ? {start_cursor: cursor} : {})});
    pages.push(...r.results);
    cursor = r.has_more && r.next_cursor;
  } while (cursor);
  const hits = [];
  for (const p of pages.filter(p => !p.in_trash && !p.archived)) if ((await children(api, p.id)).some(b => plain(b).trim() === marker)) hits.push(p);
  return hits;
}
/** On create: Status "Ready to Publish", empty Publish date. On update: Status and Publish date are the owner's and are left alone. */
export function properties(m, fileUploads, {update = false} = {}) {
  const P = m.properties;
  return {
    Post: {title: richText(P.Post)},
    ...(update ? {} : {Status: {status: {name: P.Status}}, 'Publish date': {date: null}}),
    Format: {select: {name: P.Format}},
    Caption: {rich_text: richText(P.Caption)},
    Topic: {select: {name: P.Topic}},
    Assets: {files: fileUploads.map(u => ({name: u.name, type: 'file_upload', file_upload: {id: u.id}}))}
  };
}
async function upload(api, m) {
  const ups = [];
  for (const a of m.assets) {
    const name = path.basename(a.file);
    const up = await api.call('POST', 'file_uploads', {filename: name, content_type: 'image/png'});
    const form = new FormData();
    form.append('file', new Blob([fs.readFileSync(path.join(ROOT, a.file))], {type: 'image/png'}), name);
    await api.call('POST', `file_uploads/${up.id}/send`, form, {form: true});
    ups.push({id: up.id, name});
  }
  return ups;
}
async function appendBlocks(api, pageId, blocks) {
  for (let i = 0; i < blocks.length; i += 100) await api.call('PATCH', `blocks/${pageId}/children`, {children: blocks.slice(i, i + 100)});
}
/** Replace only the managed range (marker … end marker); human notes outside it stay. */
async function replaceBody(api, pageId, m) {
  const kids = await children(api, pageId),
    s = kids.findIndex(b => plain(b).trim() === m.bodyMarker),
    e = kids.findIndex(b => plain(b).trim() === END);
  if (s < 0 || e < s)
    throw Error(
      `Page ${pageId} has the marker but no "${END}" line (older connector-made page). Update it by hand with the connector fallback; export will not guess what to delete.`
    );
  for (const b of kids.slice(s, e + 1)) await api.call('DELETE', 'blocks/' + b.id);
  await appendBlocks(api, pageId, bodyBlocks(m));
}
const norm = t =>
  String(t)
    .split('\n')
    .map(l => l.trimEnd())
    .join('\n')
    .trim();
/** Plain texts the older connector export would have written: from the recorded payload `notion-legacy-body.json`. */
export function legacyTexts(dir) {
  const f = path.join(dir, 'notion-legacy-body.json');
  if (!fs.existsSync(f)) throw Error(`${rel(f)} is missing: adoption needs the exact body the old export sent, to tell generated blocks from human notes.`);
  return readJSON(f).children.map(b => norm(plain(b)));
}
/** Read-only plan for a legacy page: which blocks are generated (to delete) and which are not (foreign). */
export async function adoptPlan(api, pageId, m, known) {
  const kids = await children(api, pageId),
    current = new Set(bodyBlocks(m).map(b => norm(plain(b)))),
    legacy = new Set(known);
  if (!kids.some(b => norm(plain(b)) === m.bodyMarker)) throw Error(`Page ${pageId} does not carry ${m.bodyMarker}; nothing to adopt.`);
  if (kids.some(b => norm(plain(b)) === END)) return {pageId, alreadyManaged: true, generated: [], foreign: []}; // adopted before: a normal update
  const row = b => ({id: b.id, type: b.type, chars: plain(b).length, preview: plain(b).slice(0, 80).replace(/\n/g, ' ')});
  const generated = [],
    foreign = [];
  for (const b of kids) (!b.has_children && (legacy.has(norm(plain(b))) || current.has(norm(plain(b)))) ? generated : foreign).push(row(b));
  return {pageId, generated, foreign};
}
const sha = buf => crypto.createHash('sha256').update(buf).digest('hex');
/** Read the page back: properties, marker, asset order and the SHA-256 of every downloaded file. */
export async function verify(api, pageId, m, {owner} = {}) {
  const page = await api.call('GET', 'pages/' + pageId),
    P = page.properties,
    txt = x => x.map(t => t.plain_text ?? t.text.content).join('');
  const want = m.properties,
    errs = [];
  if (txt(P.Post.title) !== want.Post) errs.push('Post title');
  if (P.Status.status?.name !== (owner ? owner.Status : want.Status)) errs.push('Status');
  if (P.Format.select?.name !== want.Format) errs.push('Format');
  if (P.Topic.select?.name !== want.Topic) errs.push('Topic');
  if (txt(P.Caption.rich_text) !== want.Caption) errs.push('Caption');
  if (JSON.stringify(P['Publish date'].date ?? null) !== JSON.stringify(owner ? owner.publishDate : null))
    errs.push(owner ? 'Publish date changed' : 'Publish date is set');
  if (page.parent?.data_source_id && page.parent.data_source_id.replace(/-/g, '') !== NOTION.dataSourceId.replace(/-/g, '')) errs.push('wrong data source');
  if (!(await children(api, pageId)).some(b => plain(b).trim() === m.bodyMarker)) errs.push('body marker');
  const files = P.Assets.files,
    names = files.map(f => f.name);
  if (names.join('|') !== m.assets.map(a => path.basename(a.file)).join('|')) errs.push('Assets order: ' + names.join(', '));
  const hashes = [];
  for (const f of files) {
    const r = await api.fetch(f.file?.url || f.external?.url);
    if (!r.ok) throw Error('Could not download ' + f.name + ' for verification (HTTP ' + r.status + ')');
    hashes.push(sha(Buffer.from(await r.arrayBuffer())));
  }
  const assetsMatchBuild = hashes.join(',') === m.assets.map(a => a.sha256).join(',');
  if (!assetsMatchBuild) errs.push('downloaded asset hashes differ from the build');
  if (errs.length) throw Error(`Read-back of ${pageId} failed: ${errs.join('; ')}`);
  return {page, hashes, assetsMatchBuild};
}

/** Step 8 end to end. Returns the receipt written to workflow.json (or the plan, for an adopt dry run). */
export async function exportPost(ref, opts = {}) {
  const m = manifest(ref),
    {paths, workflow} = loadPost(ref),
    api = opts.api || client(opts);
  writeJSON(path.join(paths.out, 'notion-manifest.json'), m);
  const hits = await findByMarker(api, m.bodyMarker);
  if (hits.length > 1) throw Error(`${hits.length} pages carry ${m.bodyMarker}: ${hits.map(h => h.id).join(', ')}. Trash the duplicates in Notion first.`);
  let plan, owner, previousAssets;
  if (opts.adoptLegacy) {
    if (!hits.length) throw Error(`No page carries ${m.bodyMarker}; --adopt-legacy only takes over an existing page.`);
    plan = await adoptPlan(api, hits[0].id, m, legacyTexts(paths.dir));
    if (plan.alreadyManaged) {
      if (opts.dryRun) return plan;
      plan = null;
    }
  }
  if (plan) {
    const allowed = new Set(opts.forceBlocks || []),
      unlisted = plan.foreign.filter(b => !allowed.has(b.id));
    if (unlisted.length)
      throw Error(
        `Refusing to adopt ${plan.pageId}: ${unlisted.length} block(s) are not generated content and may be human notes:\n` +
          unlisted.map(b => `  ${b.id} ${b.type}: "${b.preview}"`).join('\n') +
          `\nMove them out by hand, or list them with --force-blocks ${unlisted.map(b => b.id).join(',')} to delete them.`
      );
    const page = await api.call('GET', 'pages/' + plan.pageId);
    owner = {Status: page.properties.Status?.status?.name ?? null, publishDate: page.properties['Publish date']?.date ?? null};
    previousAssets = (page.properties.Assets?.files || []).map(f => f.name);
    plan = {
      ...plan,
      deleteBlocks: [...plan.generated, ...plan.foreign],
      keepProperties: owner,
      replaceAssets: {from: previousAssets, to: m.assets.map(a => path.basename(a.file))}
    };
    if (opts.dryRun) return plan;
  }
  if (hits.length && !plan) {
    // check the body shape before any write, so a legacy page is never half-updated
    const kids = await children(api, hits[0].id);
    if (!kids.some(b => plain(b).trim() === END))
      throw Error(
        `Page ${hits[0].id} has the marker but no "${END}" line (older connector-made page). Run \`npm run export -- ${m.slug} --adopt-legacy --dry-run\` to see what adoption would change; export will not guess what to delete.`
      );
  }
  const ups = await upload(api, m),
    props = properties(m, ups, {update: hits.length > 0});
  let pageId, action;
  if (hits.length) {
    pageId = hits[0].id;
    action = plan ? 'adopted' : 'updated';
    if (!owner) {
      const p = (await api.call('GET', 'pages/' + pageId)).properties;
      owner = {Status: p.Status?.status?.name ?? null, publishDate: p['Publish date']?.date ?? null};
    }
    await api.call('PATCH', 'pages/' + pageId, {properties: props});
    if (plan) {
      for (const b of plan.deleteBlocks) await api.call('DELETE', 'blocks/' + b.id);
      await appendBlocks(api, pageId, bodyBlocks(m));
    } else await replaceBody(api, pageId, m);
  } else {
    // Not retried: a lost create must be found by its marker on the next run, never repeated blindly.
    const blocks = bodyBlocks(m);
    const page = await api.call(
      'POST',
      'pages',
      {parent: {type: 'data_source_id', data_source_id: NOTION.dataSourceId}, properties: props, children: blocks.slice(0, 100)},
      {retry: false}
    );
    pageId = page.id;
    action = 'created';
    await appendBlocks(api, pageId, blocks.slice(100));
  }
  const {page, hashes, assetsMatchBuild} = await verify(api, pageId, m, {owner}),
    at = new Date().toISOString();
  workflow.notion = {
    pageId,
    url: page.url,
    action,
    dataSourceId: NOTION.dataSourceId,
    databaseId: NOTION.databaseId,
    apiVersion: NOTION.version,
    contentId: m.contentId,
    bodyMarker: m.bodyMarker,
    approvedRevision: m.approvedRevision,
    ...(owner ? {ownerManaged: owner} : {}),
    ...(plan ? {adoptedLegacy: {deletedBlocks: plan.deleteBlocks.map(b => b.id), forcedBlocks: plan.foreign.map(b => b.id), previousAssets}} : {}),
    orderedAssetHashes: m.assets.map(a => a.sha256),
    uploadedAssetHashes: hashes,
    assetsMatchBuild,
    exportedAt: at,
    exportedAtWIB: wib(at)
  };
  workflow.stage = 'notion-delivered';
  workflow.history.push({event: 'notion-' + action, pageId, at});
  saveWorkflow(paths, workflow);
  return workflow.notion;
}

/** Optional git-ignored .env.local (KEY=value lines); the real environment wins. */
export function loadEnvLocal(file = path.join(ROOT, '.env.local')) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z_]+)\s*=\s*['"]?(.*?)['"]?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

if (isMain(import.meta.url))
  try {
    loadEnvLocal();
    const a = parseArgs(undefined, ['dry-run', 'adopt-legacy']),
      slug = a.post || a._[0];
    if (a['adopt-legacy']) {
      const r = await exportPost(slug, {adoptLegacy: true, dryRun: !!a['dry-run'], forceBlocks: a['force-blocks'] ? String(a['force-blocks']).split(',') : []});
      console.log(
        a['dry-run']
          ? JSON.stringify(r, null, 2)
          : `✓ Notion page ${r.action}: ${r.url}\n  ${r.uploadedAssetHashes.length} assets verified by SHA-256, receipt in workflow.json (${r.exportedAtWIB})`
      );
    } else if (a['dry-run']) {
      const m = manifest(slug),
        {paths} = loadPost(slug),
        out = path.join(paths.out, 'notion-manifest.json');
      writeJSON(out, m);
      console.log(`✓ ${rel(out)} — ${m.assets.length} assets, title "${m.properties.Post}" (dry run, no network)`);
    } else {
      const n = await exportPost(slug);
      console.log(
        `✓ Notion page ${n.action}: ${n.url}\n  ${n.uploadedAssetHashes.length} assets verified by SHA-256, receipt in workflow.json (${n.exportedAtWIB})`
      );
    }
  } catch (e) {
    fail(e);
  }
