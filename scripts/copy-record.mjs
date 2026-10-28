// npm run copy:record -- <slug> <edits.json> [--who "owner"]
// Step 5: applies the editor's Simpan file to post.json and logs a sentence/word diff.
// Refuses edits made against an older revision. Clears copy/final approvals that no longer match.
import fs from 'node:fs';
import {
  loadPost,
  parseArgs,
  readJSON,
  writeJSON,
  saveWorkflow,
  appendLog,
  copyRevision,
  legacyCopyRevision,
  creditsRevision,
  editableFields,
  sentenceDiff,
  formatDiff,
  invalidate,
  wib,
  isMain,
  fail
} from './core.mjs';

export function applyEdits(post, edits) {
  const next = structuredClone(post),
    changes = [];
  const diff = (where, before, after) => {
    if (before !== after) changes.push({where, items: sentenceDiff(before, after), before, after});
  };
  for (const e of edits.slides || []) {
    if (e.slug && e.slug !== post.slug) continue;
    const slide = next.slides.find(s => s.id === e.slideId);
    if (!slide) throw Error('Unknown slide in edits: ' + e.slideId);
    const current = editableFields(slide);
    for (const [k, v] of Object.entries(e.fields)) {
      if (!(k in current)) throw Error(`Unknown field ${e.slideId}.${k}`);
      const value = String(v).replace(/\r\n/g, '\n');
      diff(`${e.slideId} · ${k}`, current[k], value);
      if (k === 'headline')
        slide.headline = value
          .split('\n')
          .map(l => l.trim())
          .filter(Boolean);
      else if (k === 'summary') slide.summary = value;
      else if (k === 'credit') slide.credit = value;
      else if (['quote', 'author', 'role'].includes(k)) slide[k] = value;
      else slide.paragraphs[Number(k.slice(10))] = value;
    }
    // The Notion "Post" title mirrors the Main headline (decision 2026-10-28).
    if (slide.layout === 'main' && e.fields.headline !== undefined) {
      const t = slide.headline.join(' ');
      if (t !== next.title) {
        diff('title', next.title, t);
        next.title = t;
      }
    }
  }
  const cap = (edits.captions || []).find(c => !c.slug || c.slug === post.slug);
  if (cap) {
    if (cap.paragraphs.length !== post.caption.length) throw Error(`Caption has ${cap.paragraphs.length} blocks; expected ${post.caption.length}`);
    cap.paragraphs.forEach((p, i) => diff(`caption ¶${i + 1}`, post.caption[i], p));
    next.caption = cap.paragraphs.map(String);
  }
  return {next, changes};
}

export function recordEdits(ref, editsFile, {who = 'owner', now = new Date()} = {}) {
  const {paths, post, workflow} = loadPost(ref);
  const edits = readJSON(editsFile);
  if (!['owner-edits', 'text-review-edits'].includes(edits.kind)) throw Error('Not an editor Simpan file: ' + editsFile);
  const base = edits.schemaVersion === 2 ? workflow.legacyRevisions[edits.sourceRevisions?.[post.slug]] : edits.baseRevision;
  const current = copyRevision(post);
  if (!base) throw Error('Edits carry no base revision this post knows about; regenerate the editor with npm run copy:review.');
  // Editors generated before the t65u hash rule carry the old-rule revision; accept it only if nothing changed since.
  if (base !== current && base !== legacyCopyRevision(post))
    throw Error(
      `Edits were made on revision ${base.slice(0, 12)}, but the copy is now ${current.slice(0, 12)}. Ask for a fresh review instead of overwriting newer text.`
    );
  const {next, changes} = applyEdits(post, edits);
  if (!changes.length) return {changes, revision: current};
  const revision = copyRevision(next),
    mode = edits.mode || 'copy';
  writeJSON(paths.post, next);
  // Credit-only edits leave the copy revision unchanged: copy approval stays, final (design) is reset.
  const copyChanged = revision !== current;
  invalidate(
    workflow,
    copyChanged ? ['copy', 'final'] : ['final'],
    copyChanged ? `copy edited (${who}) → ${revision.slice(0, 12)}` : `credits edited (${who}) → credits ${creditsRevision(next).slice(0, 12)}`,
    now
  );
  if (mode === 'design') workflow.designStale = true;
  workflow.stage = 'copy-review';
  workflow.history.push({event: 'copy-recorded', who, mode, from: current, to: revision, file: editsFile.split(/[\\/]/).pop(), at: now.toISOString()});
  saveWorkflow(paths, workflow);
  const body =
    `Who: ${who} · mode: ${mode} · file: \`${editsFile.split(/[\\/]/).pop()}\`${edits.savedAt ? ' · saved ' + wib(edits.savedAt) : ''}\nRevision ${current.slice(0, 12)} → ${revision.slice(0, 12)}\n\n` +
    changes.map(c => `### ${c.where}\n\n\`\`\`diff\n${formatDiff(c.items) || '(whitespace / line-break change)'}\n\`\`\``).join('\n\n');
  appendLog(paths.log, `${wib(now)} — ${who} edits (${mode})`, body);
  return {changes, revision, copyChanged};
}

if (isMain(import.meta.url))
  try {
    const a = parseArgs();
    const r = recordEdits(a._[0], a._[1], {who: a.who});
    console.log(
      r.changes.length
        ? `✓ ${r.changes.length} field(s) changed → ${r.revision.slice(0, 12)}; diff in edits.log.md. ${r.copyChanged ? 'Copy and final approvals cleared.' : 'Credits only: copy approval kept, final cleared.'}`
        : '✓ no changes'
    );
    for (const c of r.changes) console.log('  · ' + c.where);
  } catch (e) {
    fail(e);
  }
