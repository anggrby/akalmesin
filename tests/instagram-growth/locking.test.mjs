import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fork} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {setTimeout as sleep} from 'node:timers/promises';
import {acquireLock} from '../../scripts/instagram-growth/runner.mjs';

async function until(check, description) {
  const end = Date.now() + 8000;
  while (!check()) {
    if (Date.now() > end) throw new Error(`Timed out: ${description}`);
    await sleep(10);
  }
}
function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'growth-lock-race-'));
  const children = [];
  t.after(async () => {
    for (const child of children)
      if (child.exitCode === null && child.signalCode === null) {
        const exit = once(child, 'exit');
        child.kill('SIGKILL');
        await exit;
      }
    fs.rmSync(directory, {recursive: true, force: true});
  });
  const file = path.join(directory, 'worker.lock');
  fs.writeFileSync(file, JSON.stringify({pid: 2147483647, hostname: os.hostname()}));
  function start(operation = 'acquire', block = false) {
    const child = fork(fileURLToPath(new URL('./fixtures/lock-contender.mjs', import.meta.url)), [directory, operation, String(block)], {
      silent: true,
      execArgv: ['--disable-warning=ExperimentalWarning']
    });
    child.messages = [];
    child.on('message', message => child.messages.push(message));
    children.push(child);
    return child;
  }
  return {directory, file, start};
}
for (const operation of ['acquire', 'unlock']) {
  test(`lock recovery serializes a concurrent ${operation} against a replacement owner`, {timeout: 15000}, async t => {
    const f = fixture(t);
    const a = f.start(operation, true);
    await until(() => fs.existsSync(path.join(f.directory, 'probe-reached')), 'stale PID checked');
    const b = f.start();
    await until(() => b.messages.some(m => m.event === 'attempting'), 'contender started');
    await sleep(300);
    assert.equal(
      b.messages.some(m => m.event === 'acquired'),
      false,
      'contender must wait for the entire reclamation operation'
    );
    fs.writeFileSync(path.join(f.directory, 'continue-probe'), 'continue');
    if (operation === 'acquire') {
      await until(() => a.messages.some(m => m.event === 'acquired') && b.messages.some(m => m.event === 'failed'), 'one owner wins');
      assert.equal(JSON.parse(fs.readFileSync(f.file)).pid, a.pid);
      assert.match(b.messages.find(m => m.event === 'failed').message, /Another growth command/);
    } else {
      await until(() => a.messages.some(m => m.event === 'unlocked') && b.messages.some(m => m.event === 'acquired'), 'unlock finishes before replacement');
      assert.equal(JSON.parse(fs.readFileSync(f.file)).pid, b.pid);
      a.send('release');
      await until(() => a.messages.some(m => m.event === 'released'), 'unlock process exits');
      assert.equal(JSON.parse(fs.readFileSync(f.file)).pid, b.pid);
    }
  });
}

test('release is conditional on the exact lock instance, including repeated release', async t => {
  const f = fixture(t);
  fs.rmSync(f.file);
  const first = acquireLock(f.directory);
  const firstOwner = JSON.parse(fs.readFileSync(f.file));
  assert.equal(fs.statSync(path.join(f.directory, 'worker-lock.sqlite')).mode & 0o777, 0o600);
  fs.rmSync(f.file);
  const second = acquireLock(f.directory);
  const secondOwner = JSON.parse(fs.readFileSync(f.file));
  assert.notEqual(secondOwner.token, firstOwner.token);
  assert.equal(first(), false);
  assert.deepEqual(JSON.parse(fs.readFileSync(f.file)), secondOwner);
  assert.equal(second(), true);
  assert.equal(second(), false);
});

test('a crashed reclaimer releases its serialization guard for the next startup', {timeout: 15000}, async t => {
  const f = fixture(t);
  const a = f.start('acquire', true);
  await until(() => fs.existsSync(path.join(f.directory, 'probe-reached')), 'reclaimer at probe');
  const b = f.start();
  await until(() => b.messages.some(m => m.event === 'attempting'), 'contender at guard');
  const exit = once(a, 'exit');
  a.kill('SIGKILL');
  await exit;
  await until(() => b.messages.some(m => m.event === 'acquired'), 'contender recovers after crash');
  assert.equal(JSON.parse(fs.readFileSync(f.file)).pid, b.pid);
});
