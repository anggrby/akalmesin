// npm run approve -- <slug> --gate selected|copy|final --words "owner's exact words" | --words-file msg.txt --source "chat t45u" [--at ISO] [--context "..."]
// Records an owner approval verbatim. Only the owner's own words count; never paraphrase.
import fs from 'node:fs';
import path from 'node:path';
import {GATES, loadPost, parseArgs, readJSON, saveWorkflow, copyRevision, designRevision, requireApproval, wib, isMain, fail} from './core.mjs';
import {checkPost} from './quality.mjs';

export function approve(ref, {gate, words, 'words-file': wordsFile, source, at, context = ''}) {
  if (wordsFile) words = fs.readFileSync(wordsFile, 'utf8');
  if (!GATES.includes(gate)) throw Error('--gate must be one of ' + GATES.join(', '));
  if (!words?.trim()) throw Error("--words is required: paste the owner's exact message");
  if (!source?.trim()) throw Error('--source is required, e.g. "chat t45u"');
  const when = at ? new Date(at) : new Date();
  if (Number.isNaN(when.getTime())) throw Error('--at must be an ISO time');
  const {paths, post, workflow} = loadPost(ref);
  let revision = null;
  if (gate === 'copy') {
    const r = checkPost(post);
    if (r.errors.length) throw Error('Copy fails editorial checks: ' + r.errors.map(e => e.message).join(' '));
    revision = copyRevision(post);
  }
  if (gate === 'final') {
    requireApproval(workflow, 'copy', copyRevision(post));
    revision = designRevision(post, paths.dir);
    const check = path.join(paths.out, 'check.json');
    if (!fs.existsSync(check)) throw Error('Run npm run design:check first');
    const c = readJSON(check);
    if (!c.passed || c.designRevision !== revision) throw Error('design:check is missing, failing or stale for this revision; rebuild and recheck');
    if (workflow.designStale) throw Error('Design is stale after text edits; run design:build and design:check');
  }
  const approval = {
    gate,
    words: words.trim(),
    source: source.trim(),
    context: context.trim(),
    at: when.toISOString(),
    atWIB: wib(when),
    revision,
    recordedAt: new Date().toISOString()
  };
  if (workflow.approvals[gate]) workflow.history.push({event: 'approval-replaced', gate, approval: workflow.approvals[gate], at: approval.recordedAt});
  workflow.approvals[gate] = approval;
  workflow.history.push({event: 'approved', gate, source: approval.source, revision, at: approval.at});
  workflow.stage = {selected: 'research', copy: 'design', final: 'export'}[gate];
  saveWorkflow(paths, workflow);
  return approval;
}

if (isMain(import.meta.url))
  try {
    const a = parseArgs();
    const r = approve(a._[0], a);
    console.log(`✓ ${r.gate} approved (${r.source}, ${r.atWIB})${r.revision ? ' for revision ' + r.revision.slice(0, 12) : ''}`);
  } catch (e) {
    fail(e);
  }
