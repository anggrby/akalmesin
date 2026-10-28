// Shared helpers for the akalmesin scripts. No dependencies beyond Node >= 20.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath, pathToFileURL} from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const GATES = ['selected', 'copy', 'final'];
export const TOPICS = ['AI', 'Robotika', 'Komputasi', 'Chip', 'Software'];

export const isMain = url => process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === url;
export const readJSON = file => JSON.parse(fs.readFileSync(file, 'utf8'));
export function writeFile(file, data) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  const tmp = file + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, data); fs.renameSync(tmp, file);
}
export const writeJSON = (file, value) => writeFile(file, JSON.stringify(value, null, 2) + '\n');
export const canonical = value => JSON.stringify(value, (_, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
export const sha256 = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : canonical(value)).digest('hex');
export const fileHash = file => sha256(fs.readFileSync(file));

/** Timestamp in the owner's zone, e.g. "2026-10-28 11:26 WIB". */
export function wib(date = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}).formatToParts(new Date(date)).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute} WIB`;
}

/** Tiny argv parser: positional args in _, --flag (boolean) or --key value. */
export function parseArgs(argv = process.argv.slice(2), booleans = []) {
  const out = {_: []};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const key = a.slice(2);
    if (booleans.includes(key)) { out[key] = true; continue; }
    if (argv[i + 1] === undefined) throw Error('Missing value for --' + key);
    out[key] = argv[++i];
  }
  return out;
}

/** Resolve a post by slug or by folder path. */
export function postPaths(ref, root = ROOT) {
  if (!ref) throw Error('Pass the post slug, e.g. 2026-10-28-kimi-k3-1-pro');
  const dir = fs.existsSync(path.resolve(ref, 'post.json')) ? path.resolve(ref) : path.join(root, 'content/posts', path.basename(ref));
  if (!fs.existsSync(path.join(dir, 'post.json'))) throw Error('No post.json in ' + dir);
  return {dir, post: path.join(dir, 'post.json'), workflow: path.join(dir, 'workflow.json'), log: path.join(dir, 'edits.log.md'), out: path.join(dir, 'out'), assets: path.join(dir, 'assets')};
}

export function loadPost(ref, root = ROOT) {
  const p = postPaths(ref, root);
  return {paths: p, post: readJSON(p.post), workflow: readWorkflow(p.workflow, readJSON(p.post).slug)};
}

export function readWorkflow(file, slug) {
  if (!fs.existsSync(file)) return newWorkflow(slug);
  const wf = readJSON(file);
  if (wf.schemaVersion !== 1 || wf.slug !== slug) throw Error('workflow.json does not belong to ' + slug);
  return wf;
}
export const newWorkflow = slug => ({schemaVersion: 1, slug, stage: 'research', approvals: {selected: null, copy: null, final: null}, designStale: false, notion: null, legacyRevisions: {}, history: []});

// ---- copy model ----------------------------------------------------------
export const isDetail = s => ['detail1', 'detail2'].includes(s.layout);

/** Fields the owner can edit in the HTML editor, keyed like owner-edits-v1.json. */
export function editableFields(slide) {
  if (slide.layout === 'main') return {headline: slide.headline.join('\n'), summary: slide.summary, credit: slide.credit};
  return {...Object.fromEntries((slide.paragraphs || []).map((p, i) => ['paragraph-' + i, p])), credit: slide.credit};
}

/** Hash of everything the owner reviews as copy (text + credits + caption). */
export const copyRevision = post => sha256({title: post.title, category: post.category, caption: post.caption, slides: post.slides.map(s => ({id: s.id, layout: s.layout, fields: editableFields(s)}))});

/** Hash of the whole post plus the processed images: what "final" approves. */
export function designRevision(post, dir) {
  const images = post.slides.map(s => { const f = path.join(dir, s.image || ''); return fs.existsSync(f) && s.image ? fileHash(f) : null; });
  return sha256({post, images});
}

export function captionText(post) { return post.caption.join('\n\n'); }
/** Caption body paragraphs: footer/disclosure/hashtag lines removed. */
export function captionBody(paragraphs) {
  const body = [];
  for (const para of paragraphs) for (const block of String(para).split(/\n\s*\n/)) {
    const text = block.split(/\r?\n/).filter(l => !/^\s*(?:Sumber\s*:|Ilustrasi\s+slide\s+\d+\s*:|#)/i.test(l)).join('\n').trim();
    if (text) body.push(text);
  }
  return body;
}
export const countWords = text => (String(text).match(/[\p{L}\p{N}]+(?:[.,'’\-][\p{L}\p{N}]+)*/gu) || []).length;

// ---- gates ---------------------------------------------------------------
/** Throws unless `gate` is approved for the current revision. */
export function requireApproval(workflow, gate, revision) {
  const a = workflow.approvals?.[gate];
  if (!a) throw Error(`Gate "${gate}" is not approved. Record the owner's words with: npm run approve -- <slug> --gate ${gate} --words "..."`);
  if (revision && a.revision !== revision) throw Error(`Gate "${gate}" approval is stale: it approved revision ${a.revision.slice(0, 12)}, current is ${revision.slice(0, 12)}. Get a new approval.`);
  return a;
}

/** Move live approvals for `gates` into history (they stay on record but stop counting). */
export function invalidate(workflow, gates, reason, at = new Date()) {
  for (const g of gates) {
    const a = workflow.approvals[g];
    if (!a) continue;
    workflow.history.push({event: 'approval-invalidated', gate: g, reason, at: new Date(at).toISOString(), approval: a});
    workflow.approvals[g] = null;
  }
}

// ---- sentence / word diff ------------------------------------------------
/** Split Indonesian prose into sentences. "Kimi.ai", "K3.1" and "65,7%" stay intact
 * because a sentence break needs end punctuation followed by whitespace. */
export function splitSentences(text) {
  return String(text).replace(/\r\n/g, '\n').split(/\n+/).flatMap(line => line.split(/(?<=[.!?…](?:\*\*)?["”’)]?)\s+/)).map(s => s.trim()).filter(Boolean);
}
function lcs(a, b, eq = (x, y) => x === y) {
  const n = a.length, m = b.length, t = Array.from({length: n + 1}, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) t[i][j] = eq(a[i], b[j]) ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
  const ops = []; let i = 0, j = 0;
  while (i < n && j < m) {
    if (eq(a[i], b[j])) { ops.push({op: '=', a: a[i++], b: b[j++]}); }
    else if (t[i + 1][j] >= t[i][j + 1]) ops.push({op: '-', a: a[i++]});
    else ops.push({op: '+', b: b[j++]});
  }
  while (i < n) ops.push({op: '-', a: a[i++]});
  while (j < m) ops.push({op: '+', b: b[j++]});
  return ops;
}
/** Word-level changes inside one sentence: [{removed, added}] runs. */
export function wordDiff(before, after) {
  const tok = s => String(s).split(/\s+/).filter(Boolean);
  const ops = lcs(tok(before), tok(after));
  const runs = []; let cur = null;
  for (const o of ops) {
    if (o.op === '=') { if (cur) runs.push(cur); cur = null; continue; }
    cur ??= {removed: [], added: []};
    (o.op === '-' ? cur.removed : cur.added).push(o.op === '-' ? o.a : o.b);
  }
  if (cur) runs.push(cur);
  return runs.map(r => ({removed: r.removed.join(' '), added: r.added.join(' ')}));
}
/** Sentence-level diff: only changed sentences are returned.
 * Each item: {type: 'changed'|'added'|'removed', before?, after?, words?} */
export function sentenceDiff(before, after) {
  const ops = lcs(splitSentences(before), splitSentences(after));
  const out = []; let dels = [], adds = [];
  const flush = () => {
    const k = Math.min(dels.length, adds.length);
    for (let i = 0; i < k; i++) out.push({type: 'changed', before: dels[i], after: adds[i], words: wordDiff(dels[i], adds[i])});
    for (const d of dels.slice(k)) out.push({type: 'removed', before: d});
    for (const a of adds.slice(k)) out.push({type: 'added', after: a});
    dels = []; adds = [];
  };
  for (const o of ops) { if (o.op === '=') flush(); else if (o.op === '-') dels.push(o.a); else adds.push(o.b); }
  flush();
  return out;
}
export function formatDiff(items) {
  const q = s => '"' + s + '"';
  return items.map(d => {
    if (d.type === 'removed') return `- ${d.before}`;
    if (d.type === 'added') return `+ ${d.after}`;
    const words = d.words.map(w => [w.removed && '−' + q(w.removed), w.added && '+' + q(w.added)].filter(Boolean).join(' ')).join(' · ');
    return `- ${d.before}\n+ ${d.after}\n  words: ${words}`;
  }).join('\n');
}

// ---- rendering assets ----------------------------------------------------
export function slideTokensCSS(root = ROOT) {
  const brand = readJSON(path.join(root, 'brand/tokens.json'));
  const layout = readJSON(path.join(root, 'templates/html/layout-tokens.json'));
  const t = {
    'akalmesin-ink': brand.colors.ink, 'akalmesin-paper': brand.colors.paper, 'akalmesin-accent': brand.colors.accent,
    'photo-credit-color': brand.colors.photoCredit, 'photo-credit-align': brand.photo.credit.align, 'quote-text-color': brand.colors.quoteText,
    'post-width': brand.canvas.width + 'px', 'post-height': brand.canvas.height + 'px',
    'text-margin': brand.spacing.textMarginPx + 'px', 'text-to-photo-gap': brand.spacing.textToPhotoGapPx + 'px'
  };
  for (const [k, v] of Object.entries(layout.values)) {
    const name = k.replace(/Em$/, '').replace(/[A-Z]/g, c => '-' + c.toLowerCase());
    t[name] = typeof v === 'string' ? v : v + (k.endsWith('Em') ? 'em' : k.endsWith('Opacity') ? '' : 'px');
  }
  return ':root{' + Object.entries(t).map(([k, v]) => `--${k}:${v}`).join(';') + '}';
}
export function fontCSS(root = ROOT) {
  const b64 = f => fs.readFileSync(path.join(root, 'brand/fonts', f)).toString('base64');
  return `@font-face{font-family:'Manrope';src:url(data:font/ttf;base64,${b64('Manrope.ttf')}) format('truetype');font-weight:200 800;font-display:block}@font-face{font-family:'IBM Plex Mono';src:url(data:font/ttf;base64,${b64('IBMPlexMono-Regular.ttf')}) format('truetype');font-weight:400;font-display:block}`;
}

/** Launch Chromium via playwright-core. AKALMESIN_CHROME_PATH overrides. */
export async function launchBrowser() {
  const {chromium} = await import('playwright-core');
  const executablePath = process.env.AKALMESIN_CHROME_PATH || chromium.executablePath();
  if (!fs.existsSync(executablePath)) throw Error('Chromium not found. Run: npx playwright-core install chromium (or set AKALMESIN_CHROME_PATH).');
  return chromium.launch({headless: true, executablePath});
}

export function fail(error) { console.error('✗ ' + (error?.message || error)); process.exitCode = 1; }
