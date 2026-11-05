import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync, statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DEFAULT_CONFIG, GrowthStore, normalizeUsername, validateConfig, validateSource, sessionAt} from '../../scripts/instagram-growth/core.mjs';

const date = s => new Date(s);
const morning = date('2026-11-04T01:00:00Z');
const session = sessionAt(DEFAULT_CONFIG, morning);
function fixture(t) {
  const path = mkdtempSync(join(tmpdir(), 'growth-core-'));
  t.after(() => rmSync(path, {recursive: true, force: true}));
  return path;
}

test('configuration validates strict limits, session boundaries and sources', () => {
  assert.equal(normalizeUsername('https://www.instagram.com/Aico.Community/'), 'aico.community');
  assert.deepEqual(validateSource({type: 'likes', url: 'https://instagram.com/reel/abc_123/?igsh=x'}), {
    type: 'likes',
    url: 'https://www.instagram.com/reel/abc_123/'
  });
  for (const value of ['https://instagram.com.evil.test/user/', 'https://instagram.com/p/post/', '../name', 'bad..name'])
    assert.throws(() => normalizeUsername(value));
  assert.throws(() => validateSource({type: 'likes', url: 'https://evil.test/p/abc/'}));
  for (const changes of [
    {dailyFollowLimit: 51},
    {minDelaySeconds: 29},
    {reviewAfterDays: 6},
    {account: 'other'},
    {timezone: 'UTC'},
    {maxUnfollowsPerSession: 18}
  ])
    assert.throws(() => validateConfig(changes));
  assert.throws(() => validateConfig({sessions: DEFAULT_CONFIG.sessions.map((s, i) => (i === 2 ? {...s, limit: 17} : s))}));
  assert.throws(() => validateConfig({sessions: DEFAULT_CONFIG.sessions.map((s, i) => (i === 1 ? {...s, start: '10:59'} : s))}));
  assert.equal(sessionAt(DEFAULT_CONFIG, date('2026-11-04T00:59:59Z')), null);
  assert.equal(sessionAt(DEFAULT_CONFIG, date('2026-11-04T01:00:00Z')).name, 'morning');
  assert.equal(sessionAt(DEFAULT_CONFIG, date('2026-11-04T04:00:00Z')), null);
  assert.equal(sessionAt(DEFAULT_CONFIG, date('2026-11-04T16:59:59Z')), null);
  assert.equal(sessionAt(DEFAULT_CONFIG, date('2026-11-04T18:00:00Z')), null);
  assert.equal(sessionAt(DEFAULT_CONFIG, date('2026-11-05T01:00:00Z')).date, '2026-11-05');
});

test('unresolved follow reserves budget and spacing survives restart; skipped releases reservation', t => {
  const path = fixture(t);
  let store = new GrowthStore(path);
  assert.equal(statSync(path).mode & 0o777, 0o700);
  assert.equal(statSync(join(path, 'state.sqlite')).mode & 0o777, 0o600);
  store.addCandidates(['@Alice', 'bob'], morning);
  const id = store.beginAction('alice', 'follow', {now: morning, session});
  store.finishAction(id, {status: 'uncertain', now: date('2026-11-04T01:00:05Z'), detail: 'timeout'});
  store.close();
  store = new GrowthStore(path);
  assert.equal(store.lastActionAt(), '2026-11-04T01:00:05.000Z');
  store.finishAction(id, {status: 'uncertain', now: morning});
  assert.equal(store.lastActionAt(), '2026-11-04T01:00:05.000Z');
  assert.equal(store.listUnresolved()[0].username, 'alice');
  assert.equal(store.budget(session, DEFAULT_CONFIG).remaining, 16);
  assert.deepEqual(
    store.candidates().map(c => c.username),
    ['bob']
  );
  assert.throws(() => store.beginAction('alice', 'follow', {now: morning, session}));
  store.finishAction(id, {status: 'skipped', now: date('2026-11-04T01:00:10Z')});
  assert.equal(store.budget(session, DEFAULT_CONFIG).remaining, 17);
  assert.equal(store.get('alice').protected, true);
  store.addCandidates(['alice'], morning);
  assert.deepEqual(
    store.candidates().map(c => c.username),
    ['bob']
  );
  store.close();
});

test('daily and session counts roll over in WIB, and confirmed results persist', t => {
  const store = new GrowthStore(fixture(t));
  t.after(() => store.close());
  const names = Array.from({length: 18}, (_, i) => `u${i}`);
  store.addCandidates(names, morning);
  for (let i = 0; i < 17; i++) {
    const id = store.beginAction(names[i], 'follow', {now: morning, session});
    store.finishAction(id, {status: i % 2 ? 'requested' : 'following', now: morning});
  }
  assert.equal(store.budget(session, DEFAULT_CONFIG).remaining, 0);
  const afternoon = sessionAt(DEFAULT_CONFIG, date('2026-11-04T06:00:00Z'));
  assert.deepEqual(store.budget(afternoon, DEFAULT_CONFIG), {
    date: '2026-11-04',
    sessionName: 'afternoon',
    dailyUsed: 17,
    sessionUsed: 0,
    dailyRemaining: 33,
    sessionRemaining: 17,
    remaining: 17
  });
  const tomorrow = sessionAt(DEFAULT_CONFIG, date('2026-11-05T01:00:00Z'));
  assert.equal(store.budget(tomorrow, DEFAULT_CONFIG).dailyUsed, 0);
});

test('requested acceptance starts seven-day clock, unknown defers, follow-back stops review', t => {
  const store = new GrowthStore(fixture(t));
  t.after(() => store.close());
  store.addCandidates(['request', 'unknown', 'back'], morning);
  for (const name of ['request', 'unknown', 'back']) {
    const id = store.beginAction(name, 'follow', {now: morning, session});
    store.finishAction(id, {status: name === 'request' ? 'requested' : 'following', now: morning});
  }
  const week = date('2026-11-11T01:00:00Z');
  assert.equal(store.dueReviews(week, 7).length, 3);
  store.setObservation('request', {relationship: 'following', followsBack: false, now: week});
  store.setObservation('unknown', {relationship: 'following', followsBack: null, now: week});
  store.setObservation('back', {relationship: 'following', followsBack: true, now: week});
  assert.equal(store.get('request').acceptedAt, week.toISOString());
  assert.deepEqual(store.dueReviews(week, 7), []);
  assert.deepEqual(
    store.dueReviews(date('2026-11-12T01:00:00Z'), 7).map(c => c.username),
    ['unknown']
  );
  assert.deepEqual(
    store
      .dueReviews(date('2026-11-18T01:00:00Z'), 7)
      .map(c => c.username)
      .sort(),
    ['request', 'unknown']
  );
});

test('unfollow and permanent exclusions never requeue; skipped unfollow preserves state', t => {
  const store = new GrowthStore(fixture(t));
  t.after(() => store.close());
  store.exclude('excluded', 'owner exclusion', morning);
  store.addCandidates(['excluded', 'alice'], morning);
  const follow = store.beginAction('alice', 'follow', {now: morning, session});
  store.finishAction(follow, {status: 'following', now: morning});
  const skip = store.beginAction('alice', 'unfollow', {now: morning, session});
  store.finishAction(skip, {status: 'skipped', now: morning});
  assert.equal(store.get('alice').status, 'following');
  assert.equal(store.unfollowCount(session), 0);
  const action = store.beginAction('alice', 'unfollow', {now: morning, session});
  assert.equal(store.unfollowCount(session), 1);
  store.finishAction(action, {status: 'unfollowed', now: morning});
  store.addCandidates(['alice', 'excluded'], morning);
  assert.equal(store.get('alice').excluded, true);
  assert.deepEqual(store.candidates(), []);
  store.pause('challenge', morning);
  assert.equal(store.paused().reason, 'challenge');
  store.resume(morning);
  assert.equal(store.paused(), null);
});

test('all three session budgets enforce a total of fifty confirmed or reserved follows', t => {
  const store = new GrowthStore(fixture(t));
  t.after(() => store.close());
  const instants = [date('2026-11-04T01:00:00Z'), date('2026-11-04T06:00:00Z'), date('2026-11-04T12:00:00Z')];
  store.addCandidates(
    Array.from({length: 51}, (_, i) => `cap${i}`),
    morning
  );
  let offset = 0;
  for (const instant of instants) {
    const window = sessionAt(DEFAULT_CONFIG, instant);
    for (let i = 0; i < window.limit; i++) {
      const id = store.beginAction(`cap${offset++}`, 'follow', {now: instant, session: window});
      if (offset < 50) store.finishAction(id, {status: 'following', now: instant});
    }
    assert.equal(store.budget(window, DEFAULT_CONFIG).remaining, 0);
  }
  const window = sessionAt(DEFAULT_CONFIG, instants[2]);
  assert.equal(store.budget(window, DEFAULT_CONFIG).dailyUsed, 50);
  assert.equal(store.budget(window, DEFAULT_CONFIG).dailyRemaining, 0);
  assert.equal(store.listUnresolved().length, 1);
});

test('abandoned follow stays protected and consumes its original budget after restart', t => {
  const path = fixture(t);
  let store = new GrowthStore(path);
  store.addCandidates(['alice', 'bob'], morning);
  const id = store.beginAction('alice', 'follow', {now: morning, session});
  const afternoon = sessionAt(DEFAULT_CONFIG, date('2026-11-04T06:00:00Z'));
  store.finishAction(id, {status: 'abandoned', now: date('2026-11-04T06:00:00Z')});
  store.close();
  store = new GrowthStore(path);
  t.after(() => store.close());
  assert.deepEqual(store.listUnresolved(), []);
  assert.equal(store.budget(session, DEFAULT_CONFIG).dailyUsed, 1);
  assert.equal(store.budget(session, DEFAULT_CONFIG).sessionUsed, 1);
  assert.equal(store.budget(afternoon, DEFAULT_CONFIG).dailyUsed, 1);
  assert.equal(store.budget(afternoon, DEFAULT_CONFIG).sessionUsed, 0);
  assert.equal(store.get('alice').status, 'abandoned');
  assert.equal(store.get('alice').excluded, true);
  assert.equal(store.get('alice').protected, true);
  store.addCandidates(['alice'], morning);
  assert.deepEqual(
    store.candidates().map(c => c.username),
    ['bob']
  );
  assert.deepEqual(store.dueReviews(date('2026-11-12T01:00:00Z')), []);
  assert.throws(() => store.finishAction(id, {status: 'following', now: morning}));
  assert.throws(() => store.beginAction('alice', 'follow', {now: morning, session}));
  const bob = store.beginAction('bob', 'follow', {now: morning, session});
  store.finishAction(bob, {status: 'following', now: morning});
  const unfollow = store.beginAction('bob', 'unfollow', {now: morning, session});
  assert.throws(() => store.finishAction(unfollow, {status: 'abandoned', now: morning}));
  assert.equal(store.listUnresolved()[0].id, unfollow);
});

test('stable ID recognizes previously handled or excluded accounts under a new username', t => {
  const path = fixture(t);
  let store = new GrowthStore(path);
  store.addCandidates([{username: 'oldname', userId: '12345678901234567890'}, {username: 'unhandled', userId: '987'}, {username: 'skip'}], morning);
  assert.equal(store.hasKnownIdentity(null, 'newname'), false);
  assert.equal(store.hasKnownIdentity('12345678901234567890', 'newname'), false);
  assert.equal(store.hasKnownIdentity('987', 'another'), false);
  assert.throws(() => store.hasKnownIdentity('12x', 'newname'));
  assert.throws(() => store.hasKnownIdentity(1e25, 'newname'));
  const old = store.beginAction('oldname', 'follow', {now: morning, session});
  store.finishAction(old, {status: 'abandoned', now: morning});
  assert.equal(store.hasKnownIdentity('12345678901234567890', 'newname'), true);
  assert.equal(store.hasKnownIdentity('12345678901234567890', 'oldname'), false);
  store.exclude('unhandled', 'owner exclusion', morning);
  assert.equal(store.hasKnownIdentity('987', 'another'), true);
  const skipped = store.beginAction('skip', 'follow', {now: morning, session});
  store.finishAction(skipped, {status: 'skipped', userId: '456', now: morning});
  store.close();
  store = new GrowthStore(path);
  t.after(() => store.close());
  assert.equal(store.hasKnownIdentity('456', 'renamed'), true);
  assert.equal(store.hasKnownIdentity('12345678901234567890', 'newname'), true);
});

test('identity is durable before a click and cannot be changed for a candidate', t => {
  const path = fixture(t);
  let store = new GrowthStore(path);
  store.addCandidates(['first', 'other'], morning);
  store.rememberIdentity('first', '123456');
  store.rememberIdentity('first', '123456');
  assert.throws(() => store.rememberIdentity('first', '654321'));
  assert.throws(() => store.rememberIdentity('first', null));
  const action = store.beginAction('first', 'follow', {now: morning, session});
  assert.throws(() => store.finishAction(action, {status: 'following', userId: '654321', now: morning}));
  assert.equal(store.listUnresolved().length, 1);
  store.close();
  store = new GrowthStore(path);
  t.after(() => store.close());
  assert.equal(store.get('first').userId, '123456');
  assert.equal(store.hasKnownIdentity('123456', 'other'), true);
  store.exclude('other', 'owner exclusion', morning);
  assert.throws(() => store.rememberIdentity('other', '55'));
});
