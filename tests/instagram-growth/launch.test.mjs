import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {setImmediate as nextTurn} from 'node:timers/promises';
import {main} from '../../scripts/instagram-growth/cli.mjs';
import {InstagramBrowser} from '../../scripts/instagram-growth/browser.mjs';
import {GrowthStore, DEFAULT_CONFIG} from '../../scripts/instagram-growth/core.mjs';

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'growth-launch-recovery-'));
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  const config = path.join(directory, 'config.json');
  fs.writeFileSync(config, JSON.stringify(DEFAULT_CONFIG));
  return {directory, args: ['daemon', '--config', config, '--state-dir', directory]};
}

test('CLI retries a transient first browser launch and verifies the replacement before work', {timeout: 10000}, async t => {
  const f = fixture(t);
  t.mock.timers.enable({apis: ['setTimeout', 'Date'], now: new Date('2026-11-05T01:00:00Z')});
  const events = [];
  let attempts = 0;
  t.mock.method(InstagramBrowser, 'launch', async () => {
    events.push('launch');
    if (++attempts === 1) throw Object.assign(new Error('Browser context was closed while starting'), {name: 'TargetClosedError'});
    return {
      page: {goto: async () => events.push('navigate')},
      withReadRecovery: operation => operation(),
      poll: check => check(),
      assertAccount: async () => {
        events.push('account-verified');
        return true;
      },
      guard: async () => events.push('guard'),
      collectCandidates: async () => {
        events.push('read-candidates');
        return [];
      },
      close: async () => {
        events.push('close');
        process.emit('SIGTERM');
      }
    };
  });
  {
    const task = main(f.args).then(
      () => ({error: null}),
      error => ({error})
    );
    await nextTurn();
    assert.equal(attempts, 1);
    t.mock.timers.tick(30000);
    const result = await task;
    assert.ifError(result.error);
    assert.equal(attempts, 2);
    assert.ok(events.indexOf('account-verified') < events.indexOf('read-candidates'));
    assert.ok(events.indexOf('navigate') < events.indexOf('account-verified'));
    const store = new GrowthStore(f.directory);
    try {
      assert.equal(store.paused(), null);
      assert.deepEqual(store.listUnresolved(), []);
    } finally {
      store.close();
    }
  }
});

for (const message of ['ProcessSingleton: profile is already in use', 'Permission denied while opening user data directory']) {
  test(`CLI retains a hard stop for browser startup configuration: ${message}`, async t => {
    const f = fixture(t);
    t.mock.timers.enable({apis: ['setTimeout', 'Date'], now: new Date('2026-11-05T01:00:00Z')});
    let attempts = 0;
    const failure = Object.assign(new Error(message), {name: 'TargetClosedError'});
    t.mock.method(InstagramBrowser, 'launch', async () => {
      attempts++;
      throw failure;
    });
    await assert.rejects(main(f.args), error => error === failure);
    const store = new GrowthStore(f.directory);
    try {
      assert.equal(attempts, 1);
      assert.ok(store.paused());
      assert.deepEqual(store.listUnresolved(), []);
    } finally {
      store.close();
    }
  });
}

test('a challenge found in the replacement browser stops launch recovery before work', {timeout: 10000}, async t => {
  const f = fixture(t);
  t.mock.timers.enable({apis: ['setTimeout', 'Date'], now: new Date('2026-11-05T01:00:00Z')});
  let attempts = 0,
    sourceReads = 0;
  const challenge = Object.assign(new Error('Instagram requires verification'), {code: 'challenge'});
  t.mock.method(InstagramBrowser, 'launch', async () => {
    if (++attempts === 1) throw Object.assign(new Error('Browser context closed during startup'), {name: 'TargetClosedError'});
    return {
      page: {goto: async () => {}},
      withReadRecovery: operation => operation(),
      poll: check => check(),
      assertAccount: async () => {
        throw challenge;
      },
      collectCandidates: async () => {
        sourceReads++;
        return [];
      },
      close: async () => {}
    };
  });
  {
    const task = main(f.args).then(
      () => null,
      error => error
    );
    await nextTurn();
    t.mock.timers.tick(30000);
    assert.equal(await task, challenge);
  }
  const store = new GrowthStore(f.directory);
  try {
    assert.equal(attempts, 2);
    assert.equal(sourceReads, 0);
    assert.match(store.paused().reason, /challenge/);
    assert.deepEqual(store.listUnresolved(), []);
  } finally {
    store.close();
  }
});
