import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn, execFileSync} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {GrowthStore, DEFAULT_CONFIG, validateConfig, sessionAt} from '../../scripts/instagram-growth/core.mjs';
import {scheduledSessionDue, runDaemon} from '../../scripts/instagram-growth/scheduler.mjs';
import {acquireLock, waitForSpacing, runSession} from '../../scripts/instagram-growth/runner.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const config = validateConfig({
  ...DEFAULT_CONFIG,
  maxDelaySeconds: 59,
  sessionStartJitterMinutes: 60,
  sessions: DEFAULT_CONFIG.sessions.map(s => (s.name === 'morning' ? {...s, start: '09:00'} : s))
});
function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'growth-schedule-'));
  const store = new GrowthStore(directory);
  t.after(() => {
    store.close();
    fs.rmSync(directory, {recursive: true, force: true});
  });
  return {directory, store};
}
const date = value => new Date(value);

test('daily randomized starts persist across restarts and roll over in WIB', t => {
  const {store, directory} = fixture(t);
  const now = date('2026-11-05T02:00:00Z');
  const plan = store.scheduleSessions(config, now, () => 0);
  assert.deepEqual(
    plan.map(s => s.scheduledAt),
    ['2026-11-05T02:00:00.000Z', '2026-11-05T06:00:00.000Z', '2026-11-05T12:00:00.000Z']
  );
  const reopened = new GrowthStore(directory);
  try {
    assert.deepEqual(
      reopened.scheduleSessions(config, now, () => {
        throw new Error('rerolled');
      }),
      plan
    );
  } finally {
    reopened.close();
  }
  const tomorrow = store.scheduleSessions(config, date('2026-11-05T17:00:00Z'), () => 0.999999);
  assert.deepEqual(
    tomorrow.map(s => s.scheduledAt),
    ['2026-11-06T02:59:59.000Z', '2026-11-06T06:59:59.000Z', '2026-11-06T12:59:59.000Z']
  );
  assert.equal(store.report(config, now).schedule.length, 3);
});

test('late morning wake can use its current window, but expired windows never carry forward', t => {
  const {store} = fixture(t);
  store.scheduleSessions(config, date('2026-11-05T01:00:00Z'), () => 0.25);
  const due = at => scheduledSessionDue({store, config, now: date(at)});
  assert.equal(due('2026-11-05T02:14:59Z'), null);
  assert.equal(due('2026-11-05T02:50:00Z').name, 'morning');
  assert.equal(due('2026-11-05T04:00:00Z'), null);
  assert.equal(due('2026-11-05T06:14:59Z'), null);
  assert.equal(due('2026-11-05T06:15:00Z').name, 'afternoon');
  assert.equal(due('2026-11-05T16:00:00Z'), null);
});

test('a completed daemon window stays completed after reopening its database', async t => {
  const {store, directory} = fixture(t);
  const now = date('2026-11-05T02:50:00Z');
  store.scheduleSessions(config, now, () => 0);
  let calls = 0;
  const controller = new AbortController();
  await runDaemon({
    store,
    config,
    now: () => now,
    signal: controller.signal,
    run: async () => {
      calls++;
      return {status: 'session-complete', date: '2026-11-05', session: 'morning'};
    },
    wait: async () => controller.abort()
  });
  assert.equal(calls, 1);
  const reopened = new GrowthStore(directory);
  try {
    assert.equal(scheduledSessionDue({store: reopened, config, now}), null);
  } finally {
    reopened.close();
  }
  assert.equal(store.budget(sessionAt(config, now), config).dailyUsed, 0);
});

test('restriction pauses and unresolved intents prevent startup before opening a browser', async t => {
  const {store} = fixture(t);
  const now = date('2026-11-05T02:50:00Z');
  const pause = store.pause('Instagram restriction', now);
  let calls = 0;
  const args = {store, config, now: () => now, run: async () => calls++};
  await assert.rejects(runDaemon(args), /Paused/);
  assert.deepEqual(store.paused(), pause);
  assert.equal(calls, 0);
  store.resume();
  store.addCandidates(['uncertain'], now);
  store.beginAction('uncertain', 'follow', {now, session: sessionAt(config, now)});
  await assert.rejects(runDaemon(args), /Unresolved/);
  assert.equal(calls, 0);
  assert.equal(store.listUnresolved().length, 1);
});

test('30 to 59 second waits are bounded, saved once per result, and preserved on restart', async t => {
  const {store, directory} = fixture(t);
  let now = date('2026-11-05T02:00:00Z');
  const session = sessionAt(config, now);
  store.addCandidates(['first', 'second'], now);
  let id = store.beginAction('first', 'follow', {now, session});
  store.finishAction(id, {status: 'following', now});
  assert.equal(
    store.actionReadyAt(config, () => 0),
    '2026-11-05T02:00:30.000Z'
  );
  const reopened = new GrowthStore(directory);
  try {
    assert.equal(
      reopened.actionReadyAt(config, () => {
        throw new Error('rerolled');
      }),
      '2026-11-05T02:00:30.000Z'
    );
  } finally {
    reopened.close();
  }
  await waitForSpacing({
    store,
    config,
    browser: {guard: async () => {}},
    now: () => now,
    wait: async ms => {
      now = new Date(now.getTime() + ms);
    }
  });
  assert.equal(now.toISOString(), '2026-11-05T02:00:30.000Z');
  id = store.beginAction('second', 'follow', {now, session});
  store.finishAction(id, {status: 'following', now});
  assert.equal(
    store.actionReadyAt(config, () => 0.999999),
    '2026-11-05T02:01:29.000Z'
  );
  assert.equal(store.budget(session, config).dailyUsed, 2);
});

test('randomization validates ranges and remains optional for older configurations', () => {
  assert.equal(validateConfig(DEFAULT_CONFIG).maxDelaySeconds, 30);
  for (const changes of [{maxDelaySeconds: 29}, {maxDelaySeconds: 59.5}, {sessionStartJitterMinutes: -1}, {sessionStartJitterMinutes: 1000}])
    assert.throws(() => validateConfig({...DEFAULT_CONFIG, ...changes}));
});

test('daemon startup recovers only a proven stopped local lock', t => {
  const {directory} = fixture(t);
  const file = path.join(directory, 'worker.lock');
  fs.writeFileSync(file, JSON.stringify({pid: 2147483647, hostname: os.hostname()}));
  const release = acquireLock(directory, {recoverStale: true});
  assert.equal(JSON.parse(fs.readFileSync(file)).pid, process.pid);
  assert.throws(() => acquireLock(directory, {recoverStale: true}), /Another growth command/);
  release();
  fs.writeFileSync(file, JSON.stringify({pid: 2147483647, hostname: 'other-host'}));
  assert.throws(() => acquireLock(directory, {recoverStale: true}), /Another growth command/);
  assert.equal(JSON.parse(fs.readFileSync(file)).hostname, 'other-host');
});

test('an idle daemon handles SIGTERM without latching a pause or leaving a lock', {timeout: 15000}, async t => {
  const {directory, store} = fixture(t);
  const localHour = Number(new Intl.DateTimeFormat('en', {timeZone: 'Asia/Jakarta', hour: 'numeric', hourCycle: 'h23'}).format(new Date()));
  const base = localHour < 12 ? '15' : '01';
  const testConfig = {...DEFAULT_CONFIG, sessions: DEFAULT_CONFIG.sessions.map((s, i) => ({...s, start: `${base}:0${i * 2}`, end: `${base}:0${i * 2 + 1}`}))};
  const file = path.join(directory, 'config.json');
  fs.writeFileSync(file, JSON.stringify(testConfig));
  const child = spawn(
    process.execPath,
    ['--disable-warning=ExperimentalWarning', path.join(root, 'scripts/instagram-growth.mjs'), 'daemon', '--config', file, '--state-dir', directory],
    {stdio: ['ignore', 'pipe', 'pipe']}
  );
  t.after(() => {
    if (child.exitCode === null) child.kill('SIGKILL');
  });
  let output = '',
    errors = '';
  child.stderr.on('data', chunk => (errors += chunk));
  await new Promise((resolve, reject) => {
    child.stdout.on('data', chunk => {
      output += chunk;
      if (output.includes('daemon-started')) resolve();
    });
    child.once('error', reject);
    child.once('exit', code => reject(new Error(`daemon exited early: ${code} ${errors}`)));
  });
  const exit = once(child, 'exit');
  child.kill('SIGTERM');
  assert.equal((await exit)[0], 0, errors);
  assert.equal(store.paused(), null);
  assert.deepEqual(store.listUnresolved(), []);
  assert.equal(fs.existsSync(path.join(directory, 'worker.lock')), false);
  assert.match(output, /daemon-stopped/);
});

test('starting a paused CLI preserves its original restriction reason', t => {
  const {directory, store} = fixture(t);
  const pause = store.pause('original Instagram challenge');
  assert.throws(() => execFileSync(process.execPath, [path.join(root, 'scripts/instagram-growth.mjs'), 'daemon', '--state-dir', directory], {stdio: 'pipe'}));
  assert.deepEqual(store.paused(), pause);
});

test('operator stop keeps an uncertain submitted action reserved and paused', async t => {
  const {store} = fixture(t);
  const now = date('2026-11-05T02:00:00Z');
  const controller = new AbortController();
  const browser = {
    guard: async () => {},
    assertAccount: async () => {},
    collectCandidates: async () => [{username: 'target'}],
    follow: async () => {
      controller.abort(new Error('Operator stop'));
      throw controller.signal.reason;
    }
  };
  await assert.rejects(runSession({store, browser, config, now: () => now, signal: controller.signal}), /Operator stop/);
  assert.equal(store.listUnresolved().length, 1);
  assert.equal(store.budget(sessionAt(config, now), config).dailyUsed, 1);
  assert.ok(store.paused());
});

test('sleep during browser launch cannot execute a different window before its target', async t => {
  const {store} = fixture(t);
  const expectedSession = sessionAt(config, date('2026-11-05T02:50:00Z'));
  const result = await runSession({
    store,
    config,
    browser: {
      guard: async () => {
        throw new Error('browser must stay unused');
      }
    },
    now: () => date('2026-11-05T06:00:00Z'),
    expectedSession
  });
  assert.equal(result.status, 'outside-window');
  assert.equal(store.paused(), null);
  assert.deepEqual(store.listUnresolved(), []);
});

test('the daemon never records completion against a mismatched session result', async t => {
  const {store} = fixture(t);
  const now = date('2026-11-05T02:50:00Z');
  store.scheduleSessions(config, now, () => 0);
  await assert.rejects(
    runDaemon({store, config, now: () => now, run: async () => ({status: 'session-complete', date: '2026-11-05', session: 'afternoon'})}),
    /does not match/
  );
  assert.equal(
    store.plannedSessions(now).every(row => row.completedAt === null),
    true
  );
});
