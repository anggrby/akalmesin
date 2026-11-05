import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {GrowthStore, DEFAULT_CONFIG, sessionAt} from '../../scripts/instagram-growth/core.mjs';
import {runSession} from '../../scripts/instagram-growth/runner.mjs';
import {runDaemon} from '../../scripts/instagram-growth/scheduler.mjs';
import {GrowthReadInterrupted, isTransientBrowserError, interruptedRead} from '../../scripts/instagram-growth/recovery.mjs';

function fixture(t, instant = '2026-11-05T01:00:00Z') {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'growth-recovery-'));
  const store = new GrowthStore(directory);
  t.after(() => {
    store.close();
    fs.rmSync(directory, {recursive: true, force: true});
  });
  let time = new Date(instant);
  const calls = [],
    controller = new AbortController();
  const now = () => new Date(time);
  const browser = {
    guard: async () => {},
    assertAccount: async () => {},
    collectCandidates: async () => [{username: 'alice'}, {username: 'bob'}],
    follow: async username => {
      browser.beforeMutation();
      calls.push(username);
      return {status: 'following', userId: username === 'alice' ? '101' : '102'};
    },
    inspect: async username => ({username, userId: '100', relationship: 'following', followsBack: false}),
    unfollow: async username => {
      browser.beforeMutation();
      calls.push(username);
      return {status: 'unfollowed'};
    }
  };
  return {
    directory,
    store,
    config: DEFAULT_CONFIG,
    browser,
    calls,
    controller,
    signal: controller.signal,
    now,
    wait: async ms => {
      time = new Date(time.getTime() + ms);
    },
    setNow: value => {
      time = new Date(value);
    }
  };
}

function connectionError() {
  return new Error('page.goto: net::ERR_INTERNET_DISCONNECTED');
}

test('wake recovery: confirmed follows survive a retry without duplicate clicks or reset allowances', async t => {
  const f = fixture(t);
  let interrupted = false;
  const follow = f.browser.follow;
  f.browser.follow = async username => {
    if (username === 'bob' && !interrupted) {
      interrupted = true;
      throw new GrowthReadInterrupted(connectionError());
    }
    return follow(username);
  };
  const attempts = [],
    wait = async ms => {
      attempts.push(ms);
      await f.wait(ms);
      if (f.calls.length === 2) f.controller.abort();
    };
  await runDaemon({...f, wait, run: session => runSession({...f, expectedSession: session})});
  assert.deepEqual(f.calls, ['alice', 'bob']);
  assert.deepEqual(
    f.store.db
      .prepare('SELECT status FROM actions ORDER BY id')
      .all()
      .map(row => row.status),
    ['following', 'cancelled', 'following']
  );
  assert.equal(f.store.budget(sessionAt(f.config, f.now()), f.config).dailyUsed, 2);
  assert.equal(f.store.paused(), null);
  assert.deepEqual(f.store.listUnresolved(), []);
  assert.ok(f.store.plannedSessions(f.now()).find(row => row.name === 'morning').completedAt);
  const reopened = new GrowthStore(f.directory);
  try {
    assert.equal(reopened.budget(sessionAt(f.config, f.now()), f.config).dailyUsed, 2);
  } finally {
    reopened.close();
  }
});

test('wake recovery: an interrupted read before an action does not latch a permanent pause', async t => {
  const f = fixture(t);
  let attempts = 0;
  f.browser.collectCandidates = async () => {
    if (++attempts === 1) throw connectionError();
    return [{username: 'alice'}];
  };
  await runDaemon({
    ...f,
    run: session => runSession({...f, expectedSession: session}),
    wait: async ms => {
      await f.wait(ms);
      if (f.calls.length) f.controller.abort();
    }
  });
  assert.deepEqual(f.calls, ['alice']);
  assert.equal(attempts, 2);
  assert.equal(f.store.paused(), null);
});

test('wake recovery: interrupted Unfollow review is eligible again and clicks only once', async t => {
  const f = fixture(t, '2026-10-28T01:00:00Z');
  f.store.addCandidates(['managed'], f.now());
  const id = f.store.beginAction('managed', 'follow', {now: f.now(), session: sessionAt(f.config, f.now())});
  f.store.finishAction(id, {status: 'following', userId: '100', now: f.now()});
  f.setNow('2026-11-05T01:00:00Z');
  f.browser.collectCandidates = async () => [];
  let attempts = 0;
  const unfollow = f.browser.unfollow;
  f.browser.unfollow = async username => {
    if (++attempts === 1) throw new GrowthReadInterrupted(connectionError());
    return unfollow(username);
  };
  await runDaemon({
    ...f,
    run: session => runSession({...f, expectedSession: session}),
    wait: async ms => {
      await f.wait(ms);
      if (f.calls.length) f.controller.abort();
    }
  });
  assert.equal(attempts, 2);
  assert.deepEqual(f.calls, ['managed']);
  assert.equal(f.store.unfollowCount(sessionAt(f.config, f.now())), 1);
  assert.equal(f.store.get('managed').excluded, true);
  assert.equal(f.store.paused(), null);
});

test('wake recovery: a possibly submitted click still pauses and reserves its allowance', async t => {
  const f = fixture(t);
  f.browser.follow = async username => {
    f.browser.beforeMutation();
    f.calls.push(username);
    throw connectionError();
  };
  await assert.rejects(runDaemon({...f, run: session => runSession({...f, expectedSession: session})}), /ERR_INTERNET_DISCONNECTED/);
  assert.deepEqual(f.calls, ['alice']);
  assert.equal(f.store.listUnresolved().length, 1);
  assert.equal(f.store.budget(sessionAt(f.config, f.now()), f.config).dailyUsed, 1);
  assert.ok(f.store.paused());
});

test('wake recovery: a restriction found during a failed read stops recovery', async t => {
  const f = fixture(t);
  f.browser.collectCandidates = async () => {
    f.browser.guard = async () => {
      throw Object.assign(new Error('Instagram restriction'), {code: 'rate_limited'});
    };
    throw connectionError();
  };
  await assert.rejects(runDaemon({...f, run: session => runSession({...f, expectedSession: session})}), error => error.code === 'rate_limited');
  assert.match(f.store.paused().reason, /rate_limited/);
  assert.deepEqual(f.calls, []);
});

test('wake recovery: connection retries back off without marking the window completed', async t => {
  const f = fixture(t);
  let attempts = 0;
  const waits = [],
    retries = [];
  await runDaemon({
    ...f,
    log: event => {
      if (event.event === 'waiting-for-connection') retries.push(event.retrySeconds);
    },
    run: async session => {
      if (++attempts <= 5) throw new GrowthReadInterrupted(connectionError());
      return {status: 'session-complete', date: session.date, session: session.name};
    },
    wait: async ms => {
      waits.push(ms);
      await f.wait(ms);
      if (attempts > 5) f.controller.abort();
    }
  });
  assert.deepEqual(retries, [30, 60, 120, 240, 300]);
  assert.equal(
    waits.every(ms => ms <= 30000),
    true
  );
  assert.equal(f.store.paused(), null);
});

test('wake recovery: waking in a later window does not carry over the earlier batch', async t => {
  const f = fixture(t);
  const sessions = [];
  await runDaemon({
    ...f,
    run: async session => {
      sessions.push(session.name);
      if (sessions.length === 1) throw new GrowthReadInterrupted(connectionError());
      return {status: 'session-complete', date: session.date, session: session.name};
    },
    wait: async () => {
      if (sessions.length === 1) f.setNow('2026-11-05T06:20:00Z');
      else f.controller.abort();
    }
  });
  assert.deepEqual(sessions, ['morning', 'afternoon']);
  const plan = f.store.plannedSessions(f.now());
  assert.equal(plan.find(row => row.name === 'morning').completedAt, null);
  assert.ok(plan.find(row => row.name === 'afternoon').completedAt);
});

test('wake recovery: UI timeouts and coded restrictions never count as transport errors', () => {
  assert.equal(isTransientBrowserError(Object.assign(new Error('locator.click: Timeout 2000ms exceeded'), {name: 'TimeoutError'})), false);
  assert.equal(isTransientBrowserError(Object.assign(connectionError(), {code: 'http_blocked'})), false);
  assert.equal(isTransientBrowserError(Object.assign(new Error('page.goto: Timeout 30000ms exceeded'), {name: 'TimeoutError'})), true);
});

test('wake recovery: only a Chromium internal network-error page can bypass an unreadable warning probe', async () => {
  const domainError = Object.assign(new Error('Browser left Instagram'), {code: 'unexpected_domain'});
  const browser = {
    page: {url: () => 'chrome-error://chromewebdata/'},
    guard: async () => {
      throw domainError;
    }
  };
  assert.ok((await interruptedRead(browser, connectionError())) instanceof GrowthReadInterrupted);
  browser.page.url = () => 'https://example.com/';
  await assert.rejects(interruptedRead(browser, connectionError()), error => error === domainError);
  browser.page.url = () => 'chrome-error://chromewebdata/';
  browser.networkStop = Object.assign(new Error('HTTP 429'), {code: 'rate_limited'});
  await assert.rejects(interruptedRead(browser, connectionError()), error => error === browser.networkStop);
});

test('wake recovery: a long sleep consumes the recovery delay instead of adding it after wake', async t => {
  const f = fixture(t);
  let attempts = 0,
    slept = false;
  await runDaemon({
    ...f,
    run: async session => {
      if (++attempts <= 3) throw new GrowthReadInterrupted(connectionError());
      assert.equal(f.now().toISOString(), '2026-11-05T02:20:00.000Z');
      return {status: 'session-complete', date: session.date, session: session.name};
    },
    wait: async ms => {
      assert.ok(ms <= 30000);
      if (attempts === 3 && !slept) {
        slept = true;
        f.setNow('2026-11-05T02:20:00Z');
      } else {
        await f.wait(ms);
        if (attempts > 3) f.controller.abort();
      }
    }
  });
  assert.equal(attempts, 4);
  assert.equal(f.store.paused(), null);
});
