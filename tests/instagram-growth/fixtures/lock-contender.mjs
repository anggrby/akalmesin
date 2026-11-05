import fs from 'node:fs';
import path from 'node:path';
import {acquireLock, unlockStoppedWorker} from '../../../scripts/instagram-growth/runner.mjs';

const [directory, operation = 'acquire', blockProbe = 'false'] = process.argv.slice(2);
if (blockProbe === 'true') {
  const probe = process.kill.bind(process);
  process.kill = (pid, signal) => {
    try {
      return probe(pid, signal);
    } catch (error) {
      if (pid === 2147483647 && signal === 0 && error.code === 'ESRCH') {
        fs.writeFileSync(path.join(directory, 'probe-reached'), 'ready');
        const buffer = new Int32Array(new SharedArrayBuffer(4));
        const deadline = Date.now() + 10000;
        while (!fs.existsSync(path.join(directory, 'continue-probe'))) {
          if (Date.now() >= deadline) throw new Error('Probe barrier timed out');
          Atomics.wait(buffer, 0, 0, 10);
        }
      }
      throw error;
    }
  };
}
process.send({event: 'attempting'});
try {
  let release;
  if (operation === 'unlock') {
    const unlocked = unlockStoppedWorker(directory);
    process.send({event: 'unlocked', unlocked});
  } else {
    release = acquireLock(directory, {recoverStale: true});
    process.send({event: 'acquired', pid: process.pid});
  }
  process.on('message', message => {
    if (message === 'release') {
      const removed = release?.();
      process.send({event: 'released', removed}, () => process.exit(0));
    }
  });
} catch (error) {
  process.send({event: 'failed', message: error.message}, () => process.exit(0));
}
