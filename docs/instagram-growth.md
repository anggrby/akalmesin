# Instagram growth worker

Optional, owner-authorized browser automation for **@akalmesin**. This is separate from carousel production and Notion delivery. The starting source is the visible followers of [@aico.community](https://www.instagram.com/aico.community/), supplied by the owner on 4 November 2026. It does not publish posts or send messages.

## Review fixes — 5 November 2026

The [PR review](https://github.com/anggrby/akalmesin/pull/2#pullrequestreview-5779842040) identified review starvation, lock-contention pauses and a persistent stop after proven pre-click window expiry. Eligible reviews now rotate by never/least recently reviewed status. Rejected competing commands preserve the existing lock and pause. A window expiry attested by the current action’s own pre-click guard finalizes only that undispatched intent as `cancelled`; ambiguous or possibly dispatched operations still pause.

All **63 growth tests pass** with `npm run test:instagram-growth`. Changed-file Prettier and `git diff --check` pass. Regression coverage exercises a multi-day pending backlog, all five competing browser commands, cancelled follow/unfollow persistence and later eligibility, and failures without proof that dispatch was blocked. These are fixture checks. The live daemon has not been restarted to load these fixes, and actual seven-day outcomes remain unverified. The dated live results below are historical.

## Current status — 4 November 2026

Implemented in this checkout. The initial 53 growth fixtures and 72 editorial tests passed. Focused regression checks for visible relationship labels, warning stops, mutation guards and stale-profile read-back pass after the live confirmation fix. Changed files pass Prettier and `git diff --check`; the full-repository formatter has five pre-existing Markdown issues that remain untouched.

The 13:00 WIB session sent its first follow successfully, but the old confirmation check missed the visible Following control because its DOM text included an icon label. A second successful follow exposed stale controls after a click. Both existing results were verified against the recorded numeric account IDs without clicking Follow again. Confirmation now uses visible button text and, if needed, a single fresh profile read-back; an unverified result or restriction still stops the worker.

The afternoon session **completed at 14:00 WIB on 4 November 2026** with **17 confirmed follows**, **0 pending requests**, **0 unresolved actions**, and no active pause. Two earlier successful attempts were reconciled without repeating their clicks; the resumed run automatically confirmed the remaining 15. The session allowance is exhausted and will not reset on restart. The headless daemon remains running for the **19:00 WIB** evening window, maximum 16. Actual seven-day outcomes remain unverified.

The detached local Node process logs to `.instagram-growth/worker.log`, runs while this Mac is awake, and does not automatically restart after reboot. Normal sessions stay headless; only explicit manual login opens a browser. `npm run instagram:growth -- pause` persists the stop and makes the daemon exit. No system service was installed.

For code layout and an agent maintenance handoff, see [scripts/instagram-growth/README.md](../scripts/instagram-growth/README.md).

## Defaults

[instagram-growth.config.json](../instagram-growth.config.json) owns the executable settings.

| Session   | Window, WIB | Maximum new follows |
| --------- | ----------- | ------------------- |
| Morning   | 08:00–11:00 | 17                  |
| Afternoon | 13:00–17:00 | 17                  |
| Evening   | 19:00–22:00 | 16                  |

The three sessions share a maximum of 50 per WIB calendar day. A session starts when the daemon first sees its window; it does not spread each follow uniformly through that whole window. Each relationship action has at least 30 seconds of spacing after the previous result. Missed sessions are skipped; their allowance is not moved into a later session. If pre-click preparation crosses the window boundary, the mutation guard blocks dispatch and the worker cancels only that proven undispatched intent without pausing future sessions. Its unused reservation is released; confirmed or uncertain actions keep their existing counts. Times can be adjusted in config without overlapping windows or increasing the agreed caps.

## Start

The editorial tools still support Node 20+. **This optional worker requires Node 24+** for built-in SQLite. Use an installed Node 24 runtime, then from this checkout:

```sh
npm ci
npx playwright-core install chromium
npm run instagram:growth -- login
npm run instagram:growth -- preview
npm run instagram:growth -- daemon
```

`login` opens a dedicated headed Chromium profile. Sign in manually as **@akalmesin**, including normal two-factor login if needed. The command verifies the account from the visible Profile navigation link and closes the browser after success. It never requests a password in the terminal. Existing personal browser profiles are untouched.

`preview` opens the source dialog, reads visible usernames into the local queue, and prints a sample. It does not follow or unfollow anyone. A live preview is needed to check the current Instagram UI; fixture success alone does not establish live compatibility.

`daemon` normally runs in the foreground while its process and this Mac are awake. Leave it running for daily operation; Ctrl+C stops a foreground run. The current detached background run is stopped with the `pause` command; inspect `.instagram-growth/worker.log` for its output. Normal run, preview, reconcile and daemon sessions use headless Chromium with the saved login, so no Chrome window opens or steals focus. Only the explicit `login` command opens a visible browser when manual authentication is needed. A restriction, verification challenge or expired session stops the worker; it does not open a visible window automatically. Its window check runs every 30 seconds. It does not install a system service, keep the Mac awake, or run when the Mac is off. `run` executes only the current session and exits; outside all windows it reports that state without opening a browser.

## Candidate sources

Followers are the configured default. A post's likes can be used instead by replacing `sources` with an exact post URL:

```json
{
  "sources": [{"type": "likes", "url": "https://www.instagram.com/p/POST_SHORTCODE/"}]
}
```

Both source types can be combined; they share the same daily cap and history. Liking a post is evidence of activity around that post, not proof of interest in following akalmesin. Start with relevant source accounts/posts and compare actual retained followers before expanding the pool.

Discovery reads the visible user-list UI, with at most 300 usernames and 25 scroll passes per source per session. Identity checks read matching numeric user IDs from JSON embedded in the current profile document. Reciprocity checks can observe responses generated by ordinary UI searches; the worker does not issue direct private API requests or recursively harvest follower networks. Instagram may keep showing the same first users; once that bounded pool is exhausted, add another relevant source rather than expecting unlimited discovery. Posts with hidden/unavailable likes or changed controls cause a stop instead of guessing.

## History and seven-day reviews

The worker records durable intent before clicking and records the observed outcome afterward. Confirmed follows, pending requests, and uncertain attempts reserve allowance. Relaunching cannot reset daily/session counts. Accounts already followed/requested before an attempted script action are protected and never enter its unfollow queue.

After seven days, the worker inspects managed relationships. A visible reciprocal badge or an exact match in akalmesin's own Followers search confirms a follow-back. Absence requires both an explicit empty search result and a successful, complete response tied to that exact query and akalmesin’s stable owner ID. Unrelated, stale or incomplete results remain unknown. Missing badges, incomplete searches and failed lookups remain unknown and cannot authorize an unfollow. The browser repeats the check before clicking Unfollow. Follow-backs are retained and leave the initial review queue.

Eligible accounts are ordered by never-reviewed status, then oldest last review, then relationship age. A deferred pending request or unknown observation can be inspected once per WIB day and rotates behind less recently reviewed accounts on later days. Each session inspects at most 17 due accounts and makes at most 17 unfollows; a backlog can take longer than seven days. Pending private requests are left pending. If acceptance is first observed later, a new seven-day clock starts then. Relationships ended manually are preserved. Unfollowed accounts are permanently excluded from future follows; this is a **local exclusion list**, not Instagram's Block feature.

Usernames can change. Automatic unfollow requires a freshly verified numeric account ID matching the ID recorded at follow time. A missing ID defers review; a changed ID excludes that username without changing the relationship. Known numeric IDs are checked across usernames before a follow, so a previously processed/excluded identity is skipped after a rename when that ID is available. The fresh ID is saved before the click. When metadata is unavailable, username history still applies and existing follows are protected by the pre-action check; cross-username matching cannot be guaranteed. Unfollowed usernames remain in the local exclusion list.

## Stop and recovery

Instagram restrictions, verification challenges, blocked HTTP responses, unexpected pages, unknown controls and unconfirmed clicks stop the worker. A persistent pause survives restarts. There is no automatic challenge solving, retry loop, stealth mode or account rotation. No warning appearing is not proof that Instagram permits the automation or that the account is safe.

```sh
npm run instagram:growth -- status
npm run instagram:growth -- pause --reason "operator pause"
npm run instagram:growth -- reconcile
npm run instagram:growth -- resume
npm run instagram:growth -- daemon
```

Resolve a restriction manually before resuming. `reconcile` only observes uncertain outcomes and updates the local journal; it never changes a relationship. A recovered follow/request is conservatively excluded from future automatic unfollow because it may have predated the worker. An absent uncertain follow is finalized as abandoned and still consumes its original day/session allowance, since the worker cannot prove that no click ever succeeded. `resume` refuses while uncertain actions remain. If login or preview latched a pause, a successful login does not clear it; explicitly resume afterward.

```sh
npm run instagram:growth -- exclude --username someone --reason "keep out of candidate pool"
npm run instagram:growth -- unlock
```

`exclude` changes only the local list. `unlock` removes a crashed worker's lock only when its recorded PID is no longer running; it refuses to unlock a live worker. Only one login/preview/run/daemon/reconcile process can own the browser at a time. A command rejected for lock contention leaves the active worker’s lock and pause unchanged. Status and pause can run while the daemon is active.

## Private local state

`.instagram-growth/` is git-ignored and holds the SQLite action journal, persistent pause, process lock, and browser session. The directory is private to the current user. Do not commit, copy to another account, or clear it to reset a warning, history or allowance. The non-secret configuration is tracked. `--config PATH` and `--state-dir PATH` are available for isolated operation; retain the same state directory in normal use so caps/history remain shared.

## Verification

```sh
npm run test:instagram-growth
npm test
npm run format:check
```

Growth tests live in their own subdirectory so the normal Node 20 editorial suite remains usable. They use temporary SQLite state and intercepted HTML browser fixtures; they never follow real users. The growth suite requires Node 24+ and the installed Chromium build. Live login, source preview, actual follows and seven-day outcomes must be reported separately from fixture results.
