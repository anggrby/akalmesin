import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {setTimeout as sleep} from 'node:timers/promises';
import {sessionAt} from './core.mjs';
import {GrowthReadInterrupted, interruptedRead} from './recovery.mjs';

export function acquireLock(directory, {recoverStale = false} = {}) {
  fs.mkdirSync(directory, {recursive: true, mode: 0o700});
  const file = path.join(directory, 'worker.lock');
  let handle;
  try {
    handle = fs.openSync(file, 'wx', 0o600);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    if (recoverStale) {
      let recovered = false;
      try {
        recovered = unlockStoppedWorker(directory);
      } catch {
        /* Live or unverifiable owners remain locked. */
      }
      if (recovered) return acquireLock(directory);
    }
    throw new Error('Another growth command owns worker.lock. If it crashed, use the unlock command after checking that it stopped.');
  }
  fs.writeFileSync(handle, JSON.stringify({pid: process.pid, hostname: os.hostname(), startedAt: new Date().toISOString()}));
  fs.closeSync(handle);
  return () => fs.rmSync(file, {force: true});
}

export function unlockStoppedWorker(directory) {
  const file = path.join(directory, 'worker.lock');
  if (!fs.existsSync(file)) return false;
  const owner = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (owner.hostname !== os.hostname() || !Number.isInteger(owner.pid)) throw new Error('Cannot verify this lock owner. Inspect worker.lock manually.');
  try {
    process.kill(owner.pid, 0);
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
    fs.rmSync(file);
    return true;
  }
  throw new Error(`Worker PID ${owner.pid} is still running. Stop it before unlocking.`);
}

export class GrowthRunStop extends Error {
  constructor(message, code = 'STOPPED') {
    super(message);
    this.name = 'GrowthRunStop';
    this.code = code;
  }
}

export function isOperatorStop(error, signal) {
  return !!signal?.aborted && (error === signal.reason || (error?.code === 'ABORT_ERR' && error.cause === signal.reason));
}

function assertRunning(store, signal) {
  signal?.throwIfAborted();
  const pause = store.paused();
  if (pause) throw new GrowthRunStop(`Paused: ${pause.reason}`, 'PAUSED');
}

function sameSession(config, expected, now) {
  const current = sessionAt(config, now);
  return current && current.date === expected.date && current.name === expected.name;
}

export async function waitForSpacing({store, browser, config, now = () => new Date(), wait = sleep, signal, random = Math.random}) {
  for (;;) {
    assertRunning(store, signal);
    await browser.guard();
    const deadline = store.actionReadyAt(config, random);
    const remaining = deadline ? new Date(deadline).getTime() - now().getTime() : 0;
    if (remaining <= 0) return;
    await wait(Math.min(1000, remaining), undefined, {signal});
  }
}

export async function collectPool({store, browser, config, now = () => new Date(), log = () => {}, signal}) {
  assertRunning(store, signal);
  await browser.guard();
  await browser.assertAccount();
  let observed = 0;
  for (const source of config.sources) {
    assertRunning(store, signal);
    const candidates = await browser.collectCandidates(source, {limit: config.candidateScanLimit});
    store.addCandidates(
      candidates.filter(row => row.username.toLowerCase() !== config.account.toLowerCase()),
      now()
    );
    observed += candidates.length;
  }
  log({event: 'candidates-collected', observed, queued: store.candidates(config.candidateScanLimit).length});
  return observed;
}

export async function runSession({store, browser, config, now = () => new Date(), wait = sleep, log = () => {}, signal, expectedSession}) {
  const session = sessionAt(config, now());
  if (!session || (expectedSession && (session.date !== expectedSession.date || session.name !== expectedSession.name)))
    return {status: 'outside-window', follows: 0, unfollows: 0};
  assertRunning(store, signal);
  if (store.listUnresolved().length) {
    store.pause('An earlier action has an uncertain outcome. Run reconcile before resume.', now());
    throw new GrowthRunStop('Unresolved actions require reconciliation.', 'UNRESOLVED');
  }
  let follows = 0,
    unfollows = 0;
  let currentAction;
  let windowEndedBeforeMutation;
  const sessionResult = () => ({
    status: 'session-complete',
    session: session.name,
    date: session.date,
    follows,
    unfollows,
    budget: store.budget(session, config)
  });
  const previousIdentityFilter = browser.shouldSkipIdentity;
  browser.shouldSkipIdentity = (userId, username) => {
    if (previousIdentityFilter?.(userId, username) || store.hasKnownIdentity(userId, username)) return true;
    store.rememberIdentity(username, userId);
    return false;
  };
  const previousMutationGuard = browser.beforeMutation;
  browser.beforeMutation = () => {
    previousMutationGuard?.();
    assertRunning(store, signal);
    if (!sameSession(config, session, now())) {
      const error = new GrowthRunStop('The session window ended before the click.', 'WINDOW_ENDED');
      if (currentAction && !currentAction.mutationAllowed) windowEndedBeforeMutation = error;
      throw error;
    }
    // Once this guard permits dispatch, subsequent errors cannot prove no click.
    if (currentAction) currentAction.mutationAllowed = true;
  };
  try {
    await browser.guard();
    await browser.assertAccount();
    // Inspect a bounded review batch. The browser repeats the fresh reciprocity
    // check immediately before an unfollow; null observations never authorize it.
    const reviews = store.dueReviews(now(), config.reviewAfterDays).slice(0, config.maxUnfollowsPerSession);
    for (const candidate of reviews) {
      assertRunning(store, signal);
      if (!sameSession(config, session, now())) break;
      if (store.unfollowCount(session) >= config.maxUnfollowsPerSession) break;
      const observation = await browser.inspect(candidate.username);
      store.setObservation(candidate.username, {...observation, now: now()});
      store.deferReview(candidate.username, now());
      const current = store.get(candidate.username);
      if (observation.relationship === 'not_following') {
        store.exclude(candidate.username, 'Relationship ended outside this worker; preserve the change.', now());
        continue;
      }
      if (observation.relationship !== 'following' || observation.followsBack !== false) continue;
      // A request accepted during this inspection starts a new seven-day clock.
      if (!current.acceptedAt || now().getTime() - new Date(current.acceptedAt).getTime() < config.reviewAfterDays * 86400000) continue;
      if (current.excluded || current.protected) continue;
      if (!candidate.userId || !observation.userId) {
        log({event: 'review-deferred', username: candidate.username, reason: 'stable-identity-unavailable'});
        continue;
      }
      if (String(candidate.userId) !== String(observation.userId)) {
        store.exclude(candidate.username, 'Username now identifies a different account; never change that relationship.', now());
        log({event: 'review-excluded', username: candidate.username, reason: 'identity-changed'});
        continue;
      }
      await waitForSpacing({store, browser, config, now, wait, signal});
      if (!sameSession(config, session, now())) break;
      await browser.assertAccount();
      assertRunning(store, signal);
      if (!sameSession(config, session, now())) break;
      const id = store.beginAction(candidate.username, 'unfollow', {now: now(), session});
      currentAction = {id, username: candidate.username, kind: 'unfollow', mutationAllowed: false, previousReviewedAt: candidate.lastReviewedAt};
      const result = await browser.unfollow(candidate.username, {expectedUserId: candidate.userId});
      store.finishAction(id, {...result, now: now()});
      currentAction = null;
      log({event: 'unfollow-result', username: candidate.username, status: result.status});
      if (result.status === 'uncertain') throw new GrowthRunStop('Unfollow outcome is uncertain.', 'UNCERTAIN');
      if (result.status === 'unfollowed') unfollows++;
    }
    if (store.budget(session, config).remaining > 0 && sameSession(config, session, now())) {
      // Refresh from the visible source dialog every session; history filters
      // every previously managed/protected/excluded account from the queue.
      await collectPool({store, browser, config, now, log, signal});
      const candidates = store.candidates(config.candidateScanLimit);
      for (const candidate of candidates) {
        assertRunning(store, signal);
        if (!sameSession(config, session, now()) || store.budget(session, config).remaining <= 0) break;
        await waitForSpacing({store, browser, config, now, wait, signal});
        if (!sameSession(config, session, now())) break;
        await browser.assertAccount();
        assertRunning(store, signal);
        if (!sameSession(config, session, now()) || store.budget(session, config).remaining <= 0) break;
        const id = store.beginAction(candidate.username, 'follow', {now: now(), session});
        currentAction = {id, username: candidate.username, kind: 'follow', mutationAllowed: false};
        const result = await browser.follow(candidate.username);
        store.finishAction(id, {...result, now: now()});
        currentAction = null;
        log({event: 'follow-result', username: candidate.username, status: result.status});
        if (result.status === 'uncertain') throw new GrowthRunStop('Follow outcome is uncertain.', 'UNCERTAIN');
        if (result.status === 'following' || result.status === 'requested') follows++;
      }
    }
    return sessionResult();
  } catch (error) {
    // Only this action's own pre-click guard can attest that nothing dispatched.
    // A matching error code from elsewhere, or any earlier dispatch permission,
    // remains uncertain and follows the persistent pause/reconciliation path.
    if (windowEndedBeforeMutation && error === windowEndedBeforeMutation && currentAction && !currentAction.mutationAllowed) {
      store.finishAction(currentAction.id, {status: 'cancelled', now: now(), detail: 'Session window ended; mutation guard prevented dispatch.'});
      log({event: 'action-cancelled', username: currentAction.username, kind: currentAction.kind, reason: 'window-ended-before-dispatch'});
      return sessionResult();
    }
    if (!signal?.aborted && !store.paused()) {
      let retry = error instanceof GrowthReadInterrupted ? error : null;
      if (!currentAction && !store.listUnresolved().length && !retry) {
        try {
          retry = await interruptedRead(browser, error);
        } catch (guardError) {
          error = guardError;
        }
      }
      if (retry && currentAction && !currentAction.mutationAllowed) {
        store.finishAction(currentAction.id, {
          status: 'cancelled',
          now: now(),
          detail: 'Connection interrupted before dispatch; eligible for a fresh guarded attempt.'
        });
        if (currentAction.kind === 'unfollow') store.restoreReview(currentAction.username, currentAction.previousReviewedAt);
        log({event: 'action-cancelled', username: currentAction.username, kind: currentAction.kind, reason: 'connection-interrupted-before-dispatch'});
      }
      if (retry && !store.listUnresolved().length) throw retry;
    }
    // Persist the latch across restarts. No automatic retry of warnings, changed
    // UI, uncertain writes, or verification challenges. Only proven read failures reconnect.
    if (!store.paused() && (!isOperatorStop(error, signal) || store.listUnresolved().length))
      store.pause(`${error.code || error.name || 'ERROR'}: ${error.message}`, now());
    throw error;
  } finally {
    browser.beforeMutation = previousMutationGuard;
    browser.shouldSkipIdentity = previousIdentityFilter;
  }
}

export async function reconcileActions({store, browser, now = () => new Date(), log = () => {}}) {
  await browser.guard();
  await browser.assertAccount();
  for (const action of store.listUnresolved()) {
    const observed = await browser.inspect(action.username);
    let status;
    if (action.kind === 'follow' && ['following', 'requested'].includes(observed.relationship)) {
      // The process may have stopped before it established that this was a new
      // relationship. Preserve it forever instead of adopting an older follow.
      store.exclude(action.username, 'Recovered follow has ambiguous ownership; protect it from automatic unfollow.', now());
      status = observed.relationship;
    }
    if (action.kind === 'unfollow' && observed.relationship === 'not_following') status = 'unfollowed';
    if (action.kind === 'follow' && observed.relationship === 'not_following') {
      status = 'abandoned';
      store.exclude(action.username, 'Uncertain follow was absent during reconciliation; never retry automatically.', now());
    }
    if (action.kind === 'unfollow' && observed.relationship === 'following') status = 'skipped';
    if (!status) {
      log({event: 'reconciliation-unresolved', username: action.username});
      continue;
    }
    store.finishAction(action.id, {status, userId: observed.userId, now: now(), detail: 'Read-only reconciliation; no relationship changed.'});
    log({event: 'reconciled', username: action.username, status});
  }
  return {unresolved: store.listUnresolved().length, paused: store.paused()};
}
