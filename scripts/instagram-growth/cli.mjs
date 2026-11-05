#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as sleep} from 'node:timers/promises';
import {GrowthStore, validateConfig, sessionAt} from './core.mjs';
import {acquireLock, unlockStoppedWorker, collectPool, runSession, reconcileActions} from './runner.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const HELP = `Instagram growth worker for @akalmesin

Usage: npm run instagram:growth -- COMMAND [options]

  login       Open the dedicated browser; sign in manually as @akalmesin
  preview     Read the candidate pool headlessly; no follows/unfollows
  run         Execute the current WIB session, within its remaining cap
  daemon      Run sessions headlessly while this Mac is awake
  status      Show local counts, review queue and persistent pause state
  pause       Stop further actions and persist the pause
  reconcile   Inspect uncertain actions; never clicks Follow or Unfollow
  resume      Clear pause only after all uncertain actions are reconciled
  exclude     Permanently skip --username USER (local list; no Instagram block)
  unlock      Remove a crashed worker's lock only if its PID has stopped

Options:
  --config PATH     Default: instagram-growth.config.json
  --state-dir PATH  Default: .instagram-growth/ (contains private browser state)
  --username USER   Required for exclude
  --reason TEXT    Optional pause/exclusion note

No command bypasses Instagram warnings or verification challenges.
`;

export function parseArgs(argv) {
  const result = {command: argv[0] || 'help'};
  const names = {'--config': 'config', '--state-dir': 'stateDirectory', '--username': 'username', '--reason': 'reason'};
  for (let i = 1; i < argv.length; i++) {
    const name = names[argv[i]];
    if (!name || !argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error(`Invalid option: ${argv[i]}`);
    if (result[name]) throw new Error(`Duplicate option: ${argv[i]}`);
    result[name] = argv[++i];
  }
  return result;
}

// Login is read-only. A full-document redirect may destroy the DOM context
// between observations; retry that observation without retrying any action.
export async function loginReady(browser) {
  try {
    await browser.guard({allowLogin: true});
    await browser.assertAccount({allowLogin: true});
    return true;
  } catch (error) {
    if (['login_required', 'account_unverified'].includes(error.code)) return false;
    if (!error.code && /Execution context was destroyed|Cannot find context with specified id/.test(error.message)) return false;
    throw error;
  }
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (['help', '--help', '-h'].includes(args.command)) {
    process.stdout.write(HELP);
    return;
  }
  const commands = ['login', 'preview', 'run', 'daemon', 'status', 'pause', 'reconcile', 'resume', 'exclude', 'unlock'];
  if (!commands.includes(args.command)) throw new Error(`Unknown command: ${args.command}`);
  const stateDirectory = path.resolve(ROOT, args.stateDirectory || '.instagram-growth');
  const config = validateConfig(JSON.parse(fs.readFileSync(path.resolve(ROOT, args.config || 'instagram-growth.config.json'), 'utf8')));
  const log = value => process.stdout.write(`${JSON.stringify({at: new Date().toISOString(), ...value})}\n`);
  if (args.command === 'unlock') {
    log({unlocked: unlockStoppedWorker(stateDirectory)});
    return;
  }
  const store = new GrowthStore(stateDirectory);
  let release;
  const controller = new AbortController();
  const onSignal = () => controller.abort(new Error('Worker stopped by operator.'));
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  try {
    if (args.command === 'status') {
      log(store.report(config));
      return;
    }
    if (args.command === 'pause') {
      log({paused: store.pause(args.reason || 'Paused by operator.')});
      return;
    }
    // Even local resume/exclude share this lock so they cannot race a worker
    // between its eligibility check and a browser click. pause stays interruptible.
    release = acquireLock(stateDirectory);
    if (args.command === 'exclude') {
      if (!args.username) throw new Error('exclude requires --username USER');
      store.exclude(args.username, args.reason || 'Excluded by operator.');
      log({excluded: args.username});
      return;
    }
    if (args.command === 'resume') {
      if (store.listUnresolved().length) throw new Error('Uncertain actions remain. Run reconcile first.');
      store.resume();
      log({paused: null});
      return;
    }
    if (args.command === 'run' && !sessionAt(config, new Date())) {
      log({status: 'outside-window', timezone: config.timezone, sessions: config.sessions});
      return;
    }
    const {InstagramBrowser} = await import('./browser.mjs');
    const withBrowser = async fn => {
      const browser = await InstagramBrowser.launch({
        profileDirectory: path.join(stateDirectory, 'browser'),
        account: config.account,
        headless: args.command !== 'login'
      });
      const abortBrowser = () => {
        void browser.close().catch(() => {});
      };
      controller.signal.addEventListener('abort', abortBrowser, {once: true});
      try {
        await browser.page.goto('https://www.instagram.com/', {waitUntil: 'domcontentloaded'});
        if (args.command !== 'login') {
          const ready = await browser.poll(async () => {
            try {
              await browser.assertAccount();
              return true;
            } catch (error) {
              if (error.code === 'account_unverified') return false;
              throw error;
            }
          });
          if (!ready) throw new Error('Cannot verify @akalmesin navigation. Run login or inspect the browser UI.');
        }
        return await fn(browser);
      } finally {
        controller.signal.removeEventListener('abort', abortBrowser);
        await browser.close().catch(() => {});
      }
    };
    if (args.command === 'login') {
      await withBrowser(async browser => {
        log({
          event: 'manual-login',
          account: config.account,
          message: 'Sign in as @akalmesin in the opened browser. No follows or unfollows occur during login.'
        });
        const deadline = Date.now() + 15 * 60 * 1000;
        while (Date.now() < deadline) {
          controller.signal.throwIfAborted();
          if (await loginReady(browser)) {
            log({event: 'login-verified', account: config.account});
            return;
          }
          await sleep(2000, undefined, {signal: controller.signal});
        }
        throw new Error('Login timed out. Run login again when ready.');
      });
      return;
    }
    if (args.command === 'reconcile') {
      log(await withBrowser(browser => reconcileActions({store, browser, log})));
      return;
    }
    if (store.paused()) throw new Error(`Paused: ${store.paused().reason}. Resolve the cause, reconcile if needed, then run resume.`);
    if (args.command === 'preview') {
      await withBrowser(browser => collectPool({store, browser, config, log, signal: controller.signal}));
      log({event: 'preview', noRelationshipChanges: true, candidates: store.candidates(17).map(row => row.username), ...store.report(config)});
      return;
    }
    const run = () => withBrowser(browser => runSession({store, browser, config, log, signal: controller.signal}));
    if (args.command === 'run') {
      log(await run());
      return;
    }
    log({event: 'daemon-started', headless: true, timezone: config.timezone, sessions: config.sessions});
    const completed = new Set();
    while (!controller.signal.aborted) {
      if (store.paused()) throw new Error(`Paused: ${store.paused().reason}`);
      const session = sessionAt(config, new Date());
      const key = session && `${session.date}:${session.name}`;
      if (session && !completed.has(key)) {
        log(await run());
        completed.add(key);
      }
      await sleep(30000, undefined, {signal: controller.signal});
    }
  } catch (error) {
    // Login/reconcile failures also latch: a subsequent daemon cannot silently
    // pick up a browser that has shown a restriction during setup or inspection.
    if (['login', 'preview', 'run', 'daemon', 'reconcile'].includes(args.command)) store.pause(`${error.code || error.name || 'ERROR'}: ${error.message}`);
    throw error;
  } finally {
    process.removeListener('SIGINT', onSignal);
    process.removeListener('SIGTERM', onSignal);
    release?.();
    store.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    process.stderr.write(`${error.code || 'ERROR'}: ${error.message}\n`);
    process.exitCode = 1;
  });
}
