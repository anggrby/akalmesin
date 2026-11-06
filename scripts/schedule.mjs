// npm run schedule -- <slug> [--draft] [--publish-at <ISO with offset>] [--dry-run]
// Approved image post -> Notion create/update -> Postiz draft, or schedule at Notion's Publish date -> Notion Scheduled.
import fs from 'node:fs';
import path from 'node:path';
import {ROOT, isMain, loadPost, parseArgs, readJSON, saveWorkflow, wib, writeJSON} from './core.mjs';
import {client, exportPost, findByMarker, loadEnvLocal, manifest} from './export.mjs';
import {buildPostBody, envFromProcess, parseDate, redact, scheduleInPostiz} from './postiz.mjs';

const stateFile = paths => path.join(paths.out, 'postiz-state.json');

function imageManifest(ref) {
  const m = manifest(ref);
  if (m.properties.Format === 'Reel / video' || m.assets.some(asset => asset.kind === 'video'))
    throw Error('Postiz scheduling does not support reel-only posts yet. Use npm run export for the Notion handoff.');
  if (!m.assets.length || m.assets.length > 10) throw Error(`Postiz image posts need 1–10 assets; this post has ${m.assets.length}.`);
  return m;
}

function readState(paths, contentId) {
  const file = stateFile(paths);
  if (!fs.existsSync(file)) return null;
  const state = readJSON(file);
  if (state.contentId !== contentId) throw Error(`${path.relative(ROOT, file)} belongs to another content id; reconcile it before scheduling.`);
  return state;
}

/** Read-only before export: never touch a Published page or an unmatched Scheduled page. */
async function preflightStatus(api, m, workflow, state, draft) {
  const hits = await findByMarker(api, m.bodyMarker);
  if (hits.length > 1) throw Error(`${hits.length} pages carry ${m.bodyMarker}: ${hits.map(h => h.id).join(', ')}. Trash the duplicates in Notion first.`);
  const page = hits[0];
  const status = page?.properties?.Status?.status?.name || null;
  if (status === 'Published') throw Error(`Notion page ${page.id} is Published; refusing to schedule or duplicate it.`);
  if (draft && status === 'Scheduled') throw Error(`Notion page ${page.id} is Scheduled; refusing to convert it to a draft.`);
  if (!draft && status === 'Scheduled' && !workflow.postiz && !state)
    throw Error(`Notion page ${page.id} is already Scheduled but this post has no Postiz receipt; refusing to risk a duplicate.`);
  return status;
}

function storedDate(workflow) {
  return workflow.notion?.publishDate?.start || workflow.notion?.ownerManaged?.publishDate?.start || null;
}

function exportedDate(notion) {
  return notion.publishDate?.start || notion.ownerManaged?.publishDate?.start || null;
}

function checkFuture(date, now) {
  const iso = parseDate(date);
  if (Date.parse(iso) <= new Date(now).getTime()) throw Error(`Schedule date ${iso} is in the past; refusing to schedule.`);
  return iso;
}

function dryRunPlan({m, workflow, state, publishAt, env, now, draft}) {
  const previous = workflow.postiz || state;
  const existingDate = publishAt || storedDate(workflow);
  const date = existingDate
    ? draft
      ? parseDate(existingDate)
      : checkFuture(existingDate, now)
    : draft
      ? '<current time in the Postiz draft request; not a schedule>'
      : '<assigned from Notion Publish date after export>';
  return {
    slug: m.slug,
    approvedRevision: m.approvedRevision,
    network: false,
    notion: {
      pageId: workflow.notion?.pageId || '<find by content marker or create>',
      publishDate: date,
      statusAfterPostiz: draft ? '<unchanged>' : 'Scheduled'
    },
    postiz: buildPostBody({
      type: draft ? 'draft' : 'schedule',
      date,
      integrationId: env.integrationId || previous?.integrationId || '<resolved: enabled akalmesin instagram-standalone channel>',
      group: previous?.group || '<new group id>',
      postId: previous?.postId,
      caption: m.properties.Caption,
      images: m.assets.map(asset => ({id: `<upload or reuse: ${asset.name}>`, path: '<resolved by Postiz upload>', sha256: asset.sha256}))
    })
  };
}

async function markNotionScheduled(api, pageId) {
  await api.call('PATCH', 'pages/' + pageId, {properties: {Status: {status: {name: 'Scheduled'}}}});
  const page = await api.call('GET', 'pages/' + pageId);
  if (page.properties?.Status?.status?.name !== 'Scheduled') throw Error(`Notion page ${pageId} did not read back as Scheduled.`);
}

/** One intentional command performs both sides. A rerun updates the same Notion page and Postiz post. */
export async function schedulePost(ref, opts = {}) {
  const now = opts.now === undefined ? new Date() : new Date(opts.now);
  const m = imageManifest(ref);
  const {paths, workflow} = loadPost(ref);
  const state = readState(paths, m.contentId);
  const env = opts.env || envFromProcess();
  if (opts.dryRun) return dryRunPlan({m, workflow, state, publishAt: opts.publishAt, env, now, draft: !!opts.draft});

  const api =
    opts.notionApi ||
    client({
      token: opts.notionToken,
      fetch: opts.notionFetch,
      sleep: opts.notionSleep,
      tries: opts.notionTries
    });
  await preflightStatus(api, m, workflow, state, !!opts.draft);
  const notion = await exportPost(ref, {
    api,
    publishAt: opts.publishAt,
    now: now.getTime(),
    root: opts.root
  });
  if (notion.approvedRevision !== m.approvedRevision || !notion.assetsMatchBuild)
    throw Error('The Notion export does not match the current approved revision and assets; Postiz was not called.');
  const liveStatus = notion.ownerManaged?.Status || 'Ready to Publish';
  if (liveStatus === 'Published') throw Error(`Notion page ${notion.pageId} is Published; refusing to schedule or duplicate it.`);
  if (opts.draft && liveStatus === 'Scheduled') throw Error(`Notion page ${notion.pageId} is Scheduled; refusing to convert it to a draft.`);

  // exportPost writes workflow.json, so reload it before adding the Postiz receipt.
  const current = loadPost(ref).workflow;
  const previous = current.postiz || state;
  if (opts.draft && previous?.type === 'schedule') throw Error(`Postiz post ${previous.postId} is scheduled; refusing to convert it to a draft.`);
  if (liveStatus === 'Scheduled' && !previous)
    throw Error(`Notion page ${notion.pageId} is already Scheduled but this post has no Postiz receipt; refusing to risk a duplicate.`);
  const date = exportedDate(notion) || (opts.draft ? now.toISOString() : null);
  if (!date)
    throw Error(`Notion page ${notion.pageId} has no Publish date; Postiz was not called. Use --publish-at when creating the row or set its date first.`);
  if (!opts.draft) checkFuture(date, now);

  const {receipt, state: nextState} = await scheduleInPostiz({
    manifest: m,
    previous,
    state,
    env,
    type: opts.draft ? 'draft' : 'schedule',
    date,
    fetch: opts.postizFetch,
    now,
    log: opts.log
  });

  // Save the server ids before the Notion status write. If that write fails, a rerun can update, not duplicate.
  writeJSON(stateFile(paths), nextState);
  current.postiz = {
    ...receipt,
    contentId: m.contentId,
    approvedRevision: m.approvedRevision,
    notionPageId: notion.pageId,
    action: previous ? 'updated' : 'created',
    notionStatus: liveStatus,
    ...(opts.draft ? {draftedAt: now.toISOString(), draftedAtWIB: wib(now)} : {scheduledAt: now.toISOString(), scheduledAtWIB: wib(now)})
  };
  current.stage = opts.draft ? 'postiz-draft' : 'postiz-scheduled';
  current.history.push({
    event: opts.draft ? 'postiz-draft' : 'postiz-scheduled',
    action: current.postiz.action,
    pageId: notion.pageId,
    postId: receipt.postId,
    date: receipt.date,
    at: now.toISOString()
  });
  saveWorkflow(paths, current);

  if (!opts.draft) {
    await markNotionScheduled(api, notion.pageId);
    current.postiz.notionStatus = 'Scheduled';
    current.postiz.notionStatusVerifiedAt = new Date().toISOString();
    saveWorkflow(paths, current);
  }
  return current.postiz;
}

if (isMain(import.meta.url))
  try {
    loadEnvLocal();
    const args = parseArgs(undefined, ['dry-run', 'draft']);
    const result = await schedulePost(args.post || args._[0], {dryRun: !!args['dry-run'], draft: !!args.draft, publishAt: args['publish-at']});
    if (args['dry-run']) console.log(JSON.stringify(result, null, 2));
    else if (args.draft)
      console.log(
        `✓ Postiz draft ${result.action}: ${result.postId}\n  Not scheduled; Notion status: ${result.notionStatus} (unchanged); receipt in workflow.json`
      );
    else
      console.log(
        `✓ Postiz post ${result.action}: ${result.postId}\n  Schedule: ${wib(result.date)} (same instant as Notion Publish date)\n  Notion status: Scheduled (read back OK); receipt in workflow.json`
      );
  } catch (error) {
    console.error('✗ ' + redact(error?.message || error, process.env.POSTIZ_SELFHOST_API_KEY));
    process.exitCode = 1;
  }
