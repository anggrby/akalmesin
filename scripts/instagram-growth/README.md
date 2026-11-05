# Instagram growth worker

A local, owner-authorized follow experiment for **@akalmesin**. It collects candidates from a source account’s visible followers or an exact post’s likes, follows new candidates within persistent limits, and reviews managed relationships after seven days. Confirmed non-followers can be unfollowed and excluded from future follows. Normal operation is **headless**; manual login is the only command that opens a visible browser.

Start with the repository’s [AGENTS.md](../../AGENTS.md). The [operating runbook](../../docs/instagram-growth.md) owns approval scope, schedule, recovery procedures, current status and live verification. [instagram-growth.config.json](../../instagram-growth.config.json) owns executable settings. This README explains the code and how another agent should approach it; it does not grant permission to increase limits, change accounts, publish posts or send messages.

## Before operating an existing checkout

Run commands from the repository root with **Node 24+**. The editorial pipeline’s Node 20 minimum does not cover this worker: its SQLite journal uses `node:sqlite`.

```sh
npm run instagram:growth -- status
```

Inspect the existing `.instagram-growth/worker.log` and the PID recorded in `.instagram-growth/worker.lock` before launching anything. A daemon may already be running headlessly. `status` reports local state; it does not prove the recorded process is alive.

**Do not launch a second browser-owning command to check whether the first is working.** Login, preview, run, daemon and reconcile share a process lock and browser profile. A competing command raises a lock error without changing the active worker’s lock or persistent pause. Use `status` and logs instead. Status and pause are allowed while the daemon is active.

Preserve the saved profile, journal, counters, exclusions, pause and unresolved actions. Do not clear local state, switch to a new state directory or delete a live lock to restart an allowance.

## Commands

| Command after `npm run instagram:growth --`             | Effect                                                                                                                                                           |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `status`                                                | Report local counts, current window/budget, pause and unresolved intents.                                                                                        |
| `login`                                                 | Open the dedicated visible browser for manual sign-in as @akalmesin. No follows/unfollows; successful login does not clear an existing pause.                    |
| `preview`                                               | Headlessly read the configured sources and persist the local candidate queue. No Instagram relationship changes.                                                 |
| `run`                                                   | Execute the current WIB window within its remaining allowance, then exit. Outside all windows, exit without opening a browser.                                   |
| `daemon`                                                | Wait for daily windows and execute each while this Mac is awake. Uses saved daily starts and completion; a late wake can execute a due target inside its window. |
| `pause --reason "operator pause"`                       | Persist a stop; the worker exits when it observes the pause.                                                                                                     |
| `reconcile`                                             | Read current relationships and resolve uncertain journal entries conservatively. No Follow/Unfollow clicks, but local history/protection can change.             |
| `resume`                                                | Clear the pause only when no uncertain actions remain. This does not start the daemon.                                                                           |
| `exclude --username someone --reason "owner exclusion"` | Add a local exclusion; this does not use Instagram’s Block feature.                                                                                              |
| `autostart-install`                                     | Install/load the macOS login job using this checkout and private state.                                                                                          |
| `autostart-status`                                      | Inspect installation, loaded status and current PID without launching a browser.                                                                                 |
| `autostart-start`                                       | Start the installed job after recovery, preserving pauses and an already running process.                                                                        |
| `autostart-uninstall`                                   | Stop/remove login startup; retain all worker state.                                                                                                              |
| `unlock`                                                | Remove a crashed process’s lock only after its recorded PID has stopped.                                                                                         |

For a fresh setup, install the existing dependencies and Chromium (`npm ci`, `npx playwright-core install chromium`), then follow the [runbook’s startup steps](../../docs/instagram-growth.md#start). Do not reinstall dependencies or open the profile while an existing worker is using them.

The foreground daemon can be stopped with Ctrl+C. A detached daemon is stopped with `pause`; its output is normally in `.instagram-growth/worker.log`. Optional macOS login startup is installed with `autostart-install`; see the [runbook](../../docs/instagram-growth.md#automatic-login-startup-on-macos). The job uses the exact Node executable and absolute paths, starts headlessly at login and preserves persistent pauses. It does not continually retry a failed/restricted worker. `autostart-uninstall` stops the job without deleting private state.

The Mac must be awake and connected. Schedule checks resume after an idle sleep. Targets are chosen once per WIB day and saved, with the tracked morning window now 09:00–11:00, so opening at 09:00–10:00 can use a due morning target. Missed windows are not moved into later windows. Successful automatic window completion survives restarts; an explicit manual `run` can execute its remaining allowance and records completion too. An orderly idle SIGTERM exits without creating a pause; uncertain actions or unexpected browser errors still stop persistently.

## Code map

| File                                                           | Responsibility                                                                                                                          |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| [../instagram-growth.mjs](../instagram-growth.mjs)             | Public entry point and Node 24 version check.                                                                                           |
| [cli.mjs](cli.mjs)                                             | Commands, config loading, process lifecycle, manual login, headless launch and daily window loop.                                       |
| [core.mjs](core.mjs)                                           | Config validation, WIB windows, SQLite store, budgets, durable action records, identities, exclusions and pause state.                  |
| [runner.mjs](runner.mjs)                                       | Process lock, candidate collection, session execution, spacing, due reviews and read-only reconciliation.                               |
| [browser.mjs](browser.mjs)                                     | Playwright adapter: account/target verification, visible source lists, relationship controls, reciprocal checks and restriction guards. |
| [recovery.mjs](recovery.mjs)                                   | Identifies interrupted reads, preserves warning stops and distinguishes preparation from submitted mutations.                           |
| [scheduler.mjs](scheduler.mjs)                                 | Persistent daily targets, late-wake eligibility and automatic window completion.                                                        |
| [autostart.mjs](autostart.mjs)                                 | macOS LaunchAgent definition, install/status/start/uninstall, exact Node paths and private logs.                                        |
| [runtime.mjs](runtime.mjs)                                     | Existing Playwright dependency and Chromium executable lookup; supports `AKALMESIN_CHROME_PATH`.                                        |
| [../../tests/instagram-growth/](../../tests/instagram-growth/) | Temporary-state core/runner tests and intercepted browser fixtures.                                                                     |

## How an action runs

1. Verify the signed-in account, active window, persistent pause and remaining budget.
2. Read the visible candidate pool, excluding the owner’s account and previously managed/protected/excluded candidates. Existing relationships are protected rather than adopted for automatic unfollow.
3. Wait until the deadline chosen once after the previous action result (30–59 seconds with the tracked config), including across process restarts. Browser work can add time beyond that wait.
4. Persist an uncertain intent **before** the browser mutation, reserving allowance. Where available, save the target’s numeric identity before the click and check known identities across usernames.
5. Click once, confirm the relationship, then finalize the journal. A stale Follow control may be confirmed with one fresh profile read, requiring the same numeric ID when an original ID was available; never repeat the click just to test whether it worked.
6. On restrictions, challenges, unknown controls or unconfirmed outcomes, persist a pause and stop. There is no automatic visible-browser fallback, challenge solving or evasion.

When the session window expires inside pre-click preparation, only the worker’s own mutation guard can prove that dispatch was blocked. It finalizes that intent as `cancelled`, releases its reservation and ends the session normally, preserving the candidate for a later attempt. This never clears an existing pause or resolves other uncertain actions. Once the guard has permitted dispatch, a later error remains uncertain even if it has a window-expiry code.

Seven-day reviews only manage this worker’s relationships. A missing lookup is **unknown**, never proof that someone does not follow back. An unfollow requires a matching fresh numeric target ID and fresh reciprocal evidence. Pending private requests remain pending; observing acceptance starts a new seven-day clock. Follow-backs are retained. Confirmed unfollows enter the permanent local exclusion list. Eligible reviews prioritize never-reviewed accounts, then the least recently reviewed, with at most one inspection per account per WIB day. Pending requests and unknown observations remain in this rotation. A safely cancelled Unfollow can be freshly inspected again during connection recovery. Review batches are bounded, so a backlog can take longer than seven days; see the [runbook](../../docs/instagram-growth.md#history-and-seven-day-reviews).

## Automatic continuation after sleep

The daemon resumes schedule checks after an idle sleep. During a batch, known transport/navigation failures can reconnect automatically only when no relationship mutation may have dispatched. The browser wraps each Follow/Unfollow attempt and records dispatch before the real click. This evidence allows the runner to finalize a failed pre-click intent as `cancelled`, release only its unused reservation and retain candidate eligibility. An interrupted Unfollow restores its previous review position. Confirmed history and counts remain intact.

`GrowthReadInterrupted` is the explicit recovery signal. A matching transport message alone cannot cancel an in-flight action. The daemon retries only with no pause or unresolved intent, recreates the headless browser and repeats account/restriction guards. Reconnect delays grow from 30 seconds to five minutes; wall-clock waits use chunks of at most 30 seconds. A long sleep can consume the delay. The browser closes between attempts. Targets and successful session completion remain saved, and retries stop when their window expires.

A possible dispatch, unknown UI, login expiry, restriction or challenge still requires the [normal recovery process](../../docs/instagram-growth.md#stop-and-recovery). Unexpected external domains are never treated as a connection failure. Browser-context loss and Chromium’s own network-error document can only permit another guarded read. Tests simulate sleep and disconnects; do not put the owner’s Mac to sleep merely to run a test.

## Reading status and recovering safely

An unresolved intent while the PID is alive, `paused` is null and logs are advancing can be an **in-flight action**. Do not call it a failure or reconcile concurrently. A stopped/paused worker needs investigation before resuming.

`status.schedule` reports saved targets and completion without generating or rerolling them; it may be empty before the first daemon/manual run on a new day. Chosen starts and spacing deadlines are part of the SQLite state, and must be preserved with the journal.

`budget.sessionUsed` and `budget.dailyUsed` are persistent allowance usage, including uncertain/reserved and abandoned follows; they are not necessarily confirmed-follower counts. `statuses.following` and `statuses.requested` are cumulative, last-recorded candidate states, not live Instagram counts or today’s totals. They can include protected/excluded recovered records or become stale after external relationship changes. Outside a window, `status.budget` is null. A `session-complete` log’s `follows`/`unfollows` counts only that invocation; after a restart/recovery, use the persistent budget for the session total.

Read-only `reconcile` may protect a recovered follow forever because it cannot prove the relationship was created by the worker. An absent uncertain follow becomes abandoned, stays excluded and still consumes its original allowance. A successful reconciliation does not clear a pause. Do not manually rewrite the database or replay a click to bypass these safeguards; use the [documented recovery sequence](../../docs/instagram-growth.md#stop-and-recovery).

## Maintaining and verifying

The login job executes the files at the installed checkout path. Keep that checkout on the new branch until the change is merged, and preserve private state when switching branches or moving the checkout. Running Node processes keep their loaded code and config. An edit does not update the active daemon. If a runtime change must take effect, stop it safely, verify it has exited and the lock is free, resolve any uncertain action, and restart with the **same** state directory. Do not restart the worker just to validate documentation.

Instagram’s UI is asynchronous and can change. Preserve guard-aware waits, exact account/target checks and visible-control uniqueness. In particular, `Following` can have an SVG title or hidden suffix in its DOM text; use the normalized visible label rather than matching the complete `textContent`. The source list can initially be empty while loading, and a successful Follow can leave the old controls visible. Keep regression fixtures for these cases; unknown results must stop instead of being guessed.

```sh
npm run test:instagram-growth
```

Growth tests use temporary SQLite state and routed HTML/network fixtures, never real account mutations. They require Node 24+ and installed Chromium. Run focused tests for the changed behavior and the full growth suite when appropriate. Check changed-file formatting with the repository’s Prettier dependency. Do not trigger real follows/unfollows as a unit test or use a real session merely to test a README edit.

Fixture success is separate from live verification. Use the latest [local runtime record](../../docs/instagram-growth.md#local-mac-startup--5-november-2026) and fresh runtime status for observed results; do not infer seven-day success from passing fixtures or assume the process mentioned in an old handoff is still alive.

## Local state and limitations

`.instagram-growth/` is git-ignored and contains `state.sqlite`, the dedicated `browser/` profile, `worker.lock`, and any worker logs or diagnostic evidence. Keep it private and out of commits, shared artifacts and chat dumps; never print cookies, passwords or tokens. Normal operation reuses this one directory. `--config PATH` and `--state-dir PATH` exist for explicit isolation, not for resetting production limits.

Only the usernames Instagram actually exposes in the visible list are collected. Some sources expose only a partial follower list; exhausting that pool needs another owner-supplied source, not an access-limit bypass. Numeric metadata can be missing: the current follow path can still proceed without an ID, so cross-username repeat protection cannot then be guaranteed, while automatic unfollow is deferred without a verified ID. Usernames can change, and likes do not prove interest in following akalmesin. The runbook documents these limits and the exact evidence required before an automatic unfollow.
