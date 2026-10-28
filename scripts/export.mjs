// npm run export -- <slug> --dry-run            → out/notion-manifest.json (no network)
// npm run export -- <slug> --attach --page <id> → uploads the PNGs, in order, to the page's Assets
//                                                (needs NOTION_UPLOAD_TOKEN in the environment)
// npm run export -- <slug> --record --page <id> --url <notion url> [--at ISO] [--uploaded-hashes h1,h2,…]
// Step 8. Requires a current final approval. Page creation/update itself goes through the
// Notion connector (see docs/workflow.md). This never publishes or schedules anything.
import fs from 'node:fs';
import path from 'node:path';
import {ROOT, TOPICS, loadPost, parseArgs, readJSON, writeJSON, saveWorkflow, copyRevision, designRevision, requireApproval, fileHash, wib, isMain, fail, rel} from './core.mjs';

export const NOTION = {dataSourceId: '405f909f-26a5-8029-8e7a-000b3f2a28a4', databaseId: '405f909f-26a5-8057-ad0a-e9562fe9c915', accountPageId: '403f909f-26a5-80a6-bb5f-ff38accdc8d0', version: '2022-06-28'};
const PAGE_ID = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;

export function manifest(ref) {
  const {paths, post, workflow} = loadPost(ref);
  requireApproval(workflow, 'copy', copyRevision(post));
  const final = requireApproval(workflow, 'final', designRevision(post, paths.dir));
  const build = readJSON(path.join(paths.out, 'build.json'));
  const assets = build.slides.map(s => {
    const file = path.join(ROOT, s.png), bytes = fs.statSync(file).size;
    if (fileHash(file) !== s.pngHash) throw Error(s.png + ' changed after the approved build');
    if (bytes > 20 * 1024 * 1024) throw Error(s.png + ' exceeds Notion 20 MB upload limit');
    return {slideId: s.id, file: s.png, sha256: s.pngHash, bytes};
  });
  if (!TOPICS.includes(post.category)) throw Error('category must be one of ' + TOPICS.join(', '));
  const marker = 'akalmesin-content-id:akalmesin:' + post.slug;
  const body = ['# Approved copy', ...post.slides.map(s => `## ${s.id}\n\n` + (s.layout === 'main' ? `${s.headline.join(' ')}\n\n${s.summary}` : s.paragraphs.join('\n\n'))),
    '# Caption', post.caption.join('\n\n'), '# Sources', post.sources.map(s => `- [${s.title}](${s.url})`).join('\n'),
    '# Alt text and photo credits', post.slides.map(s => `${s.id}: ${s.alt}\n\n${s.credit}`).join('\n\n'),
    '# Approval', `"${final.words}" — ${final.source}, ${final.atWIB}`, `Approved design revision: ${final.revision}`,
    '# Source ledger', fs.readFileSync(path.join(paths.dir, 'sources.md'), 'utf8').trim(),
    '# Export metadata', [marker, 'Account: akalmesin', 'Editorial depth: ' + post.format, 'Slide count: ' + post.slides.length].join('\n\n')].join('\n\n');
  return {
    schemaVersion: 1, slug: post.slug, destination: NOTION, approvedRevision: final.revision, approval: final,
    existingPageId: workflow.notion?.pageId || null,
    lookup: `Before creating, query data source ${NOTION.dataSourceId} and read page bodies for the exact marker "${marker}". Never match by title alone.`,
    properties: {Post: post.title, Status: 'Ready to Publish', Format: post.slides.length === 1 ? 'Single image' : 'Carousel', Caption: post.caption.join('\n\n'), Topic: post.category, 'Publish date': null, Assets: assets.map(a => path.basename(a.file))},
    bodyMarker: marker, body, assets, generatedAt: new Date().toISOString()
  };
}

async function notion(method, url, token, body, isForm) {
  const r = await fetch('https://api.notion.com/v1/' + url, {method, headers: {Authorization: 'Bearer ' + token, 'Notion-Version': NOTION.version, ...(body && !isForm ? {'Content-Type': 'application/json'} : {})}, body: isForm ? body : body && JSON.stringify(body)});
  if (!r.ok) throw Error(`Notion ${method} ${url.split('/')[0]} → HTTP ${r.status}`);
  return r.json();
}

/** Port of notion_attach_assets.py: create upload → send → PATCH Assets → read back. */
export async function attach(m, pageId, token = process.env.NOTION_UPLOAD_TOKEN) {
  if (!token) throw Error('Set NOTION_UPLOAD_TOKEN in the environment (never paste it into chat or files).');
  if (!PAGE_ID.test(pageId || '')) throw Error('--page must be a Notion page id');
  const files = [];
  for (const a of m.assets) {
    const name = path.basename(a.file);
    const up = await notion('POST', 'file_uploads', token, {filename: name, content_type: 'image/png'});
    const form = new FormData(); form.append('file', new Blob([fs.readFileSync(path.join(ROOT, a.file))], {type: 'image/png'}), name);
    await notion('POST', `file_uploads/${up.id}/send`, token, form, true);
    files.push({name, type: 'file_upload', file_upload: {id: up.id}});
  }
  await notion('PATCH', 'pages/' + pageId, token, {properties: {Assets: {files}}});
  const page = await notion('GET', 'pages/' + pageId, token);
  const names = page.properties.Assets.files.map(f => f.name);
  if (names.join('|') !== files.map(f => f.name).join('|')) throw Error('Assets read-back order mismatch: ' + names.join(', '));
  return names;
}

export function record(ref, {page, url, at, 'uploaded-hashes': uploaded}) {
  const {paths, post, workflow} = loadPost(ref);
  if (!PAGE_ID.test(page || '')) throw Error('--page must be a Notion page id');
  if (!/^https:\/\/(?:www\.|app\.)?notion\.(?:so|com)\//.test(url || '')) throw Error('--url must be the Notion page URL');
  const m = manifest(ref);
  workflow.notion = {pageId: page, url, dataSourceId: NOTION.dataSourceId, accountPageId: NOTION.accountPageId, bodyMarker: m.bodyMarker, approvedRevision: m.approvedRevision, orderedAssetHashes: m.assets.map(a => a.sha256), ...(uploaded ? {uploadedAssetHashes: uploaded.split(','), assetsMatchBuild: uploaded === m.assets.map(a => a.sha256).join(',')} : {assetsMatchBuild: true}), exportedAt: at ? new Date(at).toISOString() : new Date().toISOString(), recordedAt: new Date().toISOString()};
  workflow.stage = 'notion-delivered';
  workflow.history.push({event: 'notion-recorded', pageId: page, at: workflow.notion.recordedAt});
  saveWorkflow(paths, workflow);
  return workflow.notion;
}

if (isMain(import.meta.url)) try {
  const a = parseArgs(undefined, ['dry-run', 'attach', 'record']), slug = a._[0];
  if (a.record) { const n = record(slug, a); console.log(`✓ Notion receipt recorded: ${n.url} (${wib(n.exportedAt)})`); }
  else {
    const m = manifest(slug), {paths} = loadPost(slug), out = path.join(paths.out, 'notion-manifest.json');
    writeJSON(out, m); console.log(`✓ ${rel(out)} — ${m.assets.length} assets, title "${m.properties.Post}"`);
    if (a.attach) console.log('✓ Assets attached in order: ' + (await attach(m, a.page)).join(', '));
    else if (!a['dry-run']) console.log('  (manifest only; create/update the page with the Notion connector, then --attach and --record)');
  }
} catch (e) { fail(e); }
