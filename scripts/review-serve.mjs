// npm run review:serve -- <slug> [--port 8765] [--open]
// Serves out/<slug>.html on localhost and accepts POST /save so Simpan writes into edits/
// (static file:// pages still only download). Does not run review:apply — that stays a separate step.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {loadPost, parseArgs, writeJSON, rel, isMain, fail, wib} from './core.mjs';

const DEFAULT_PORT = 8765;
const BODY_LIMIT = 2_000_000;

/** Filename matching the editor's download naming. */
export function editsFilename(slug, savedAt) {
  return `${slug}-edits-${String(savedAt).slice(0, 19).replace(/[:T]/g, '')}.json`;
}

/** Validate and write an owner-edits payload into the post's edits/. Returns {file, filename, rel}. */
export function writeOwnerEdits(ref, edits, {now = new Date()} = {}) {
  const {paths, post} = loadPost(ref);
  if (!edits || typeof edits !== 'object' || Array.isArray(edits)) throw Error('body must be a JSON object');
  if (edits.kind !== 'owner-edits') throw Error('kind must be owner-edits');
  if (edits.slug !== post.slug) throw Error(`slug is ${edits.slug}, expected ${post.slug}`);
  const savedAt = edits.savedAt && !Number.isNaN(new Date(edits.savedAt).getTime()) ? edits.savedAt : now.toISOString();
  let filename = editsFilename(post.slug, savedAt);
  const dir = path.join(paths.dir, 'edits');
  fs.mkdirSync(dir, {recursive: true});
  let file = path.join(dir, filename);
  if (fs.existsSync(file)) {
    const stem = filename.replace(/\.json$/, '');
    let n = 2;
    while (fs.existsSync(path.join(dir, `${stem}-${n}.json`))) n++;
    filename = `${stem}-${n}.json`;
    file = path.join(dir, filename);
  }
  writeJSON(file, {...edits, savedAt});
  // Prefer edits/<file> in the UI; keep absolute path in `file` for apply.
  return {file, filename, rel: path.join('edits', filename)};
}

function injectSaveHook(html) {
  // Client source mentions the name; only skip if we already injected the assignment.
  if (html.includes("window.__AKALMESIN_SAVE_URL__='/save'")) return html;
  return html.replace(/<body([^>]*)>/i, `<body$1><script>window.__AKALMESIN_SAVE_URL__='/save';</script>`);
}

async function readBody(req, limit = BODY_LIMIT) {
  const chunks = [];
  let n = 0;
  for await (const c of req) {
    n += c.length;
    if (n > limit) {
      req.destroy();
      throw Error('body too large');
    }
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  const buf = typeof body === 'string' ? Buffer.from(body) : body;
  res.writeHead(status, {'Content-Type': type, 'Content-Length': buf.length, 'Cache-Control': 'no-store'});
  res.end(buf);
}

function sendJSON(res, status, value) {
  send(res, status, JSON.stringify(value) + '\n', 'application/json; charset=utf-8');
}

/** Start a localhost server for one post's review HTML. Port 0 picks an ephemeral port (tests). */
export async function startReviewServer(ref, {port = DEFAULT_PORT, host = '127.0.0.1'} = {}) {
  const {paths, post} = loadPost(ref);
  const htmlPath = path.join(paths.out, post.slug + '.html');
  if (!fs.existsSync(htmlPath)) throw Error(`No review HTML at ${rel(htmlPath)}. Run: npm run review:build -- ${post.slug}`);

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', `http://${host}`);
      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html' || url.pathname === '/review')) {
        const html = injectSaveHook(fs.readFileSync(htmlPath, 'utf8'));
        return send(res, 200, html, 'text/html; charset=utf-8');
      }
      if (req.method === 'POST' && url.pathname === '/save') {
        const raw = await readBody(req);
        let edits;
        try {
          edits = JSON.parse(raw.toString('utf8'));
        } catch {
          return sendJSON(res, 400, {ok: false, error: 'invalid JSON'});
        }
        try {
          const written = writeOwnerEdits(ref, edits);
          console.log(`✓ Simpan → ${written.rel} (${wib(edits.savedAt || new Date())})`);
          return sendJSON(res, 200, {ok: true, ...written});
        } catch (e) {
          return sendJSON(res, 400, {ok: false, error: e.message});
        }
      }
      if (req.method === 'GET' && url.pathname === '/health') return sendJSON(res, 200, {ok: true, slug: post.slug});
      send(res, 404, 'not found\n');
    } catch (e) {
      sendJSON(res, 500, {ok: false, error: e.message});
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  const addr = server.address();
  const bound = typeof addr === 'object' && addr ? addr.port : port;
  const url = `http://${host}:${bound}/`;
  return {
    url,
    port: bound,
    host,
    slug: post.slug,
    htmlPath,
    close: () => new Promise((resolve, reject) => server.close(err => (err ? reject(err) : resolve())))
  };
}

function openBrowser(url) {
  if (process.platform === 'darwin') spawn('open', [url], {stdio: 'ignore', detached: true}).unref();
  else if (process.platform === 'win32') spawn('cmd', ['/c', 'start', '', url], {stdio: 'ignore', detached: true}).unref();
  else spawn('xdg-open', [url], {stdio: 'ignore', detached: true}).unref();
}

if (isMain(import.meta.url))
  try {
    const a = parseArgs(undefined, ['open']);
    const slug = a._[0];
    if (!slug) throw Error('usage: review-serve.mjs <slug> [--port 8765] [--open]');
    const port = a.port !== undefined ? Number(a.port) : DEFAULT_PORT;
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw Error('--port must be an integer 0–65535');
    const srv = await startReviewServer(slug, {port});
    console.log(`✓ review server for ${srv.slug}`);
    console.log(`  open ${srv.url}`);
    console.log(`  Simpan writes into content/posts/${srv.slug}/edits/`);
    console.log(`  then: npm run review:apply -- ${srv.slug} content/posts/${srv.slug}/edits/<file>.json`);
    console.log('  Ctrl+C to stop');
    if (a.open) openBrowser(srv.url);
  } catch (e) {
    fail(e);
  }
