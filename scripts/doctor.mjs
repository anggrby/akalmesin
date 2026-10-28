// npm run doctor — checks this machine can run the workflow. Prints no secrets.
import fs from 'node:fs';
import path from 'node:path';
import {ROOT, readJSON, launchBrowser, loadPost, copyRevision, designRevision} from './core.mjs';

const rows = []; const ok = (name, pass, info = '') => rows.push({name, pass, info});
const major = Number(process.versions.node.split('.')[0]);
ok('Node >= 20', major >= 20, process.version);
for (const dep of ['playwright-core', 'sharp']) { try { await import(dep); ok(dep, true, readJSON(path.join(ROOT, 'node_modules', dep, 'package.json')).version); } catch (e) { ok(dep, false, 'run npm ci'); } }
try { const b = await launchBrowser(); ok('Chromium', true, b.version()); await b.close(); } catch (e) { ok('Chromium', false, e.message.split('\n')[0]); }
for (const f of ['brand/tokens.json', 'brand/editorial-policy.json', 'brand/fonts/Manrope.ttf', 'brand/fonts/IBMPlexMono-Regular.ttf', 'templates/html/post.css', ...readJSON(path.join(ROOT, 'brand/tokens.json')).source.sheets]) ok(f, fs.existsSync(path.join(ROOT, f)));
ok('NOTION_UPLOAD_TOKEN set (needed for npm run export)', true, process.env.NOTION_UPLOAD_TOKEN ? 'set' : 'not set');
const posts = path.join(ROOT, 'content/posts');
for (const slug of fs.existsSync(posts) ? fs.readdirSync(posts).filter(d => fs.existsSync(path.join(posts, d, 'post.json'))) : []) {
  try {
    const {paths, post, workflow} = loadPost(slug), a = workflow.approvals;
    const copy = a.copy ? (a.copy.revision === copyRevision(post) ? 'current' : 'STALE') : '—';
    const fin = a.final ? (a.final.revision === designRevision(post, paths.dir) ? 'current' : 'STALE') : '—';
    ok('post ' + slug, true, `stage ${workflow.stage} · copy ${copy} · final ${fin} · notion ${workflow.notion ? 'recorded' : '—'}`);
  } catch (e) { ok('post ' + slug, false, e.message); }
}
for (const r of rows) console.log(`${r.pass ? '✓' : '✗'} ${r.name}${r.info ? ' — ' + r.info : ''}`);
if (rows.some(r => !r.pass)) process.exitCode = 1;
