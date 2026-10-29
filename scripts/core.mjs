// Shared helpers for the akalmesin scripts. No dependencies beyond Node >= 20.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath, pathToFileURL} from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const GATES = ['selected', 'copy', 'final'];
/** Masthead categories (owner t94u). Always uppercase; TEKNOLOGI is the general-tech fallback. */
export const TOPICS = ['AI', 'KOMPUTER', 'SAINS', 'PROGRAMMING', 'TUTORIAL AI', 'TEKNOLOGI', 'ROBOTIKA'];
/** Throws a clear error unless category is exactly one of TOPICS. */
export function checkCategory(category) {
  if (!TOPICS.includes(category))
    throw Error(`category "${category}" is not allowed; use exactly one of: ${TOPICS.join(', ')} (uppercase; TEKNOLOGI for general tech)`);
  return category;
}

export const isMain = url => process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === url;
export const readJSON = file => JSON.parse(fs.readFileSync(file, 'utf8'));
export function writeFile(file, data) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  const tmp = file + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}
export const writeJSON = (file, value) => writeFile(file, JSON.stringify(value, null, 2) + '\n');
export const canonical = value =>
  JSON.stringify(value, (_, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map(k => [k, v[k]])
        )
      : v
  );
export const sha256 = value =>
  createHash('sha256')
    .update(typeof value === 'string' || Buffer.isBuffer(value) ? value : canonical(value))
    .digest('hex');
export const fileHash = file => sha256(fs.readFileSync(file));

/** Timestamp in the owner's zone, e.g. "2026-10-28 11:26 WIB". */
export function wib(date = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    })
      .formatToParts(new Date(date))
      .map(x => [x.type, x.value])
  );
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute} WIB`;
}

/** Tiny argv parser: positional args in _, --flag (boolean) or --key value. */
export function parseArgs(argv = process.argv.slice(2), booleans = []) {
  const out = {_: []};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) {
      out._.push(a);
      continue;
    }
    const key = a.slice(2);
    if (booleans.includes(key)) {
      out[key] = true;
      continue;
    }
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
  return {
    dir,
    post: path.join(dir, 'post.json'),
    workflow: path.join(dir, 'workflow.json'),
    log: path.join(dir, 'edits.log.md'),
    out: path.join(dir, 'out'),
    assets: path.join(dir, 'assets')
  };
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
export const newWorkflow = slug => ({
  schemaVersion: 1,
  slug,
  stage: 'research',
  approvals: {selected: null, copy: null, final: null},
  designStale: false,
  notion: null,
  legacyRevisions: {},
  history: []
});

// ---- copy model ----------------------------------------------------------
export const isDetail = s => ['detail1', 'detail2'].includes(s.layout);

/** Fields the owner can edit in the HTML editor, keyed like owner-edits-v1.json. */
export function editableFields(slide) {
  if (slide.layout === 'quote') return {quote: slide.quote, author: slide.author, role: slide.role};
  if (slide.layout === 'main') return {headline: slide.headline.join('\n'), summary: slide.summary, credit: slide.credit};
  return {...Object.fromEntries((slide.paragraphs || []).map((p, i) => ['paragraph-' + i, p])), credit: slide.credit};
}

// Photo credits are chosen after copy approval (decision 2026-10-28, t65u), so they are not copy:
// slide `credit`, the "/ Foto: …" half of the caption footer and "Ilustrasi slide N: AI / akalmesin"
// lines are kept out of copyRevision and covered by creditsRevision + final approval (designRevision
// hashes the whole post). Only lines that match these patterns exactly are split; anything else stays copy.
export const FOOTER_LINE = /^(\s*Sumber\s*:\s*.+?)\s*\/\s*Foto\s*:\s*(.+?)\s*$/i;
export const ILLUSTRATION_LINE = /^\s*Ilustrasi\s+slide\s+\d+\s*:\s*AI\s*\/\s*akalmesin\s*$/i;
export const COPY_RULE = 2;

/** Caption with the credit fragments removed, plus the removed fragments (in order). */
export function splitCaptionCredits(caption = []) {
  const fragments = [];
  const text = caption.map(para =>
    String(para)
      .split('\n')
      .flatMap(line => {
        if (ILLUSTRATION_LINE.test(line)) {
          fragments.push(line.trim());
          return [];
        }
        const m = FOOTER_LINE.exec(line);
        if (m) {
          fragments.push('Foto: ' + m[2]);
          return [m[1].trimEnd()];
        }
        return [line];
      })
      .join('\n')
  );
  return {text, fragments};
}

/** Hash of what the owner reviews as copy: title, category, caption without credit fragments, slide text without credits. */
export const copyRevision = post =>
  sha256({
    rule: COPY_RULE,
    title: post.title,
    category: post.category,
    caption: splitCaptionCredits(post.caption).text,
    slides: post.slides.map(s => {
      const {credit, ...fields} = editableFields(s);
      return {id: s.id, layout: s.layout, fields};
    })
  });
/** Pre-t65u rule (credits + full caption). Only used to honour approvals recorded under it while the content is unchanged. */
export const legacyCopyRevision = post =>
  sha256({
    title: post.title,
    category: post.category,
    caption: post.caption,
    slides: post.slides.map(s => ({id: s.id, layout: s.layout, fields: editableFields(s)}))
  });
/** Hash of the photo credits and the caption credit fragments (recorded in build.json; final approval covers them). */
export const creditsRevision = post =>
  sha256({slides: post.slides.map(s => ({id: s.id, credit: s.credit ?? null})), fragments: splitCaptionCredits(post.caption).fragments});

/** True when the copy approval matches the current copy. Approvals recorded before COPY_RULE (no copyRule) count only
 * if the post is byte-for-byte unchanged under the old rule (so nothing becomes valid that the owner didn't see). */
export function copyApprovalCurrent(approval, post) {
  if (!approval?.revision) return false;
  if (approval.revision === copyRevision(post)) return true;
  return approval.copyRule !== COPY_RULE && approval.revision === legacyCopyRevision(post);
}
export function requireCopyApproval(workflow, post) {
  const a = workflow.approvals?.copy;
  if (a && !copyApprovalCurrent(a, post))
    throw Error(
      `Gate "copy" approval is stale: it approved revision ${a.revision.slice(0, 12)}, current is ${copyRevision(post).slice(0, 12)}. Get a new approval.`
    );
  return requireApproval(workflow, 'copy');
}

export const processedImage = (dir, slide) => path.join(dir, 'assets/processed', slide.id + '-blue-ink.png');
// Design rule 2 (t67u–t69u): alt text is not approved, so it is left out of the design revision (it still goes to Notion).
export const DESIGN_RULE = 2;
export const LOGO_FILE = 'brand/logos/logo-wordmark.png';
const designInputs = (post, dir, root) => ({
  images: post.slides.map(s => {
    const f = processedImage(dir, s);
    return fs.existsSync(f) ? fileHash(f) : null;
  }),
  design: ['brand/tokens.json', 'templates/html/post.css', LOGO_FILE].map(f => fileHash(path.join(root, f)))
});
/** Hash of the post (minus alt text) plus the processed images, tokens and slide CSS: what "final" approves. */
export function designRevision(post, dir, root = ROOT) {
  const {images, design} = designInputs(post, dir, root);
  return sha256({rule: DESIGN_RULE, post: {...post, slides: post.slides.map(({alt, ...s}) => s)}, images, design});
}
/** Pre-rule-2 hash (whole post incl. alt). Only used to honour final approvals and builds recorded under it. */
export function legacyDesignRevision(post, dir, root = ROOT) {
  const {images, design} = designInputs(post, dir, root);
  return sha256({post, images, design});
}
/** Final approval matches the current design. Approvals without designRule count only while the legacy hash still matches. */
export function finalApprovalCurrent(approval, post, dir, root = ROOT) {
  if (!approval?.revision) return false;
  if (approval.revision === designRevision(post, dir, root)) return true;
  return approval.designRule !== DESIGN_RULE && approval.revision === legacyDesignRevision(post, dir, root);
}
export function requireFinalApproval(workflow, post, dir) {
  const a = requireApproval(workflow, 'final');
  if (!finalApprovalCurrent(a, post, dir))
    throw Error(
      `Gate "final" approval is stale: it approved revision ${a.revision.slice(0, 12)}, current is ${designRevision(post, dir).slice(0, 12)}. Get a new approval.`
    );
  return a;
}
/** A build.json is current if it was made for this design under either rule. */
export const buildCurrent = (build, post, dir) =>
  build?.designRevision === designRevision(post, dir) || build?.designRevision === legacyDesignRevision(post, dir);

export function captionText(post) {
  return post.caption.join('\n\n');
}
/** Caption body paragraphs: footer/disclosure/hashtag lines removed. */
export function captionBody(paragraphs) {
  const body = [];
  for (const para of paragraphs)
    for (const block of String(para).split(/\n\s*\n/)) {
      const text = block
        .split(/\r?\n/)
        .filter(l => !/^\s*(?:Sumber\s*:|Ilustrasi\s+slide\s+\d+\s*:|#)/i.test(l))
        .join('\n')
        .trim();
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
  if (revision && a.revision !== revision)
    throw Error(`Gate "${gate}" approval is stale: it approved revision ${a.revision.slice(0, 12)}, current is ${revision.slice(0, 12)}. Get a new approval.`);
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
  return String(text)
    .replace(/\r\n/g, '\n')
    .split(/\n+/)
    .flatMap(line => line.split(/(?<=[.!?…](?:\*\*)?["”’)]?)\s+/))
    .map(s => s.trim())
    .filter(Boolean);
}
function lcs(a, b, eq = (x, y) => x === y) {
  const n = a.length,
    m = b.length,
    t = Array.from({length: n + 1}, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) t[i][j] = eq(a[i], b[j]) ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
  const ops = [];
  let i = 0,
    j = 0;
  while (i < n && j < m) {
    if (eq(a[i], b[j])) {
      ops.push({op: '=', a: a[i++], b: b[j++]});
    } else if (t[i + 1][j] >= t[i][j + 1]) ops.push({op: '-', a: a[i++]});
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
  const runs = [];
  let cur = null;
  for (const o of ops) {
    if (o.op === '=') {
      if (cur) runs.push(cur);
      cur = null;
      continue;
    }
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
  const out = [];
  let dels = [],
    adds = [];
  const flush = () => {
    const k = Math.min(dels.length, adds.length);
    for (let i = 0; i < k; i++) out.push({type: 'changed', before: dels[i], after: adds[i], words: wordDiff(dels[i], adds[i])});
    for (const d of dels.slice(k)) out.push({type: 'removed', before: d});
    for (const a of adds.slice(k)) out.push({type: 'added', after: a});
    dels = [];
    adds = [];
  };
  for (const o of ops) {
    if (o.op === '=') flush();
    else if (o.op === '-') dels.push(o.a);
    else adds.push(o.b);
  }
  flush();
  return out;
}
export function formatDiff(items) {
  const q = s => '"' + s + '"';
  return items
    .map(d => {
      if (d.type === 'removed') return `- ${d.before}`;
      if (d.type === 'added') return `+ ${d.after}`;
      const words = d.words.map(w => [w.removed && '−' + q(w.removed), w.added && '+' + q(w.added)].filter(Boolean).join(' ')).join(' · ');
      return `- ${d.before}\n+ ${d.after}\n  words: ${words}`;
    })
    .join('\n');
}

// ---- rendering assets ----------------------------------------------------
/** Flat map of CSS custom properties, generated from brand/tokens.json (the only token source). */
export function tokenVars(root = ROOT) {
  const T = readJSON(path.join(root, 'brand/tokens.json')),
    U = T.unmeasured,
    px = v => v + 'px';
  const rgba = s => {
    const [r, g, b] = [1, 3, 5].map(i => parseInt(s.color.slice(i, i + 2), 16));
    return `rgb(${r} ${g} ${b} / ${s.alpha}) ${s.position * 100}%`;
  };
  const v = {
    'color-ink': T.color.ink.value,
    'color-editorial-gray': T.color['editorial-gray'].value,
    'color-reversed-text': T.color['reversed-text'].value,
    'bold-gradient': T.color['bold-gradient'].value,
    'color-page-bg': T.color['page-bg'].value,
    'color-text-primary': T.color['text-primary'].value,
    'color-text-secondary': T.color['text-secondary'].value,
    'photo-hairline-color': T.color['photo-hairline'].value,
    'photo-hairline-width': px(T.color['photo-hairline'].width),
    'logo-width': px(T.logo.width),
    'logo-height': px(T.logo.height),
    'overlay-quote': `linear-gradient(${T.overlay.quote.direction}, ${T.overlay.quote.stops.map(rgba).join(', ')})`,
    'overlay-quote-opacity': T.overlay.quote.opacity,
    'canvas-width': px(T.canvas.width),
    'canvas-height': px(T.canvas.height),
    'radius-editorial': px(T.radius.editorial),
    'divider-width': px(T.stroke.divider.width),
    'divider-color': T.stroke.divider.color
  };
  for (const [role, t] of Object.entries(T.type)) {
    const lh = t.lineHeight === 'auto' ? (role === 'wordmark' ? U.wordmarkRowHeight.value : U.metadataLineHeight.value) : t.lineHeight;
    Object.assign(v, {
      [`type-${role}-family`]: `'${t.family}'`,
      [`type-${role}-weight`]: t.weight,
      [`type-${role}-size`]: px(t.size),
      [`type-${role}-line-height`]: px(lh),
      [`type-${role}-tracking`]: t.tracking + 'em'
    });
  }
  const M = T.layout.main,
    D = T.layout.detail,
    Q = T.layout.quote,
    dw = T.stroke.divider.width;
  Object.assign(v, {
    'main-side': px(M.side),
    'main-header-top': px(M.headerTop),
    'main-row-to-divider': px(M.wordmarkRowToDivider),
    'main-divider-to-content': px(M.dividerToContent - dw),
    'main-content-width': px(M.contentWidth),
    'main-headline-max-width': px(M.headlineMaxWidth),
    'main-headline-to-summary': px(M.headlineToSummary),
    'main-summary-to-image': px(M.summaryToImage),
    'detail-side': px(D.side),
    'detail-header-top': px(D.headerTop),
    'detail-row-to-divider': px(D.wordmarkRowToDivider),
    'detail-divider-to-body': px(D.dividerToBody - dw),
    'detail-content-width': px(D.contentWidth),
    'detail-body-to-image': px(D.bodyToImage),
    'quote-mark-size': px(Q.mark.size),
    'quote-mark-weight': Q.mark.weight,
    'quote-mark-box': px(Q.mark.boxHeight),
    'quote-mark-offset': px(Q.mark.inkOffsetY),
    'quote-mark-color': T.color[Q.mark.color].value,
    'quote-side': px(Q.side),
    'quote-bottom': px(Q.bottom),
    'quote-stack-gap': px(Q.stackGap),
    'quote-author-to-role': px(Q.authorToRole),
    'credit-inset-x': px(U.creditInsetX),
    'credit-inset-bottom': px(U.creditInsetBottom),
    'credit-gradient-height': px(U.creditGradient.height),
    'credit-gradient-opacity': U.creditGradient.bottomOpacity,
    'category-align': U.categoryAlign,
    'detail-paragraph-gap': px(U.detailParagraphGap)
  });
  return v;
}
/** Image-to-copy gap per layout, from the tokens (used by the geometry check). */
export function imageGaps(root = ROOT) {
  const L = readJSON(path.join(root, 'brand/tokens.json')).layout;
  return {
    main: L.main.summaryToImage,
    detail1: L.detail.bodyToImage,
    detail2: L.detail.bodyToImage,
    quote: {
      side: L.quote.side,
      bottom: L.quote.bottom,
      lineHeight: readJSON(path.join(root, 'brand/tokens.json')).type.quote.lineHeight,
      maxLines: L.quote.statementMaxLines
    }
  };
}
export const slideTokensCSS = (root = ROOT) =>
  ':root{' +
  Object.entries(tokenVars(root))
    .map(([k, v]) => `--${k}:${v}`)
    .join(';') +
  '}';
/** Masthead logo as an embedded data URL, so rendered pages need no file access. */
export function logoCSS(root = ROOT) {
  const b64 = fs.readFileSync(path.join(root, LOGO_FILE)).toString('base64');
  return `.wordmark-logo{background:url(data:image/png;base64,${b64}) left center/contain no-repeat}`;
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

/** Append a dated section to edits.log.md. */
export function appendLog(file, heading, body) {
  const head = fs.existsSync(file) ? '' : '# Edit log\n\nEvery change to copy or design, newest last. Times are WIB.\n';
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.appendFileSync(file, head + `\n## ${heading}\n\n${body.trim()}\n`);
}
export const saveWorkflow = (paths, wf) => writeJSON(paths.workflow, wf);
export const rel = file => path.relative(ROOT, file).split(path.sep).join('/');

export function fail(error) {
  console.error('✗ ' + (error?.message || error));
  process.exitCode = 1;
}
