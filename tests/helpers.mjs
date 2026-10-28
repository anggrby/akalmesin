import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {ROOT, readJSON, writeJSON} from '../scripts/core.mjs';
export const KIMI = path.join(ROOT, 'content/posts/2026-10-28-kimi-k3-1-pro');
/** Copy the Kimi fixture (without out/) into a temp folder; tests never touch the real post. */
export function tmpPost({fresh = true} = {}) {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'akalmesin-')), '2026-10-28-kimi-k3-1-pro');
  fs.cpSync(KIMI, dir, {recursive: true, filter: s => !s.includes(path.sep + 'out')});
  if (fresh) {
    const wf = readJSON(path.join(dir, 'workflow.json'));
    wf.approvals = {selected: null, copy: null, final: null};
    wf.notion = null;
    wf.history = [];
    writeJSON(path.join(dir, 'workflow.json'), wf);
    fs.rmSync(path.join(dir, 'edits.log.md'), {force: true});
  }
  return dir;
}
