import {DatabaseSync} from 'node:sqlite';
import {mkdirSync, chmodSync} from 'node:fs';
import {join} from 'node:path';

export const DEFAULT_CONFIG = Object.freeze({
  account: 'akalmesin',
  timezone: 'Asia/Jakarta',
  dailyFollowLimit: 50,
  minDelaySeconds: 30,
  sessionStartJitterMinutes: 0,
  reviewAfterDays: 7,
  sessions: [
    {name: 'morning', start: '08:00', end: '11:00', limit: 17},
    {name: 'afternoon', start: '13:00', end: '17:00', limit: 17},
    {name: 'evening', start: '19:00', end: '22:00', limit: 16}
  ],
  sources: [{type: 'followers', account: 'aico.community'}],
  candidateScanLimit: 300,
  maxUnfollowsPerSession: 17
});

const integer = (value, name, min, max) => {
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`Invalid ${name}`);
  return value;
};
export function randomInteger(min, max, random = Math.random) {
  if (min === max) return min;
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error('Invalid random sample');
  return min + Math.floor(value * (max - min + 1));
}
const normalizeUserId = value => {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) value = String(value);
  if (typeof value !== 'string' || !/^\d+$/.test(value)) throw new Error('Invalid user ID');
  return value;
};
const minute = s => {
  if (typeof s !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(s)) throw new Error(`Invalid time: ${s}`);
  return Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
};
export function normalizeUsername(value) {
  if (typeof value !== 'string') throw new Error('Invalid username');
  let name = value.trim();
  if (/^https?:\/\//i.test(name)) {
    let url;
    try {
      url = new URL(name);
    } catch {
      throw new Error('Invalid Instagram profile URL');
    }
    if (
      url.protocol !== 'https:' ||
      !['instagram.com', 'www.instagram.com'].includes(url.hostname.toLowerCase()) ||
      url.username ||
      url.password ||
      url.port ||
      url.search ||
      url.hash
    )
      throw new Error('Invalid Instagram profile URL');
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length !== 1) throw new Error('Invalid Instagram profile URL');
    name = parts[0];
  } else if (name.startsWith('@')) name = name.slice(1);
  name = name.toLowerCase();
  if (!/^[a-z0-9_](?:[a-z0-9_.]{0,28}[a-z0-9_])?$/.test(name) || name.includes('..')) throw new Error('Invalid username');
  return name;
}
export function validateSource(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) throw new Error('Invalid source');
  if (source.type === 'followers') return {type: 'followers', account: normalizeUsername(source.account)};
  if (source.type === 'likes') {
    let url;
    try {
      url = new URL(source.url);
    } catch {
      throw new Error('Invalid Instagram post URL');
    }
    if (
      url.protocol !== 'https:' ||
      !['instagram.com', 'www.instagram.com'].includes(url.hostname.toLowerCase()) ||
      url.username ||
      url.password ||
      url.port ||
      url.hash ||
      !/^\/(p|reel)\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)
    )
      throw new Error('Invalid Instagram post URL');
    return {type: 'likes', url: `https://www.instagram.com${url.pathname.replace(/\/?$/, '/')}`};
  }
  throw new Error('Invalid source type');
}
export function validateConfig(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid config');
  const c = {...DEFAULT_CONFIG, ...input};
  if (c.account !== 'akalmesin' || c.timezone !== 'Asia/Jakarta') throw new Error('Account and timezone must be akalmesin and Asia/Jakarta');
  integer(c.dailyFollowLimit, 'dailyFollowLimit', 1, 50);
  integer(c.minDelaySeconds, 'minDelaySeconds', 30, Number.MAX_SAFE_INTEGER);
  c.maxDelaySeconds = input.maxDelaySeconds ?? c.minDelaySeconds;
  integer(c.maxDelaySeconds, 'maxDelaySeconds', c.minDelaySeconds, Number.MAX_SAFE_INTEGER);
  integer(c.sessionStartJitterMinutes, 'sessionStartJitterMinutes', 0, 1439);
  integer(c.reviewAfterDays, 'reviewAfterDays', 7, Number.MAX_SAFE_INTEGER);
  integer(c.candidateScanLimit, 'candidateScanLimit', 1, 300);
  integer(c.maxUnfollowsPerSession, 'maxUnfollowsPerSession', 1, 17);
  if (!Array.isArray(c.sessions) || c.sessions.length !== 3) throw new Error('Three sessions required');
  const caps = {morning: 17, afternoon: 17, evening: 16};
  const seen = new Set();
  c.sessions = c.sessions.map(s => {
    if (!s || !Object.hasOwn(caps, s.name) || seen.has(s.name)) throw new Error('Invalid session name');
    seen.add(s.name);
    const start = minute(s.start),
      end = minute(s.end);
    if (start >= end) throw new Error('Invalid session interval');
    if (c.sessionStartJitterMinutes > end - start) throw new Error('Session start jitter exceeds its window');
    integer(s.limit, 'session limit', 1, caps[s.name]);
    return {name: s.name, start: s.start, end: s.end, limit: s.limit};
  });
  const sorted = [...c.sessions].sort((a, b) => minute(a.start) - minute(b.start));
  for (let i = 1; i < sorted.length; i++) if (minute(sorted[i].start) < minute(sorted[i - 1].end)) throw new Error('Sessions overlap');
  if (!Array.isArray(c.sources) || !c.sources.length) throw new Error('At least one source required');
  c.sources = c.sources.map(validateSource);
  return c;
}
const localParts = date => {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) throw new Error('Invalid date');
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    })
      .formatToParts(date)
      .map(x => [x.type, x.value])
  );
  return {date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute)};
};
const iso = date => {
  localParts(date);
  return date.toISOString();
};
export function sessionAt(config, now = new Date()) {
  const c = validateConfig(config),
    p = localParts(now);
  const s = c.sessions.find(x => p.minutes >= minute(x.start) && p.minutes < minute(x.end));
  return s ? {date: p.date, ...s} : null;
}

export class GrowthStore {
  constructor(stateDirectory) {
    mkdirSync(stateDirectory, {recursive: true, mode: 0o700});
    chmodSync(stateDirectory, 0o700);
    const path = join(stateDirectory, 'state.sqlite');
    const oldMask = process.umask(0o077);
    try {
      this.db = new DatabaseSync(path);
    } finally {
      process.umask(oldMask);
    }
    chmodSync(path, 0o600);
    this.db.exec(`PRAGMA busy_timeout=5000; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS candidates (
        username TEXT PRIMARY KEY, user_id TEXT, status TEXT NOT NULL DEFAULT 'new', relationship TEXT,
        follows_back INTEGER, accepted_at TEXT, requested_at TEXT, last_observed_at TEXT,
        last_reviewed_at TEXT, excluded INTEGER NOT NULL DEFAULT 0, protected INTEGER NOT NULL DEFAULT 0,
        exclusion_reason TEXT, created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS actions (
        id INTEGER PRIMARY KEY, username TEXT NOT NULL REFERENCES candidates(username), kind TEXT NOT NULL,
        status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, finished_at TEXT, date TEXT NOT NULL,
        session_name TEXT NOT NULL, detail TEXT
      );
      CREATE INDEX IF NOT EXISTS action_budget ON actions(date, session_name, kind, status);
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS scheduled_sessions (
        date TEXT NOT NULL, name TEXT NOT NULL, scheduled_at TEXT NOT NULL, completed_at TEXT,
        PRIMARY KEY(date,name)
      );
    `);
  }
  close() {
    this.db.close();
  }
  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  row(row) {
    if (!row) return null;
    return {
      username: row.username,
      userId: row.user_id,
      status: row.status,
      relationship: row.relationship,
      followsBack: row.follows_back == null ? null : !!row.follows_back,
      acceptedAt: row.accepted_at,
      requestedAt: row.requested_at,
      lastObservedAt: row.last_observed_at,
      lastReviewedAt: row.last_reviewed_at,
      excluded: !!row.excluded,
      protected: !!row.protected
    };
  }
  addCandidates(items, now = new Date()) {
    if (!Array.isArray(items)) throw new Error('Candidates must be an array');
    const at = iso(now);
    return this.transaction(() => {
      const stmt = this.db.prepare('INSERT OR IGNORE INTO candidates (username,user_id,created_at) VALUES (?,?,?)');
      let added = 0;
      for (const item of items) {
        const username = normalizeUsername(typeof item === 'string' ? item : item?.username);
        const userId = normalizeUserId(typeof item === 'object' ? item?.userId : null);
        added += Number(stmt.run(username, userId, at).changes);
      }
      return added;
    });
  }
  get(username) {
    return this.row(this.db.prepare('SELECT * FROM candidates WHERE username=?').get(normalizeUsername(username)));
  }
  hasKnownIdentity(userId, exceptUsername) {
    const id = normalizeUserId(userId);
    if (id === null) return false;
    const except = exceptUsername == null ? '' : normalizeUsername(exceptUsername);
    return !!this.db
      .prepare(
        "SELECT 1 FROM candidates c WHERE c.user_id=? AND c.username!=? AND (c.excluded=1 OR c.protected=1 OR EXISTS (SELECT 1 FROM actions a WHERE a.username=c.username AND a.kind='follow' AND a.status!='cancelled')) LIMIT 1"
      )
      .get(id, except);
  }
  rememberIdentity(username, userId) {
    const id = normalizeUserId(userId);
    if (id === null) throw new Error('User ID is required');
    const result = this.db
      .prepare("UPDATE candidates SET user_id=? WHERE username=? AND status='new' AND excluded=0 AND protected=0 AND (user_id IS NULL OR user_id=?)")
      .run(id, normalizeUsername(username), id);
    if (!result.changes) throw new Error('Candidate is ineligible or identity changed');
  }
  candidates(limit = 50) {
    integer(limit, 'candidate limit', 1, 100000);
    return this.db
      .prepare(
        `SELECT * FROM candidates c WHERE status='new' AND excluded=0 AND protected=0
      AND NOT EXISTS (SELECT 1 FROM actions a WHERE a.username=c.username AND a.status='uncertain') ORDER BY created_at,username LIMIT ?`
      )
      .all(limit)
      .map(r => this.row(r));
  }
  beginAction(username, kind, {now = new Date(), session} = {}) {
    username = normalizeUsername(username);
    if (
      !['follow', 'unfollow'].includes(kind) ||
      !session ||
      !/^\d{4}-\d{2}-\d{2}$/.test(session.date) ||
      !['morning', 'afternoon', 'evening'].includes(session.name) ||
      localParts(now).date !== session.date
    )
      throw new Error('Invalid action or session');
    const at = iso(now);
    return this.transaction(() => {
      const c = this.get(username);
      if (!c || c.excluded || c.protected || (kind === 'follow' ? c.status !== 'new' : c.status !== 'following')) throw new Error('Candidate is not eligible');
      if (this.db.prepare("SELECT 1 FROM actions WHERE username=? AND status='uncertain'").get(username)) throw new Error('Unresolved action exists');
      const result = this.db
        .prepare("INSERT INTO actions (username,kind,status,created_at,updated_at,date,session_name) VALUES (?,?,'uncertain',?,?,?,?)")
        .run(username, kind, at, at, session.date, session.name);
      return Number(result.lastInsertRowid);
    });
  }
  finishAction(id, {status, now = new Date(), userId, detail} = {}) {
    if (!['following', 'requested', 'unfollowed', 'skipped', 'uncertain', 'abandoned', 'cancelled'].includes(status)) throw new Error('Invalid action status');
    const at = iso(now);
    const observedUserId = normalizeUserId(userId);
    return this.transaction(() => {
      const a = this.db.prepare('SELECT * FROM actions WHERE id=?').get(id);
      if (!a || a.status !== 'uncertain') throw new Error('Action is not unresolved');
      const effectiveAt = at < a.updated_at ? a.updated_at : at;
      if ((a.kind === 'follow' && status === 'unfollowed') || (a.kind === 'unfollow' && ['following', 'requested', 'abandoned'].includes(status)))
        throw new Error('Invalid outcome for action');
      if (observedUserId !== null) {
        const updated = this.db
          .prepare('UPDATE candidates SET user_id=? WHERE username=? AND (user_id IS NULL OR user_id=?)')
          .run(observedUserId, a.username, observedUserId);
        if (!updated.changes) throw new Error('Candidate identity changed');
      }
      this.db
        .prepare('UPDATE actions SET status=?,updated_at=?,finished_at=?,detail=? WHERE id=?')
        .run(status, effectiveAt, status === 'uncertain' ? null : effectiveAt, detail == null ? null : String(detail), id);
      if (status === 'following')
        this.db
          .prepare(
            "UPDATE candidates SET status='following',relationship='following',accepted_at=?,requested_at=NULL,user_id=COALESCE(?,user_id) WHERE username=?"
          )
          .run(effectiveAt, observedUserId, a.username);
      if (status === 'requested')
        this.db
          .prepare(
            "UPDATE candidates SET status='requested',relationship='requested',requested_at=?,accepted_at=NULL,user_id=COALESCE(?,user_id) WHERE username=?"
          )
          .run(effectiveAt, observedUserId, a.username);
      if (status === 'unfollowed')
        this.db
          .prepare("UPDATE candidates SET status='unfollowed',relationship='not_following',excluded=1,exclusion_reason='unfollowed' WHERE username=?")
          .run(a.username);
      if (status === 'abandoned')
        this.db
          .prepare("UPDATE candidates SET status='abandoned',excluded=1,protected=1,exclusion_reason='Uncertain follow abandoned' WHERE username=?")
          .run(a.username);
      if (status === 'skipped' && a.kind === 'follow') this.db.prepare("UPDATE candidates SET status='skipped',protected=1 WHERE username=?").run(a.username);
    });
  }
  listUnresolved() {
    return this.db
      .prepare(
        "SELECT id,username,kind,status,created_at AS createdAt,date,session_name AS sessionName,detail FROM actions WHERE status='uncertain' ORDER BY id"
      )
      .all()
      .map(r => ({...r}));
  }
  plannedSessions(now = new Date()) {
    return this.db
      .prepare('SELECT date,name,scheduled_at AS scheduledAt,completed_at AS completedAt FROM scheduled_sessions WHERE date=? ORDER BY scheduled_at,name')
      .all(localParts(now).date)
      .map(row => ({...row}));
  }
  scheduleSessions(config, now = new Date(), random = Math.random) {
    const c = validateConfig(config),
      date = localParts(now).date;
    return this.transaction(() => {
      for (const session of c.sessions) {
        if (this.db.prepare('SELECT 1 FROM scheduled_sessions WHERE date=? AND name=?').get(date, session.name)) continue;
        const offset = randomInteger(0, Math.max(0, c.sessionStartJitterMinutes * 60 - 1), random);
        const start = new Date(`${date}T${session.start}:00+07:00`).getTime();
        this.db
          .prepare('INSERT INTO scheduled_sessions(date,name,scheduled_at) VALUES(?,?,?)')
          .run(date, session.name, new Date(start + offset * 1000).toISOString());
      }
      return this.plannedSessions(now);
    });
  }
  completeSession(session, now = new Date()) {
    const result = this.db
      .prepare('UPDATE scheduled_sessions SET completed_at=COALESCE(completed_at,?) WHERE date=? AND name=?')
      .run(iso(now), session.date, session.name);
    if (!result.changes) throw new Error('Session was not scheduled');
  }
  actionReadyAt(config, random = Math.random) {
    const c = validateConfig(config);
    return this.transaction(() => {
      const action = this.db.prepare('SELECT id,MAX(created_at,updated_at) AS at FROM actions ORDER BY MAX(created_at,updated_at) DESC,id DESC LIMIT 1').get();
      if (!action) return null;
      const stored = this.db.prepare("SELECT value FROM settings WHERE key='action_spacing'").get();
      const plan = stored && JSON.parse(stored.value);
      if (plan && plan.id === action.id && plan.after === action.at && plan.min === c.minDelaySeconds && plan.max === c.maxDelaySeconds) return plan.readyAt;
      const seconds = randomInteger(c.minDelaySeconds, c.maxDelaySeconds, random);
      const readyAt = new Date(new Date(action.at).getTime() + seconds * 1000).toISOString();
      this.db
        .prepare("INSERT INTO settings(key,value) VALUES('action_spacing',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
        .run(JSON.stringify({id: action.id, after: action.at, min: c.minDelaySeconds, max: c.maxDelaySeconds, readyAt}));
      return readyAt;
    });
  }
  lastActionAt() {
    return this.db.prepare('SELECT MAX(MAX(created_at,updated_at)) AS at FROM actions').get().at ?? null;
  }
  budget(session, config) {
    const c = validateConfig(config);
    if (!session || !/^\d{4}-\d{2}-\d{2}$/.test(session.date)) throw new Error('Invalid session');
    const s = c.sessions.find(x => x.name === session.name);
    if (!s) throw new Error('Invalid session');
    const row = this.db
      .prepare(
        "SELECT COUNT(*) AS dailyUsed, COALESCE(SUM(CASE WHEN session_name=? THEN 1 ELSE 0 END),0) AS sessionUsed FROM actions WHERE date=? AND kind='follow' AND status IN ('following','requested','uncertain','abandoned')"
      )
      .get(s.name, session.date);
    const dailyUsed = Number(row.dailyUsed),
      sessionUsed = Number(row.sessionUsed);
    const dailyRemaining = Math.max(0, c.dailyFollowLimit - dailyUsed),
      sessionRemaining = Math.max(0, s.limit - sessionUsed);
    return {
      date: session.date,
      sessionName: s.name,
      dailyUsed,
      sessionUsed,
      dailyRemaining,
      sessionRemaining,
      remaining: Math.min(dailyRemaining, sessionRemaining)
    };
  }
  unfollowCount(session) {
    return Number(
      this.db
        .prepare("SELECT COUNT(*) AS count FROM actions WHERE date=? AND session_name=? AND kind='unfollow' AND status NOT IN ('skipped','cancelled')")
        .get(session.date, session.name).count
    );
  }
  dueReviews(now = new Date(), days = 7) {
    integer(days, 'review days', 7, Number.MAX_SAFE_INTEGER);
    const cutoff = new Date(now.getTime() - days * 86400000).toISOString(),
      today = localParts(now).date;
    return this.db
      .prepare(
        `SELECT * FROM candidates WHERE excluded=0 AND protected=0 AND follows_back IS NOT 1 AND
      ((status='following' AND accepted_at IS NOT NULL AND accepted_at<=?) OR (status='requested' AND requested_at IS NOT NULL AND requested_at<=?))
      AND (last_reviewed_at IS NULL OR substr(datetime(last_reviewed_at, '+7 hours'),1,10)<?)
      AND NOT EXISTS (SELECT 1 FROM actions a WHERE a.username=candidates.username AND a.status='uncertain') ORDER BY last_reviewed_at IS NOT NULL,last_reviewed_at,COALESCE(accepted_at,requested_at),username`
      )
      .all(cutoff, cutoff, today)
      .map(r => this.row(r));
  }
  setObservation(username, {relationship, followsBack, now = new Date()} = {}) {
    username = normalizeUsername(username);
    const at = iso(now);
    if (typeof relationship !== 'string' || !relationship.trim() || ![true, false, null].includes(followsBack)) throw new Error('Invalid observation');
    return this.transaction(() => {
      const c = this.get(username);
      if (!c) throw new Error('Unknown candidate');
      const accepted = c.status === 'requested' && relationship === 'following';
      this.db
        .prepare(
          `UPDATE candidates SET relationship=?,follows_back=?,last_observed_at=?,last_reviewed_at=?,
        status=CASE WHEN ? THEN 'following' ELSE status END,accepted_at=CASE WHEN ? THEN ? ELSE accepted_at END WHERE username=?`
        )
        .run(relationship, followsBack == null ? null : Number(followsBack), at, at, Number(accepted), Number(accepted), at, username);
      return this.get(username);
    });
  }
  restoreReview(username, previousReviewedAt) {
    const previous = previousReviewedAt == null ? null : iso(new Date(previousReviewedAt));
    const result = this.db
      .prepare("UPDATE candidates SET last_reviewed_at=? WHERE username=? AND status='following' AND excluded=0 AND protected=0")
      .run(previous, normalizeUsername(username));
    if (!result.changes) throw new Error('Review cannot be retried for this candidate');
  }
  deferReview(username, now = new Date()) {
    const result = this.db.prepare('UPDATE candidates SET last_reviewed_at=? WHERE username=?').run(iso(now), normalizeUsername(username));
    if (!result.changes) throw new Error('Unknown candidate');
  }
  pause(reason, now = new Date()) {
    if (typeof reason !== 'string' || !reason.trim()) throw new Error('Pause reason required');
    const value = JSON.stringify({reason, at: iso(now)});
    this.db.prepare("INSERT INTO settings(key,value) VALUES('pause',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(value);
    return JSON.parse(value);
  }
  paused() {
    const row = this.db.prepare("SELECT value FROM settings WHERE key='pause'").get();
    return row ? JSON.parse(row.value) : null;
  }
  resume(now = new Date()) {
    iso(now);
    this.db.prepare("DELETE FROM settings WHERE key='pause'").run();
  }
  exclude(username, reason, now = new Date()) {
    username = normalizeUsername(username);
    iso(now);
    if (typeof reason !== 'string' || !reason.trim()) throw new Error('Exclusion reason required');
    this.db
      .prepare(
        `INSERT INTO candidates(username,created_at,excluded,exclusion_reason) VALUES(?,?,1,?)
      ON CONFLICT(username) DO UPDATE SET excluded=1,exclusion_reason=excluded.exclusion_reason`
      )
      .run(username, iso(now), reason);
  }
  report(config, now = new Date()) {
    const session = sessionAt(config, now);
    const statuses = Object.fromEntries(
      this.db
        .prepare('SELECT status,COUNT(*) AS count FROM candidates GROUP BY status')
        .all()
        .map(r => [r.status, Number(r.count)])
    );
    return {
      date: localParts(now).date,
      session,
      budget: session ? this.budget(session, config) : null,
      paused: this.paused(),
      unresolved: this.listUnresolved(),
      statuses,
      dueReviews: this.dueReviews(now, validateConfig(config).reviewAfterDays).length,
      lastActionAt: this.lastActionAt(),
      schedule: this.plannedSessions(now)
    };
  }
}
