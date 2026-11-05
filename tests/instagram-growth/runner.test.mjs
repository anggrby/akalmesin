import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {DEFAULT_CONFIG, GrowthStore, sessionAt} from '../../scripts/instagram-growth/core.mjs';
import {runSession, reconcileActions, acquireLock, unlockStoppedWorker} from '../../scripts/instagram-growth/runner.mjs';
import {main, parseArgs, loginReady} from '../../scripts/instagram-growth/cli.mjs';

function fixture(t, at = '2026-11-04T01:00:00Z') {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'growth-runner-'));
  const store = new GrowthStore(directory);
  t.after(() => {
    store.close();
    fs.rmSync(directory, {recursive: true, force: true});
  });
  let instant = new Date(at);
  const now = () => new Date(instant);
  const calls = [];
  const browser = {
    guard: async () => {},
    assertAccount: async () => {},
    collectCandidates: async () => Array.from({length: 60}, (_, i) => ({username: `person${String(i).padStart(2, '0')}`})),
    follow: async username => {
      calls.push({kind: 'follow', username, at: now()});
      return {status: 'following'};
    },
    inspect: async username => ({username, userId: '100', relationship: 'following', followsBack: false}),
    unfollow: async username => {
      calls.push({kind: 'unfollow', username, at: now()});
      return {status: 'unfollowed'};
    }
  };
  const wait = async ms => {
    instant = new Date(instant.getTime() + ms);
  };
  return {
    directory,
    store,
    browser,
    now,
    wait,
    calls,
    config: DEFAULT_CONFIG,
    setNow: s => {
      instant = new Date(s);
    }
  };
}

test('runner shares persistent 17/17/16 budgets and thirty-second spacing across invocations', async t => {
  const f = fixture(t);
  const first = await runSession(f);
  assert.equal(first.follows, 17);
  assert.equal((await runSession(f)).follows, 0);
  f.setNow('2026-11-04T06:00:00Z');
  assert.equal((await runSession(f)).follows, 17);
  f.setNow('2026-11-04T12:00:00Z');
  assert.equal((await runSession(f)).follows, 16);
  assert.equal(f.calls.length, 50);
  assert.equal(new Set(f.calls.map(c => c.username)).size, 50);
  for (let i = 1; i < f.calls.length; i++) assert.ok(f.calls[i].at - f.calls[i - 1].at >= 30000);
  assert.equal((await runSession(f)).follows, 0);
});

test('restriction latches pause and uncertain intent, including across a database restart', async t => {
  const f = fixture(t);
  const follow = f.browser.follow;
  let attempts = 0;
  f.browser.follow = async username => {
    if (++attempts === 2) throw Object.assign(new Error('Try again later'), {code: 'rate_limited'});
    return follow(username);
  };
  await assert.rejects(runSession(f), /Try again later/);
  assert.equal(attempts, 2);
  assert.match(f.store.paused().reason, /rate_limited/);
  assert.equal(f.store.listUnresolved().length, 1);
  assert.equal(f.store.budget(sessionAt(f.config, f.now()), f.config).dailyUsed, 2);
  await assert.rejects(runSession(f), /Paused/);
  assert.equal(attempts, 2);
  const reopened = new GrowthStore(f.directory);
  assert.ok(reopened.paused());
  assert.equal(reopened.listUnresolved().length, 1);
  reopened.close();
});

test('uncertain outcome is reconciled through observation without another write', async t => {
  const f = fixture(t);
  f.browser.follow = async () => ({status: 'uncertain'});
  await assert.rejects(runSession(f), /uncertain/);
  assert.equal(f.store.listUnresolved().length, 1);
  const result = await reconcileActions(f);
  assert.equal(result.unresolved, 0);
  assert.ok(result.paused);
  assert.equal(f.calls.length, 0);
  assert.equal(f.store.get('person00').status, 'following');
  assert.equal(f.store.get('person00').excluded, true);
});

test('seven-day review unfollows only a confirmed non-follower; new acceptance gets seven more days', async t => {
  const f = fixture(t, '2026-10-28T01:00:00Z');
  const session = sessionAt(f.config, f.now());
  for (const name of ['no_back', 'yes_back', 'unknown', 'late_request']) {
    f.store.addCandidates([name], f.now());
    const id = f.store.beginAction(name, 'follow', {now: f.now(), session});
    f.store.finishAction(id, {status: name === 'late_request' ? 'requested' : 'following', userId: '100', now: f.now()});
  }
  f.setNow('2026-11-04T01:00:00Z');
  f.browser.collectCandidates = async () => [];
  f.browser.inspect = async username => ({
    username,
    relationship: 'following',
    userId: '100',
    followsBack: username === 'yes_back' ? true : username === 'unknown' ? null : false
  });
  const result = await runSession(f);
  assert.equal(result.unfollows, 1);
  assert.deepEqual(
    f.calls.map(c => c.username),
    ['no_back']
  );
  assert.equal(f.store.get('no_back').excluded, true);
  assert.equal(f.store.get('late_request').acceptedAt, '2026-11-04T01:00:00.000Z');
  assert.equal(f.store.get('unknown').excluded, false);
  assert.equal(f.store.dueReviews(f.now(), 7).length, 0);
});

test('window ending during spacing prevents the next click and missed sessions are not caught up', async t => {
  const f = fixture(t, '2026-11-04T03:59:50Z');
  f.store.addCandidates(['old'], f.now());
  const id = f.store.beginAction('old', 'follow', {now: f.now(), session: sessionAt(f.config, f.now())});
  f.store.finishAction(id, {status: 'following', now: f.now()});
  f.setNow('2026-11-04T03:59:55Z');
  const result = await runSession(f);
  assert.equal(result.follows, 0);
  assert.equal(f.calls.length, 0);
  assert.equal((await runSession(f)).status, 'outside-window');
  f.setNow('2026-11-04T06:00:00Z');
  assert.equal((await runSession(f)).follows, 17);
});

test('pre-existing relationships are protected and never added to managed reviews', async t => {
  const f = fixture(t);
  f.browser.collectCandidates = async () => [{username: 'already_following'}];
  f.browser.follow = async () => ({status: 'skipped'});
  await runSession(f);
  assert.equal(f.store.get('already_following').protected, true);
  assert.equal(f.store.budget(sessionAt(f.config, f.now()), f.config).dailyUsed, 0);
  f.setNow('2026-11-12T01:00:00Z');
  assert.deepEqual(f.store.dueReviews(f.now(), 7), []);
});

test('process lock rejects concurrent execution and refuses to unlock a live worker', t => {
  const f = fixture(t);
  const release = acquireLock(f.directory);
  assert.throws(() => acquireLock(f.directory), /Another growth command/);
  assert.throws(() => unlockStoppedWorker(f.directory), /still running/);
  release();
  assert.equal(unlockStoppedWorker(f.directory), false);
});

test('CLI parser rejects unknown and duplicated options', () => {
  assert.deepEqual(parseArgs(['exclude', '--username', '@someone', '--reason', 'owner preference']), {
    command: 'exclude',
    username: '@someone',
    reason: 'owner preference'
  });
  assert.throws(() => parseArgs(['run', '--stealth']), /Invalid option/);
  assert.throws(() => parseArgs(['run', '--config', 'a', '--config', 'b']), /Duplicate option/);
});

test('external pause during account verification prevents the next durable action', async t => {
  const f = fixture(t);
  let checks = 0;
  f.browser.assertAccount = async () => {
    if (++checks === 3) f.store.pause('operator paused during verification', f.now());
  };
  await assert.rejects(runSession(f), /Paused/);
  assert.equal(f.calls.length, 0);
  assert.equal(f.store.listUnresolved().length, 0);
});

test('mutation callback blocks a pause arriving inside a browser operation', async t => {
  const f = fixture(t);
  f.browser.follow = async () => {
    f.store.pause('operator pause before click', f.now());
    f.browser.beforeMutation();
    f.calls.push({kind: 'follow'});
    return {status: 'following'};
  };
  await assert.rejects(runSession(f), /Paused/);
  assert.equal(f.calls.length, 0);
  assert.equal(f.store.listUnresolved().length, 1);
});

test('review never unfollows an unknown or recycled account identity', async t => {
  const f = fixture(t, '2026-10-28T01:00:00Z');
  const session = sessionAt(f.config, f.now());
  for (const username of ['missing_id', 'changed_id']) {
    f.store.addCandidates([username], f.now());
    const id = f.store.beginAction(username, 'follow', {now: f.now(), session});
    f.store.finishAction(id, {status: 'following', userId: username === 'changed_id' ? '100' : null, now: f.now()});
  }
  f.setNow('2026-11-04T01:00:00Z');
  f.browser.collectCandidates = async () => [];
  f.browser.inspect = async username => ({username, userId: '200', relationship: 'following', followsBack: false});
  await runSession(f);
  assert.equal(f.calls.length, 0);
  assert.equal(f.store.get('changed_id').excluded, true);
  assert.equal(f.store.get('missing_id').excluded, false);
});

test('recovered absent follow preserves the daily reservation without retrying', async t => {
  const f = fixture(t);
  f.store.addCandidates(['uncertain'], f.now());
  f.store.beginAction('uncertain', 'follow', {now: f.now(), session: sessionAt(f.config, f.now())});
  f.browser.inspect = async username => ({username, userId: '100', relationship: 'not_following', followsBack: null});
  assert.equal((await reconcileActions(f)).unresolved, 0);
  assert.equal(f.store.get('uncertain').excluded, true);
  assert.equal(f.store.budget(sessionAt(f.config, f.now()), f.config).dailyUsed, 1);
  assert.equal(f.calls.length, 0);
});

test('known numeric identity excludes a renamed account before a follow click', async t => {
  const f = fixture(t);
  f.store.addCandidates(['original'], f.now());
  const id = f.store.beginAction('original', 'follow', {now: f.now(), session: sessionAt(f.config, f.now())});
  f.store.finishAction(id, {status: 'following', userId: '999', now: f.now()});
  f.store.exclude('original', 'previously processed', f.now());
  f.browser.collectCandidates = async () => [{username: 'renamed'}];
  f.browser.follow = async username => {
    if (f.browser.shouldSkipIdentity('999', username)) return {status: 'skipped', userId: '999'};
    f.calls.push({kind: 'follow', username});
    return {status: 'following', userId: '999'};
  };
  await runSession(f);
  assert.equal(f.calls.length, 0);
  assert.equal(f.store.get('renamed').protected, true);
});

test('manual login tolerates a redirect observation but never suppresses a restriction', async () => {
  const browser = {
    guard: async () => {},
    assertAccount: async () => {
      throw new Error('Execution context was destroyed, most likely because of a navigation');
    }
  };
  assert.equal(await loginReady(browser), false);
  browser.assertAccount = async () => true;
  assert.equal(await loginReady(browser), true);
  browser.guard = async () => {
    throw Object.assign(new Error('Try again later'), {code: 'rate_limited'});
  };
  await assert.rejects(loginReady(browser), error => error.code === 'rate_limited');
});

test('deferred pending reviews rotate across days instead of starving later due relationships', async t => {
  const f = fixture(t);
  function seed(username, at, status, userId) {
    const now = new Date(at),
      session = sessionAt(f.config, now);
    assert.ok(f.store.budget(session, f.config).remaining > 0);
    f.store.addCandidates([username], now);
    const id = f.store.beginAction(username, 'follow', {now, session});
    f.store.finishAction(id, {status, userId, now});
  }
  for (let i = 0; i < 51; i++) {
    const at = i < 17 ? '2026-10-24T01:00:00Z' : i < 34 ? '2026-10-24T06:00:00Z' : i < 50 ? '2026-10-24T12:00:00Z' : '2026-10-25T01:00:00Z';
    seed(`pending${String(i).padStart(2, '0')}`, at, 'requested', String(1000 + i));
  }
  seed('later_due', '2026-10-25T06:00:00Z', 'following', '2000');
  const inspected = [];
  f.browser.collectCandidates = async () => [];
  f.browser.inspect = async username => {
    inspected.push(username);
    return {
      username,
      userId: username === 'later_due' ? '2000' : String(1000 + Number(username.slice(7))),
      relationship: username === 'later_due' ? 'following' : 'requested',
      followsBack: username === 'later_due' ? false : null
    };
  };
  const days = [];
  for (const date of ['2026-11-04', '2026-11-05']) {
    const start = inspected.length;
    for (const hour of ['01', '06', '12']) {
      f.setNow(`${date}T${hour}:00:00Z`);
      await runSession(f);
    }
    const rows = inspected.slice(start);
    assert.equal(rows.length, 51);
    assert.equal(new Set(rows).size, rows.length);
    days.push(rows);
  }
  assert.equal(days[0].includes('later_due'), false);
  assert.equal(days[1][0], 'later_due');
  assert.deepEqual(
    f.calls.map(c => [c.kind, c.username]),
    [['unfollow', 'later_due']]
  );
  f.setNow('2026-11-06T01:00:00Z');
  const start = inspected.length;
  await runSession(f);
  assert.equal(inspected[start], 'pending50');
  assert.equal(f.store.paused(), null);
});

test('competing CLI commands leave both an active worker and its existing pause unchanged', async t => {
  const f = fixture(t);
  const release = acquireLock(f.directory);
  try {
    for (const reason of [null, 'existing Instagram restriction']) {
      if (reason) f.store.pause(reason, f.now());
      const pause = f.store.paused();
      const lock = fs.readFileSync(path.join(f.directory, 'worker.lock'), 'utf8');
      for (const command of ['login', 'preview', 'run', 'daemon', 'reconcile']) {
        await assert.rejects(main([command, '--state-dir', f.directory]), /Another growth command/);
        assert.deepEqual(f.store.paused(), pause);
        assert.equal(fs.readFileSync(path.join(f.directory, 'worker.lock'), 'utf8'), lock);
      }
    }
  } finally {
    release();
  }
});

test('window expiry in follow preflight cancels only the undispatched intent and permits the next session', async t => {
  const f = fixture(t, '2026-11-04T03:59:59Z');
  const session = sessionAt(f.config, f.now());
  const follow = f.browser.follow;
  f.browser.follow = async username => {
    f.setNow('2026-11-04T04:00:01Z');
    f.browser.beforeMutation();
    return follow(username);
  };
  const result = await runSession(f);
  assert.equal(result.status, 'session-complete');
  assert.equal(result.follows, 0);
  assert.equal(f.calls.length, 0);
  assert.deepEqual(f.store.listUnresolved(), []);
  assert.equal(f.store.paused(), null);
  assert.equal(f.store.budget(session, f.config).dailyUsed, 0);
  assert.equal(f.store.get('person00').status, 'new');
  assert.equal(f.store.get('person00').protected, false);
  assert.equal(f.store.get('person00').excluded, false);
  const reopened = new GrowthStore(f.directory);
  try {
    assert.deepEqual(reopened.listUnresolved(), []);
    assert.equal(reopened.paused(), null);
    assert.equal(reopened.budget(session, f.config).remaining, 17);
    assert.equal(reopened.db.prepare('SELECT status FROM actions').get().status, 'cancelled');
  } finally {
    reopened.close();
  }
  f.browser.follow = follow;
  f.setNow('2026-11-04T06:00:00Z');
  assert.equal((await runSession(f)).follows, 17);
  assert.equal(f.calls[0].username, 'person00');
});

test('window expiry in unfollow preflight preserves the relationship and releases its reservation', async t => {
  const f = fixture(t, '2026-10-28T01:00:00Z');
  f.store.addCandidates(['managed'], f.now());
  const id = f.store.beginAction('managed', 'follow', {now: f.now(), session: sessionAt(f.config, f.now())});
  f.store.finishAction(id, {status: 'following', userId: '100', now: f.now()});
  f.setNow('2026-11-04T03:59:59Z');
  const session = sessionAt(f.config, f.now());
  const unfollow = f.browser.unfollow;
  f.browser.collectCandidates = async () => [];
  f.browser.unfollow = async username => {
    f.setNow('2026-11-04T04:00:01Z');
    f.browser.beforeMutation();
    return unfollow(username);
  };
  const result = await runSession(f);
  assert.equal(result.unfollows, 0);
  assert.equal(f.calls.length, 0);
  assert.deepEqual(f.store.listUnresolved(), []);
  assert.equal(f.store.paused(), null);
  assert.equal(f.store.unfollowCount(session), 0);
  assert.equal(f.store.get('managed').status, 'following');
  assert.equal(f.store.get('managed').excluded, false);
  assert.equal(f.store.get('managed').protected, false);
  f.browser.unfollow = unfollow;
  f.setNow('2026-11-05T01:00:00Z');
  assert.equal((await runSession(f)).unfollows, 1);
  assert.equal(f.calls[0].username, 'managed');
});

for (const phase of ['before guard', 'after dispatch', 'second guard after dispatch']) {
  test(`a window error ${phase} without proof of no dispatch remains uncertain`, async t => {
    const f = fixture(t, '2026-11-04T03:59:59Z');
    const session = sessionAt(f.config, f.now());
    f.browser.follow = async username => {
      if (phase !== 'before guard') {
        f.browser.beforeMutation();
        f.calls.push({kind: 'follow', username, at: f.now()});
      }
      f.setNow('2026-11-04T04:00:01Z');
      if (phase === 'second guard after dispatch') f.browser.beforeMutation();
      throw Object.assign(new Error('Window ended without a no-dispatch guarantee'), {code: 'WINDOW_ENDED'});
    };
    await assert.rejects(runSession(f), error => error.code === 'WINDOW_ENDED');
    assert.equal(f.store.listUnresolved().length, 1);
    assert.equal(f.store.budget(session, f.config).dailyUsed, 1);
    assert.match(f.store.paused().reason, /WINDOW_ENDED/);
    assert.equal(f.calls.length, phase === 'before guard' ? 0 : 1);
  });
}
