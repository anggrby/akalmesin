import timers from 'node:timers/promises';
import {sessionAt} from './core.mjs';
import {GrowthReadInterrupted} from './recovery.mjs';

export function scheduledSessionDue({store, config, now = new Date(), random = Math.random}) {
  const plan = store.scheduleSessions(config, now, random);
  const session = sessionAt(config, now);
  if (!session) return null;
  const scheduled = plan.find(row => row.name === session.name);
  return !scheduled.completedAt && now.getTime() >= new Date(scheduled.scheduledAt).getTime() ? session : null;
}

export async function runDaemon({store, config, run, now = () => new Date(), wait = timers.setTimeout, signal, log = () => {}}) {
  log({event: 'daemon-started', headless: true, timezone: config.timezone, sessions: config.sessions});
  let recoveryAttempts = 0;
  while (!signal?.aborted) {
    if (store.paused()) throw new Error(`Paused: ${store.paused().reason}`);
    if (store.listUnresolved().length) {
      store.pause('An earlier action has an uncertain outcome. Run reconcile before resume.', now());
      throw new Error('Unresolved actions require reconciliation.');
    }
    const session = scheduledSessionDue({store, config, now: now()});
    if (session) {
      try {
        const result = await run(session);
        recoveryAttempts = 0;
        if (result.status === 'session-complete') {
          if (result.date !== session.date || result.session !== session.name) throw new Error('Session result does not match the scheduled window');
          store.completeSession(session, now());
        }
        log(result);
      } catch (error) {
        if (!(error instanceof GrowthReadInterrupted) || signal?.aborted || store.paused() || store.listUnresolved().length) throw error;
        const retrySeconds = Math.min(300, 30 * 2 ** Math.min(recoveryAttempts++, 4));
        log({event: 'waiting-for-connection', session: session.name, retrySeconds});
        const retryAt = now().getTime() + retrySeconds * 1000;
        while (!signal?.aborted && now().getTime() < retryAt) {
          await wait(Math.min(30000, retryAt - now().getTime()), undefined, {signal});
        }
        continue;
      }
    }
    await wait(30000, undefined, {signal});
  }
}
