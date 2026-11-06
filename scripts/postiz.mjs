// Minimal Postiz public-API client for approved akalmesin image posts.
// Credentials and the API base URL come from the environment; neither is written to a receipt.
import {randomUUID} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {ROOT, fileHash} from './core.mjs';

export const CHANNEL_NAME = 'akalmesin';
export const CHANNEL_IDENTIFIER = 'instagram-standalone';
export const MIN_SCHEDULE_LEAD_MS = 60_000;

export class PostizError extends Error {}

export function redact(text, secret) {
  return secret ? String(text).split(secret).join('<redacted>') : String(text);
}

export function envFromProcess(env = process.env) {
  const configured = (env.POSTIZ_BASE_URL || '').replace(/\/+$/, '');
  // A self-hosted root URL is accepted too; Postiz serves the public API below /api/public/v1.
  const root = configured && new URL(configured).pathname === '/' ? configured + '/api/public/v1' : configured;
  return {
    apiKey: env.POSTIZ_SELFHOST_API_KEY || '',
    baseUrl: root,
    integrationId: env.POSTIZ_INTEGRATION_ID || ''
  };
}

export function parseDate(value) {
  const text = String(value || '').trim();
  const hasOffset = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/i.test(text);
  const ms = Date.parse(text);
  if (!hasOffset || Number.isNaN(ms)) throw new PostizError(`Invalid schedule date "${value}"; use an ISO date-time with an offset.`);
  return new Date(ms).toISOString();
}

/** Postiz shows the account as "Akal Mesin"; compare names without case or spacing. */
export function channelKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\s+/g, '');
}

/** The explicit id is not a channel override: it must still identify the enabled akalmesin Instagram channel. */
export function selectIntegration(list, integrationId = '') {
  const wanted = channelKey(CHANNEL_NAME);
  let hit;
  if (integrationId) {
    hit = list.find(i => i.id === integrationId);
    if (!hit) throw new PostizError('POSTIZ_INTEGRATION_ID was not found in GET /integrations.');
  } else {
    const hits = list.filter(i => i.identifier === CHANNEL_IDENTIFIER && channelKey(i.name) === wanted);
    if (hits.length > 1) throw new PostizError(`Multiple ${CHANNEL_NAME} ${CHANNEL_IDENTIFIER} channels found; set POSTIZ_INTEGRATION_ID.`);
    hit = hits[0];
  }
  if (!hit) throw new PostizError(`Channel "${CHANNEL_NAME}" (${CHANNEL_IDENTIFIER}) is not connected in Postiz.`);
  if (hit.identifier !== CHANNEL_IDENTIFIER || channelKey(hit.name) !== wanted)
    throw new PostizError(`Integration "${hit.name}" is ${hit.identifier}; expected ${CHANNEL_NAME} (${CHANNEL_IDENTIFIER}). Refusing another channel.`);
  if (hit.disabled) throw new PostizError(`Channel "${CHANNEL_NAME}" is disabled in Postiz.`);
  return hit;
}

export function buildPostBody({type = 'schedule', date, integrationId, group, postId, caption, images}) {
  const value = {content: caption, image: images};
  if (postId) value.id = postId;
  return {
    type,
    date,
    shortLink: false,
    tags: [],
    posts: [
      {
        integration: {id: integrationId},
        group,
        value: [value],
        settings: {__type: CHANNEL_IDENTIFIER, post_type: 'post'}
      }
    ]
  };
}

class Api {
  constructor(env, fetchFn) {
    this.env = env;
    this.fetchFn = fetchFn;
  }

  async call(method, route, body, json = true) {
    const headers = {Authorization: this.env.apiKey};
    if (json && body !== undefined) headers['Content-Type'] = 'application/json';
    let response;
    try {
      response = await this.fetchFn(this.env.baseUrl + route, {method, headers, ...(body !== undefined ? {body} : {})});
    } catch (error) {
      throw new PostizError(`${method} ${route} failed: ${redact(error.message, this.env.apiKey)}`);
    }
    const text = await response.text();
    if (!response.ok) {
      const hint = response.status === 401 ? ' (check POSTIZ_SELFHOST_API_KEY)' : response.status === 429 ? ' (rate limited; try later)' : '';
      throw new PostizError(`${method} ${route} -> HTTP ${response.status}${hint}: ${redact(text, this.env.apiKey).slice(0, 300)}`);
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new PostizError(`${method} ${route} returned a non-JSON response.`);
    }
  }

  integrations() {
    return this.call('GET', '/integrations');
  }

  async upload(name, data) {
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(data)], {type: 'image/png'}), name);
    const result = await this.call('POST', '/upload', form, false);
    if (!result.id || !result.path) throw new PostizError(`POST /upload for ${name} returned no id/path.`);
    return result;
  }

  async findPost(postId, around) {
    const time = Date.parse(around);
    const query = new URLSearchParams({
      startDate: new Date(time - 7 * 864e5).toISOString(),
      endDate: new Date(time + 7 * 864e5).toISOString()
    });
    const result = await this.call('GET', `/posts?${query}`);
    return result.posts?.find(post => post.id === postId);
  }

  upsert(body) {
    return this.call('POST', '/posts', JSON.stringify(body));
  }
}

function assertScheduleTime(scheduleAt, clock) {
  const current = new Date(clock()).getTime();
  const at = Date.parse(scheduleAt);
  if (at <= current) throw new PostizError(`Schedule date ${scheduleAt} is in the past; refusing to schedule.`);
  if (at - current < MIN_SCHEDULE_LEAD_MS)
    throw new PostizError(`Schedule date ${scheduleAt} is less than ${MIN_SCHEDULE_LEAD_MS / 1000} seconds away; refusing to schedule.`);
}

/**
 * The listed Postiz post must belong to the selected channel. Reconciliation also requires the
 * pending group: /posts is an account-wide lookup, so an id alone does not prove identity.
 */
function assertPostIdentity(existing, postId, integrationId, group) {
  const owner = existing.integration?.id;
  if (!owner || owner !== integrationId)
    throw new PostizError(
      `Postiz post ${postId} belongs to ${owner || 'an unknown channel'}, not the selected akalmesin channel; refusing to reconcile or update it.`
    );
  if (group && existing.group !== group)
    throw new PostizError(`Postiz post ${postId} is not the pending create (group ${group}); refusing to reconcile it and keeping the pending state.`);
}

/**
 * Create or update one scheduled image post. Upload paths stay in git-ignored out/postiz-state.json;
 * the returned public receipt contains only ids and hashes, never the API key, base URL or upload URLs.
 * There are no retries: an uncertain create must be reconciled before another create is attempted.
 */
export async function scheduleInPostiz({
  manifest,
  previous,
  state,
  env,
  type = 'schedule',
  date,
  fetch: fetchFn = globalThis.fetch,
  clock = () => new Date(),
  saveState = () => {},
  reconcilePost = '',
  log = () => {}
}) {
  if (!env.apiKey) throw new PostizError('POSTIZ_SELFHOST_API_KEY is not set.');
  if (!env.baseUrl) throw new PostizError('POSTIZ_BASE_URL is not set.');
  if (!['schedule', 'draft'].includes(type)) throw new PostizError(`Unsupported Postiz post type "${type}".`);
  const scheduleAt = parseDate(date);
  if (type === 'schedule') assertScheduleTime(scheduleAt, clock);
  const assets = manifest.assets;
  if (!assets.length || assets.length > 10) throw new PostizError(`Postiz image posts need 1–10 assets; this post has ${assets.length}.`);
  if (assets.some(asset => asset.kind === 'video' || asset.contentType !== 'image/png'))
    throw new PostizError('Postiz scheduling currently supports approved PNG posts only; reel-only posts are not supported.');

  const files = assets.map(asset => {
    const file = path.resolve(ROOT, asset.file);
    if (fileHash(file) !== asset.sha256) throw new PostizError(`${asset.file} changed after the approved Notion export.`);
    return {asset, file, data: fs.readFileSync(file)};
  });
  const api = new Api(env, fetchFn);
  const integration = selectIntegration(await api.integrations(), env.integrationId);
  log(`Postiz channel: ${integration.name} (${integration.identifier})`);

  let existing = null;
  let serverGroup;
  let previousPost = previous;
  let stateForReuse = state;
  if (previous?.phase === 'creating' && !previous.postId) {
    if (!reconcilePost)
      throw new PostizError(
        `A previous Postiz create (group ${previous.group}) ended without a response; check Postiz, then rerun with --reconcile-post <postId> or remove the local in-flight state after confirming no post exists.`
      );
    existing = await api.findPost(reconcilePost, previous.date);
    if (!existing) throw new PostizError(`Postiz post ${reconcilePost} was not found; refusing to reconcile an uncertain create to a missing post.`);
    if (!previous.group) throw new PostizError('The pending Postiz create has no group; refusing to reconcile it.');
    assertPostIdentity(existing, reconcilePost, integration.id, previous.group);
    if (existing.state === 'PUBLISHED') throw new PostizError(`Postiz post ${reconcilePost} is already PUBLISHED; refusing to update or duplicate it.`);
    previousPost = {...previous, postId: reconcilePost, phase: undefined};
    stateForReuse = {...state, postId: reconcilePost, phase: undefined};
    serverGroup = existing.group;
    log(`Reconciled Postiz post ${reconcilePost} from the uncertain create.`);
  }
  if (previousPost) {
    if (!previousPost.postId) throw new PostizError('The stored Postiz state has no post id; reconcile it before scheduling.');
    if (previousPost.integrationId !== integration.id) throw new PostizError('The stored Postiz post belongs to another channel; refusing to update it.');
    if (!existing) existing = await api.findPost(previousPost.postId, previousPost.date);
    if (!existing) throw new PostizError(`Postiz post ${previousPost.postId} was not found. Reconcile it before creating another post.`);
    assertPostIdentity(existing, previousPost.postId, integration.id, previousPost.group);
    if (existing.state === 'PUBLISHED') throw new PostizError(`Postiz post ${previousPost.postId} is already PUBLISHED; refusing to update or duplicate it.`);
    if (type === 'draft' && existing.state === 'QUEUE')
      throw new PostizError(`Postiz post ${previousPost.postId} is already QUEUE; refusing to convert it back to a draft.`);
    serverGroup = existing.group;
    log(`Updating Postiz post ${previousPost.postId} (state ${existing.state || 'unknown'}).`);
  }

  const oldUploads = new Map(
    (stateForReuse && previousPost && stateForReuse.postId === previousPost.postId ? stateForReuse.uploads || [] : []).map(upload => [upload.file, upload])
  );
  const uploads = [];
  for (const {asset, file, data} of files) {
    const old = oldUploads.get(asset.file);
    if (old && old.sha256 === asset.sha256 && old.id && old.path) {
      uploads.push(old);
      log(`Reusing Postiz upload for ${asset.name}`);
      continue;
    }
    const uploaded = await api.upload(asset.name || path.basename(file), data);
    uploads.push({file: asset.file, name: asset.name, sha256: asset.sha256, id: uploaded.id, path: uploaded.path});
    log(`Uploaded ${asset.name} to Postiz.`);
  }

  const group = serverGroup || previousPost?.group || randomUUID();
  const body = buildPostBody({
    type,
    date: scheduleAt,
    integrationId: integration.id,
    group,
    postId: previousPost?.postId,
    caption: manifest.properties.Caption,
    images: uploads.map(upload => ({id: upload.id, path: upload.path}))
  });
  // Recheck at the submission boundary: Notion export and uploads can outlive a short schedule window.
  // This runs before the in-flight record so an expired date leaves no false uncertain-create state.
  if (type === 'schedule') assertScheduleTime(scheduleAt, clock);
  if (!previousPost)
    saveState({
      phase: 'creating',
      integrationId: integration.id,
      group,
      type,
      date: scheduleAt,
      contentId: manifest.contentId,
      approvedRevision: manifest.approvedRevision,
      uploads
    });
  let result;
  try {
    result = await api.upsert(body);
  } catch (error) {
    if (!previousPost)
      throw new PostizError(
        `Postiz create for group ${group} may have succeeded but no response was saved; check Postiz, then rerun with --reconcile-post <postId> or remove the local in-flight state after confirming no post exists. ${error.message}`
      );
    throw error;
  }
  const postId = result.find?.(item => item.integration === integration.id)?.postId || result[0]?.postId;
  if (!postId) throw new PostizError('POST /posts returned no postId; reconcile Postiz before retrying.');

  const receipt = {
    integrationId: integration.id,
    group,
    postId,
    type,
    date: scheduleAt,
    uploads: uploads.map(({file, name, sha256, id}) => ({file, name, sha256, id}))
  };
  return {receipt, state: {...receipt, contentId: manifest.contentId, uploads}};
}
