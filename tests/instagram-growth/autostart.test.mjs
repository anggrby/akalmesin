import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {launchAgentDefinition, launchAgentPlist, manageAutostart, LABEL} from '../../scripts/instagram-growth/autostart.mjs';

function fixture(t) {
  const homeDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'growth-launch-'));
  t.after(() => fs.rmSync(homeDirectory, {recursive: true, force: true}));
  const calls = [];
  let loaded = false;
  const execute = (program, args) => {
    calls.push({program, args});
    if (args[0] === 'print') {
      if (!loaded) throw Object.assign(new Error('not loaded'), {status: 113});
      return 'state = running\npid = 123\n';
    }
    if (args[0] === 'bootstrap') loaded = true;
    if (args[0] === 'bootout') loaded = false;
    return '';
  };
  const options = {
    root: '/tmp/repo & name',
    stateDirectory: path.join(homeDirectory, 'state'),
    configPath: '/tmp/config.json',
    nodePath: process.execPath,
    homeDirectory,
    platform: 'darwin',
    uid: 501,
    environment: {NOTION_UPLOAD_TOKEN: 'never-copy', AKALMESIN_CHROME_PATH: '/tmp/browser'},
    execute
  };
  return {options, calls};
}

test('login job uses exact Node and argv paths, headless daemon, and no secret environment', t => {
  const {options} = fixture(t);
  const job = launchAgentDefinition(options);
  assert.equal(job.RunAtLoad, true);
  assert.equal(job.KeepAlive, false);
  assert.equal(job.ProgramArguments[0], process.execPath);
  assert.equal(job.ProgramArguments[3], 'daemon');
  assert.equal(job.WorkingDirectory, options.root);
  assert.deepEqual(job.EnvironmentVariables, {AKALMESIN_CHROME_PATH: '/tmp/browser'});
  assert.equal(JSON.stringify(job).includes('never-copy'), false);
  assert.match(launchAgentPlist(options), /repo &amp; name/);
  assert.throws(() => launchAgentDefinition({...options, nodePath: 'node'}), /absolute/);
});

test('install is idempotent and uninstall retains all private worker state', t => {
  const {options, calls} = fixture(t);
  const first = manageAutostart({...options, action: 'install'});
  assert.equal(first.loaded, true);
  assert.equal(first.installed, true);
  assert.equal(fs.statSync(first.file).mode & 0o777, 0o600);
  fs.writeFileSync(path.join(options.stateDirectory, 'keep.sqlite'), 'private state');
  manageAutostart({...options, action: 'install'});
  assert.equal(calls.filter(c => c.args[0] === 'bootstrap').length, 1);
  assert.equal(
    calls.some(c => c.program === '/usr/bin/plutil'),
    true
  );
  const stopped = manageAutostart({...options, action: 'uninstall'});
  assert.equal(stopped.installed, false);
  assert.equal(stopped.loaded, false);
  assert.equal(fs.readFileSync(path.join(options.stateDirectory, 'keep.sqlite'), 'utf8'), 'private state');
});

test('foreign job content is preserved and start never force-kills a running job', t => {
  const {options, calls} = fixture(t);
  const installed = manageAutostart({...options, action: 'install'});
  manageAutostart({...options, action: 'start'});
  assert.deepEqual(calls.find(c => c.args[0] === 'kickstart').args, ['kickstart', `gui/501/${LABEL}`]);
  fs.writeFileSync(installed.file, 'owner-edited job');
  assert.throws(() => manageAutostart({...options, action: 'start'}), /differs/);
  assert.throws(() => manageAutostart({...options, action: 'install'}), /different LaunchAgent/);
  assert.throws(() => manageAutostart({...options, action: 'uninstall'}), /differs/);
  assert.equal(fs.readFileSync(installed.file, 'utf8'), 'owner-edited job');
  assert.throws(() => manageAutostart({...options, platform: 'linux', action: 'install'}), /macOS/);
});

test('startup status does not mistake a permission failure for an absent job', t => {
  const {options} = fixture(t);
  assert.throws(
    () =>
      manageAutostart({
        ...options,
        action: 'status',
        execute: () => {
          throw Object.assign(new Error('permission denied'), {status: 1});
        }
      }),
    /permission denied/
  );
});

test('the generated login definition passes the native Apple plist parser', {skip: process.platform !== 'darwin'}, t => {
  const {options} = fixture(t);
  const file = path.join(options.homeDirectory, 'validation.plist');
  fs.writeFileSync(file, launchAgentPlist(options));
  assert.match(execFileSync('/usr/bin/plutil', ['-lint', file], {encoding: 'utf8'}), /OK/);
});
