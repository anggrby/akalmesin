import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';

export const LABEL = 'com.akalmesin.instagram-growth';
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'})[c]);
const xml = value => {
  if (typeof value === 'boolean') return value ? '<true/>' : '<false/>';
  if (typeof value === 'number') return `<integer>${value}</integer>`;
  if (typeof value === 'string') return `<string>${escape(value)}</string>`;
  if (Array.isArray(value)) return `<array>${value.map(xml).join('')}</array>`;
  return `<dict>${Object.entries(value)
    .map(([key, entry]) => `<key>${escape(key)}</key>${xml(entry)}`)
    .join('')}</dict>`;
};

export function launchAgentDefinition({root, stateDirectory, configPath, nodePath = process.execPath, environment = process.env}) {
  for (const value of [root, stateDirectory, configPath, nodePath]) if (!path.isAbsolute(value)) throw new Error('LaunchAgent paths must be absolute');
  const vars = {};
  for (const key of ['AKALMESIN_CHROME_PATH', 'PLAYWRIGHT_BROWSERS_PATH']) if (environment[key]) vars[key] = environment[key];
  return {
    Label: LABEL,
    ProgramArguments: [
      nodePath,
      '--disable-warning=ExperimentalWarning',
      path.join(root, 'scripts/instagram-growth.mjs'),
      'daemon',
      '--config',
      configPath,
      '--state-dir',
      stateDirectory
    ],
    WorkingDirectory: root,
    RunAtLoad: true,
    KeepAlive: false,
    ProcessType: 'Background',
    ExitTimeOut: 60,
    StandardOutPath: path.join(stateDirectory, 'worker.log'),
    StandardErrorPath: path.join(stateDirectory, 'worker.log'),
    ...(Object.keys(vars).length ? {EnvironmentVariables: vars} : {})
  };
}

export function launchAgentPlist(options) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">${xml(launchAgentDefinition(options))}</plist>
`;
}

export function manageAutostart({
  action,
  root,
  stateDirectory,
  configPath,
  nodePath = process.execPath,
  homeDirectory = os.homedir(),
  platform = process.platform,
  uid = process.getuid?.(),
  environment = process.env,
  execute = execFileSync
}) {
  if (platform !== 'darwin') throw new Error('Automatic login startup is supported only on macOS');
  if (!['install', 'status', 'start', 'uninstall'].includes(action)) throw new Error('Invalid autostart action');
  const file = path.join(homeDirectory, 'Library/LaunchAgents', `${LABEL}.plist`);
  const domain = `gui/${uid}`,
    target = `${domain}/${LABEL}`;
  const call = (program, args) => execute(program, args, {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']});
  const inspect = () => {
    try {
      const output = call('/bin/launchctl', ['print', target]);
      return {loaded: true, pid: Number(output.match(/\bpid = (\d+)/)?.[1]) || null};
    } catch (error) {
      if (error.status === 113 || /could not find service/i.test(String(error.stderr))) return {loaded: false, pid: null};
      throw error;
    }
  };
  const desired = launchAgentPlist({root, stateDirectory, configPath, nodePath, environment});
  if (action === 'install') {
    if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') !== desired)
      throw new Error('A different LaunchAgent already uses this label. Inspect it before replacing it.');
    fs.accessSync(nodePath, fs.constants.X_OK);
    fs.mkdirSync(path.dirname(file), {recursive: true, mode: 0o700});
    fs.mkdirSync(stateDirectory, {recursive: true, mode: 0o700});
    if (!fs.existsSync(file)) fs.writeFileSync(file, desired, {flag: 'wx', mode: 0o600});
    call('/usr/bin/plutil', ['-lint', file]);
    if (!inspect().loaded) call('/bin/launchctl', ['bootstrap', domain, file]);
  } else if (action === 'start') {
    if (!fs.existsSync(file)) throw new Error('Install the LaunchAgent first');
    if (fs.readFileSync(file, 'utf8') !== desired) throw new Error('This LaunchAgent differs from the current configuration. Inspect it before starting it.');
    if (inspect().loaded) call('/bin/launchctl', ['kickstart', target]);
    else call('/bin/launchctl', ['bootstrap', domain, file]);
  } else if (action === 'uninstall') {
    if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') !== desired)
      throw new Error('This LaunchAgent differs from the current configuration. Inspect it before uninstalling it.');
    if (inspect().loaded) call('/bin/launchctl', ['bootout', target]);
    fs.rmSync(file, {force: true});
  }
  return {action, label: LABEL, file, installed: fs.existsSync(file), ...inspect()};
}
