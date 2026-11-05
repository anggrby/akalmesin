import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';

const contention = () => new Error('Another growth command owns worker.lock. If it crashed, use the unlock command after checking that it stopped.');

// SQLite serializes the short filesystem operation across processes and releases
// its OS lock on a crash. The guard is not held while the browser is running.
function withGuard(directory, operation) {
  fs.mkdirSync(directory, {recursive: true, mode: 0o700});
  const file = path.join(directory, 'worker-lock.sqlite');
  const oldMask = process.umask(0o077);
  let db;
  try {
    db = new DatabaseSync(file);
    fs.chmodSync(file, 0o600);
    db.exec('PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS mutex (id INTEGER PRIMARY KEY); BEGIN IMMEDIATE;');
    try {
      const result = operation();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  } finally {
    try {
      db?.close();
    } finally {
      process.umask(oldMask);
    }
  }
}

function snapshot(file) {
  let handle;
  try {
    handle = fs.openSync(file, 'r');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  try {
    return {owner: JSON.parse(fs.readFileSync(handle, 'utf8')), stat: fs.fstatSync(handle, {bigint: true})};
  } finally {
    fs.closeSync(handle);
  }
}

function removeOwned(file, expected) {
  let current;
  try {
    current = snapshot(file);
  } catch (error) {
    if (error instanceof SyntaxError) return false;
    throw error;
  }
  if (
    !current ||
    current.stat.dev !== expected.stat.dev ||
    current.stat.ino !== expected.stat.ino ||
    current.owner.token !== expected.owner.token ||
    current.owner.pid !== expected.owner.pid ||
    current.owner.hostname !== expected.owner.hostname
  )
    return false;
  fs.unlinkSync(file);
  return true;
}

function reclaimStopped(file) {
  const current = snapshot(file);
  if (!current) return false;
  const {owner} = current;
  if (owner.hostname !== os.hostname() || !Number.isInteger(owner.pid) || owner.pid <= 0)
    throw new Error('Cannot verify this lock owner. Inspect worker.lock manually.');
  try {
    process.kill(owner.pid, 0);
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
    return removeOwned(file, current);
  }
  throw new Error(`Worker PID ${owner.pid} is still running. Stop it before unlocking.`);
}

export function acquireLock(directory, {recoverStale = false} = {}) {
  const file = path.join(directory, 'worker.lock');
  const owned = withGuard(directory, () => {
    let handle;
    try {
      handle = fs.openSync(file, 'wx', 0o600);
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (!recoverStale) throw contention();
      let reclaimed = false;
      try {
        reclaimed = reclaimStopped(file);
      } catch {
        /* Live/unverifiable owners remain locked. */
      }
      if (!reclaimed) throw contention();
      handle = fs.openSync(file, 'wx', 0o600);
    }
    const stat = fs.fstatSync(handle, {bigint: true});
    const owner = {pid: process.pid, hostname: os.hostname(), startedAt: new Date().toISOString(), token: randomUUID()};
    try {
      fs.writeFileSync(handle, JSON.stringify(owner));
    } catch (error) {
      const current = fs.statSync(file, {bigint: true});
      if (current.dev === stat.dev && current.ino === stat.ino) fs.unlinkSync(file);
      throw error;
    } finally {
      fs.closeSync(handle);
    }
    return {owner, stat};
  });
  return () => withGuard(directory, () => removeOwned(file, owned));
}

export function unlockStoppedWorker(directory) {
  const file = path.join(directory, 'worker.lock');
  if (!fs.existsSync(file)) return false;
  return withGuard(directory, () => reclaimStopped(file));
}
