# Instagram growth worker

Optional, owner-authorized browser automation for **@akalmesin**. This is separate from carousel production and Notion delivery. The starting source is the visible followers of [@aico.community](https://www.instagram.com/aico.community/), supplied by the owner on 4 November 2026. It does not publish posts or send messages.

## PR #4 startup fixes — 5 November 2026

The owner requested fixes for [PR #4’s review](https://github.com/anggrby/akalmesin/pull/4#pullrequestreview-5785428743). A short SQLite transaction in private `worker-lock.sqlite` now serializes every lock acquisition, dead-owner check, reclamation and release. Reclaiming and creating the replacement happen in the same operation. Release requires the captured ownership token, PID/hostname and file device/inode to still match. A crashed process releases the SQLite serialization lock automatically; active and unverifiable owners remain protected. Legacy lock records without a token can still be reclaimed after their local PID is proven stopped. Preserve the guard database while any command may run.

Known transient failures during browser/context creation now enter the same daemon reconnect path as interrupted reads, before any relationship action can occur. A replacement browser still verifies the signed-in account and checks for restrictions. Configuration/profile errors, including a profile already in use or denied access, remain hard stops even if Chromium reports `TargetClosedError`. If a context was created before page initialization failed, it is closed before retrying.

All **104 growth tests passed**, including simultaneous stale-lock recovery and manual unlock with real controlled Node subprocesses, obsolete/repeated release, a reclaimer crash, and a transient first launch through the real CLI with a mocked browser. Replacement-account checks, challenge stops, profile/configuration failures and context cleanup are also covered. Changed-file Prettier, whitespace and 24 local documentation links/anchors passed.

At **20:48 WIB on 5 November 2026**, the idle login job was verified running after a clean restart to activate these fixes. Its new ownership token and private coordinator were verified, with **no pause and 0 unresolved actions**. The saved schedule, completed evening window, candidate history, last action timestamp and **16-action evening usage** were unchanged. No live relationship changes were made during maintenance. A physical sleep/wake cycle and actual seven-day outcomes remain unverified.

## Latest live verification — 5 November 2026

The evening session completed at **19:22 WIB** after its saved **19:05:38 WIB** target. Its journal records **15 confirmed follows and 1 follow request**, consuming the full **16-action evening allowance**. At the 19:38 WIB status check the background worker was still running and idle, with **no active pause and 0 unresolved actions**; the saved evening window was complete. The expired morning and afternoon windows were not carried forward.

The implementation at that live check passed all **95 growth tests**, changed-file formatting and whitespace checks. Login startup and normal headless session execution have been verified on this Mac. Sleep/wake recovery was tested with simulated clock gaps and intercepted browser/network failures; a physical sleep/wake cycle and actual seven-day outcomes remain unverified. The dated sections below preserve earlier implementation and deployment evidence.

## Sleep and wake recovery — 5 November 2026

The owner requires automatic continuation after sleep and wake. An idle daemon resumes its schedule checks, and a connection interrupted during a batch can now recover automatically when no relationship change may have been submitted. Completed actions and allowances remain in SQLite; a retry does not repeat confirmed follows or reroll the daily schedule.

The browser explicitly records when a relationship click can dispatch. A known navigation/connection failure before that point cancels only the undispatched intent. An interrupted Unfollow restores its previous review-queue position so it can be freshly checked again. A failed read outside an action can also reconnect when there is no uncertain intent. Each retry uses a fresh headless browser, re-verifies @akalmesin and runs restriction checks. Retry delays increase from 30 seconds to at most five minutes, with wall-clock deadlines checked in at most 30-second chunks so a long sleep consumes the delay. Chromium closes during the wait.

HTTP blocks, login/verification requirements, warning dialogs, unknown UI and any failure after dispatch can still pause the worker. Their causes and uncertain reservations are never automatically cleared. A vanished page context or Chromium’s internal connection-error document can permit a fresh guarded read; an unexpected external domain cannot. Locator/UI timeouts are not classified as connection failures. The usual session windows and caps still apply: an expired window is skipped rather than carried forward.

All **95 growth tests passed**, including simulated clock gaps, intercepted Chromium failures and temporary journals. Coverage includes interrupted Follow/Unfollow preparation, continuation after already confirmed follows, gradual reconnect delays, preserved reservations after possible dispatch, and restrictions found during recovery. Changed-file formatting, whitespace and 22 local documentation links/anchors passed. Actual physical sleep/wake execution remains a separate live check. At **17:40 WIB on 5 November 2026**, the idle login job was restarted to load this change. The new worker was verified running with **no pause and 0 unresolved actions**; the saved daily targets, candidate counts and last action timestamp were unchanged. Tonight’s target remains **19:05:38 WIB**. No live relationship changes were made while deploying this recovery update.

## Local Mac startup — 5 November 2026

Verification: **80/80 growth tests passed**, including saved randomized plans and delays, late wake, completion across restarts, idle SIGTERM, stale local locks, preserved pauses, native plist parsing and a browser launch crossing session windows. Changed-file Prettier, `git diff --check` and 19 local README/runbook links and anchors passed.

The owner approved a new branch for automatic local startup and randomized timing. The tracked configuration now uses 30–59 seconds of intentional waiting after each action result, and daily starts chosen in the first hour of each session. Browser loading and verification can make the actual gap longer than one minute. Random timing is a scheduling preference; it does not establish platform permission or reduce a measured enforcement risk.

Chosen starts, spacing deadlines and successful session completion are saved in SQLite. Restarting cannot reroll a plan, repeat an automatically completed window, or reset allowances. Opening the Mac at 09:00–10:00 can still run a morning target that has passed, provided the 09:00–11:00 window is open. Expired windows are skipped. All existing account checks, pauses, seven-day reviews and 17/17/16 caps still apply.

The optional user LaunchAgent starts the headless daemon at login. It uses the exact Node executable and absolute repository/config/state paths, writes to the private worker log, and does not keep relaunching after a restriction or error. An idle daemon resumes its schedule checks after sleep. Normal idle SIGTERM shutdown exits cleanly; uncertain actions and unexpected browser failures still require reconciliation. Startup can reclaim a crashed lock only when the recorded local PID is proven stopped; all lock-file changes now share the SQLite coordinator described above.

At **16:52 WIB on 5 November 2026**, the user LaunchAgent was installed, loaded and passed native `plutil -lint`. It stopped on the existing **4 November 20:30 WIB `ABORT_ERR` pause**, preserving the original reason and timestamp, with **0 unresolved actions** and **0 follows reserved today**. No new live relationship changes were made during setup. The owner subsequently approved resuming with “Ok then” after the saved @akalmesin login passed a headless read-only check at 17:14 WIB. At **17:19 WIB**, the old abort pause was cleared through `resume` and the installed job was started through `autostart-start`. The running worker was verified with **no pause and 0 unresolved actions**. Tonight’s saved target is **19:05:38 WIB**, checked on the 30-second polling cycle, for at most **16 follows**. Earlier expired windows are skipped. An idle snapshot showed only the Node worker (about **46 MiB RSS, 0.1% CPU**) with Chromium closed; this is a snapshot, not an active-session resource bound. Execution of the evening session had not yet been verified at that point; its later result is recorded in the [latest live verification](#latest-live-verification--5-november-2026). Actual seven-day outcomes remain unverified. Historical results in older sections do not establish that a process is still running.

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

| Session   | Saved daily target, WIB | Allowed window, WIB | Maximum new follows |
| --------- | ----------------------- | ------------------- | ------------------- |
| Morning   | 09:00–09:59:59          | 09:00–11:00         | 17                  |
| Afternoon | 13:00–13:59:59          | 13:00–17:00         | 17                  |
| Evening   | 19:00–19:59:59          | 19:00–22:00         | 16                  |

The three sessions share a maximum of 50 per WIB calendar day. A session starts when its saved target is due and the Mac is awake within its allowed window; it does not spread each follow uniformly through that whole window. The intentional wait is selected once per previous action result between `minDelaySeconds` (30) and `maxDelaySeconds` (59), and retained across restarts. `sessionStartJitterMinutes` (60) bounds the saved daily starts. Omitting these optional settings preserves fixed-delay/window-start behavior for older configurations. Missed sessions are skipped; their allowance is not moved into a later session. If pre-click preparation crosses the window boundary, the mutation guard blocks dispatch and the worker cancels only that proven undispatched intent without pausing future sessions. Its unused reservation is released; confirmed or uncertain actions keep their existing counts. Times can be adjusted in config without overlapping windows or increasing the agreed caps.

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

`daemon` runs while its process and this Mac are awake. Ctrl+C stops a foreground run. Normal run, preview, reconcile and daemon sessions use headless Chromium with the saved login; only explicit `login` opens a visible browser. Chromium closes between batches. Schedule checks run every 30 seconds. The worker does not keep the Mac awake and cannot act while it is asleep or off. `run` explicitly executes the current window within its allowance even before the chosen automatic start, and records successful completion for the daemon; outside all windows it exits without opening a browser.

### Automatic login startup on macOS

Use the same checkout and private state directory for every command:

```sh
npm run instagram:growth -- autostart-install
npm run instagram:growth -- autostart-status
```

Installation writes `~/Library/LaunchAgents/com.akalmesin.instagram-growth.plist` and loads it for the current GUI user. It may start immediately as well as at future logins. No root service or passwords are installed. An already running job is not force-restarted. The job stores the exact Node 24+ path; reinstall if that executable or the checkout is moved. Only the browser-path environment overrides are carried into the job, never unrelated tokens. Browser creation itself participates in guarded reconnect handling for known transient failures; configuration/profile errors still stop.

A persistent pause is preserved at login. Resolve its cause and any uncertain actions before explicitly resuming and starting the loaded job:

```sh
npm run instagram:growth -- resume
npm run instagram:growth -- autostart-start
```

`pause` persists a stop. `autostart-start` starts a stopped loaded job without killing an active one or clearing a pause. To disable automatic startup and stop the job while retaining its journal, profile and logs:

```sh
npm run instagram:growth -- autostart-uninstall
```

The installer refuses to overwrite or operate an owner-edited/different job definition. Inspect a mismatch before changing it. A stopped/failed job is not repeatedly restarted; its saved pause and log explain any required action.

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

Eligible accounts are ordered by never-reviewed status, then oldest last review, then relationship age. A deferred pending request or unknown observation can normally be inspected once per WIB day and rotates behind less recently reviewed accounts on later days. A safely cancelled Unfollow is eligible for a fresh inspection during connection recovery. Each session inspects at most 17 due accounts and makes at most 17 unfollows; a backlog can take longer than seven days. Pending private requests are left pending. If acceptance is first observed later, a new seven-day clock starts then. Relationships ended manually are preserved. Unfollowed accounts are permanently excluded from future follows; this is a **local exclusion list**, not Instagram's Block feature.

Usernames can change. Automatic unfollow requires a freshly verified numeric account ID matching the ID recorded at follow time. A missing ID defers review; a changed ID excludes that username without changing the relationship. Known numeric IDs are checked across usernames before a follow, so a previously processed/excluded identity is skipped after a rename when that ID is available. The fresh ID is saved before the click. When metadata is unavailable, username history still applies and existing follows are protected by the pre-action check; cross-username matching cannot be guaranteed. Unfollowed usernames remain in the local exclusion list.

## Stop and recovery

Instagram restrictions, verification challenges, blocked HTTP responses, unexpected pages, unknown controls and unconfirmed clicks stop the worker. A persistent pause survives restarts. There is no automatic retry of restrictions or uncertain submissions, challenge solving, stealth mode or account rotation. The daemon only reconnects after proven read interruptions as described in the [sleep/wake recovery section](#sleep-and-wake-recovery--5-november-2026). No warning appearing is not proof that Instagram permits the automation or that the account is safe.

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
