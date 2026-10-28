// Single-pass review (owner decision t67u–t69u).
// npm run review:build -- <slug> [--copy-to file.html]
//   Render the real slides (design:build without the copy gate), run design:check, write out/<slug>.html:
//   the review editor (real slides, text editable in place, photo list, live overflow/caption/credit checks).
//   Records no approval.
// npm run review:apply -- <slug> <edits.json>
//   Apply the owner's Simpan file (only changed sentences are logged to edits.log.md), re-render, design:check
//   + quality checks. All pass → the Simpan itself is the owner's single approval (copy + final). A file with no
//   changes is a pure approval. Any failure → no approval, problems printed.
import fs from 'node:fs';
import path from 'node:path';
import {
  loadPost,
  parseArgs,
  readJSON,
  saveWorkflow,
  appendLog,
  copyRevision,
  designRevision,
  fileHash,
  COPY_RULE,
  DESIGN_RULE,
  wib,
  isMain,
  fail,
  rel
} from './core.mjs';
import {recordEdits} from './copy-record.mjs';
import {designBuild} from './design-build.mjs';
import {designCheck} from './design-check.mjs';
import {checkPost} from './quality.mjs';

/** Build + check for review. Returns {html, check, problems}; never approves. */
export async function reviewBuild(ref, {copyTo} = {}) {
  const build = await designBuild(ref, {review: true});
  const check = await designCheck(ref, {review: true});
  const {paths, post} = loadPost(ref);
  const html = path.join(paths.out, post.slug + '.html');
  if (copyTo) fs.copyFileSync(html, copyTo);
  return {html, build, check, bytes: fs.statSync(html).size};
}

export async function reviewApply(ref, editsFile, {who = 'owner', now = new Date()} = {}) {
  const before = loadPost(ref);
  const edits = readJSON(editsFile);
  const name = path.basename(editsFile),
    hash = fileHash(editsFile);
  if (edits.kind !== 'owner-edits' || edits.mode !== 'review') throw Error(`${name} is not a review-editor Simpan file (kind owner-edits, mode review).`);
  if (edits.slug !== before.post.slug) throw Error(`${name} is for ${edits.slug}, not ${before.post.slug}.`);
  if (!edits.savedAt || Number.isNaN(new Date(edits.savedAt).getTime())) throw Error(`${name} has no valid savedAt.`);
  const wantDesign = designRevision(before.post, before.paths.dir);
  if (edits.designRevision !== wantDesign)
    throw Error(
      `${name} was made on design ${String(edits.designRevision).slice(0, 12)}, but the post is now ${wantDesign.slice(0, 12)}. Regenerate the review (npm run review:build) instead of approving something the owner did not see.`
    );
  const rec = recordEdits(ref, editsFile, {who, now}); // base copy-revision check + sentence diff log + invalidation
  if (!rec.changes.length)
    appendLog(
      before.paths.log,
      `${wib(now)} — ${who} review save (no changes)`,
      `File: \`${name}\` · saved ${wib(edits.savedAt)} · sha256 ${hash.slice(0, 12)}`
    );
  const problems = [];
  let check = null;
  try {
    await designBuild(ref, {review: true});
    check = await designCheck(ref, {review: true});
    problems.push(...check.problems);
  } catch (e) {
    problems.push(e.message);
  }
  const {paths, post, workflow} = loadPost(ref);
  const q = checkPost(post, undefined, {dir: paths.dir});
  for (const e of q.errors) if (!problems.includes('Editorial: ' + e.message)) problems.push('Editorial: ' + e.message);
  const result = {changes: rec.changes, problems, approved: false, copyRevision: copyRevision(post), designRevision: designRevision(post, paths.dir)};
  if (problems.length) {
    workflow.history.push({event: 'review-apply-failed', file: name, sha256: hash, problems, at: now.toISOString()});
    saveWorkflow(paths, workflow);
    appendLog(paths.log, `${wib(now)} — review save NOT approved`, problems.map(p => '- ' + p).join('\n'));
    return result;
  }
  const saved = new Date(edits.savedAt);
  const base = {
    words: `Saved in review editor ${edits.savedAt}`,
    source: `${name} sha256:${hash}`,
    context: rec.changes.length ? `${rec.changes.length} field(s) changed` : 'no changes',
    at: saved.toISOString(),
    atWIB: wib(saved),
    via: 'review-save',
    copyRevision: result.copyRevision,
    designRevision: result.designRevision,
    copyRule: COPY_RULE,
    designRule: DESIGN_RULE,
    recordedAt: new Date().toISOString()
  };
  for (const [gate, revision] of [
    ['copy', result.copyRevision],
    ['final', result.designRevision]
  ]) {
    if (workflow.approvals[gate]) workflow.history.push({event: 'approval-replaced', gate, approval: workflow.approvals[gate], at: base.recordedAt});
    workflow.approvals[gate] = {gate, ...base, revision};
  }
  workflow.history.push({
    event: 'approved',
    gate: 'review',
    source: base.source,
    copyRevision: result.copyRevision,
    designRevision: result.designRevision,
    at: base.at
  });
  workflow.stage = 'export';
  saveWorkflow(paths, workflow);
  appendLog(
    paths.log,
    `${wib(now)} — review save approved`,
    `${base.words} · ${name} · copy ${result.copyRevision.slice(0, 12)} · design ${result.designRevision.slice(0, 12)}`
  );
  return {...result, approved: true, approval: workflow.approvals.final};
}

if (isMain(import.meta.url))
  try {
    const a = parseArgs(),
      cmd = a._[0];
    if (cmd === 'build') {
      const r = await reviewBuild(a._[1], {copyTo: a['copy-to']});
      console.log(`✓ ${rel(r.html)} (${(r.bytes / 1024 / 1024).toFixed(2)} MB) · design ${r.build.designRevision.slice(0, 12)} · no approval recorded`);
      r.check.warnings.forEach(w => console.log('  ⚠ ' + w));
      r.check.problems.forEach(p => console.log('  ✗ ' + p));
      if (!r.check.passed) process.exitCode = 1;
    } else if (cmd === 'apply') {
      const r = await reviewApply(a._[1], a._[2], {who: a.who});
      console.log(r.changes.length ? `✓ ${r.changes.length} field(s) changed (diff in edits.log.md)` : '✓ no changes in the Simpan file');
      for (const c of r.changes) console.log('  · ' + c.where);
      if (r.approved)
        console.log(
          `✓ approved by the review save (${r.approval.atWIB}): copy ${r.copyRevision.slice(0, 12)} · design ${r.designRevision.slice(0, 12)}\n  next: npm run export -- ${a._[1]}`
        );
      else {
        console.log('✗ NOT approved — fix these, then npm run review:build and send the owner the new review:');
        r.problems.forEach(p => console.log('  ✗ ' + p));
        process.exitCode = 1;
      }
    } else throw Error('usage: review.mjs build <slug> | apply <slug> <edits.json>');
  } catch (e) {
    fail(e);
  }
