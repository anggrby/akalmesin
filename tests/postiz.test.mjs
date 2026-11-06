import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPostBody, envFromProcess, parseDate, redact, scheduleInPostiz, selectIntegration} from '../scripts/postiz.mjs';

const channels = [
  {id: 'ig-ak', name: 'akalmesin', identifier: 'instagram-standalone'},
  {id: 'ig-other', name: 'prompt_hacking', identifier: 'instagram-standalone'},
  {id: 'x-ak', name: 'akalmesin', identifier: 'x'}
];

test('Postiz environment keeps credentials out of defaults and normalizes the base URL', () => {
  assert.deepEqual(envFromProcess({}), {apiKey: '', baseUrl: '', integrationId: ''});
  assert.deepEqual(envFromProcess({POSTIZ_SELFHOST_API_KEY: 'secret', POSTIZ_BASE_URL: 'https://postiz.test/api///', POSTIZ_INTEGRATION_ID: 'ig-ak'}), {
    apiKey: 'secret',
    baseUrl: 'https://postiz.test/api',
    integrationId: 'ig-ak'
  });
  assert.equal(
    envFromProcess({POSTIZ_BASE_URL: 'https://postiz.test/'}).baseUrl,
    'https://postiz.test/api/public/v1',
    'self-hosted root gets the public API path'
  );
  assert.equal(
    envFromProcess({POSTIZ_BASE_URL: 'https://postiz.test/api/public/v1/'}).baseUrl,
    'https://postiz.test/api/public/v1',
    'full API path is unchanged'
  );
});

test('Postiz date parsing preserves the intended instant and rejects ambiguous input', () => {
  assert.equal(parseDate('2026-11-10T19:00:00+07:00'), '2026-11-10T12:00:00.000Z');
  assert.equal(parseDate('2026-11-10T12:00:00Z'), '2026-11-10T12:00:00.000Z');
  assert.throws(() => parseDate('tomorrow'), /Invalid schedule date/);
  assert.throws(() => parseDate('2026-11-10T19:00'), /with an offset/);
});

test('Postiz channel selection accepts only the enabled akalmesin Instagram integration', () => {
  assert.equal(selectIntegration(channels).id, 'ig-ak');
  assert.equal(selectIntegration(channels, 'ig-ak').id, 'ig-ak');
  assert.throws(() => selectIntegration(channels, 'ig-other'), /Refusing another channel/);
  assert.throws(() => selectIntegration(channels, 'x-ak'), /Refusing another channel/);
  assert.throws(() => selectIntegration(channels, 'missing'), /not found/);
  assert.throws(() => selectIntegration([{...channels[0], disabled: true}], 'ig-ak'), /disabled/);
  assert.throws(() => selectIntegration([...channels, {...channels[0], id: 'duplicate'}]), /Multiple/);
});

test('Postiz channel selection accepts the displayed name "Akal Mesin"', () => {
  const displayed = [{id: 'ig-ak-space', name: 'Akal Mesin', identifier: 'instagram-standalone'}];
  assert.equal(selectIntegration(displayed).id, 'ig-ak-space');
  assert.equal(selectIntegration(displayed, 'ig-ak-space').id, 'ig-ak-space');
  assert.throws(() => selectIntegration([{...displayed[0], identifier: 'x'}]), /not connected/);
  assert.throws(() => selectIntegration([{...displayed[0], disabled: true}], 'ig-ak-space'), /disabled/);
});

test('Postiz request body is one scheduled Instagram feed post with the verbatim caption', () => {
  const body = buildPostBody({
    date: '2026-11-10T12:00:00.000Z',
    integrationId: 'ig-ak',
    group: 'group-1',
    postId: 'post-1',
    caption: 'Caption\n\n#akalmesin',
    images: [{id: 'u1', path: '/uploads/u1.png'}]
  });
  assert.equal(body.type, 'schedule');
  assert.equal(body.shortLink, false);
  assert.deepEqual(body.tags, []);
  assert.equal(body.posts.length, 1);
  assert.equal(body.posts[0].value.length, 1);
  assert.equal(body.posts[0].value[0].id, 'post-1');
  assert.equal(body.posts[0].value[0].content, 'Caption\n\n#akalmesin');
  assert.deepEqual(body.posts[0].settings, {__type: 'instagram-standalone', post_type: 'post'});
});

test('Postiz rejects past and under-lead dates before any network request and redacts secrets from errors', async () => {
  let calls = 0;
  const env = {apiKey: 'secret', baseUrl: 'https://postiz.test/api'};
  const clock = () => new Date('2026-11-01T00:00:00Z');
  await assert.rejects(scheduleInPostiz({manifest: {assets: []}, env, date: '2020-01-01T00:00:00Z', clock, fetch: async () => calls++}), /past/);
  await assert.rejects(
    scheduleInPostiz({manifest: {assets: []}, env, date: '2026-11-01T00:00:30Z', clock, fetch: async () => calls++}),
    /less than 60 seconds away/
  );
  assert.equal(calls, 0, 'no network call for a refused time');
  await assert.rejects(
    scheduleInPostiz({manifest: {assets: []}, env, date: '2026-11-01T00:01:00Z', clock, fetch: async () => calls++}),
    /1–10 assets/,
    'exactly 60 seconds ahead passes the lead check'
  );
  assert.equal(redact('bad secret key', 'secret'), 'bad <redacted> key');
});
