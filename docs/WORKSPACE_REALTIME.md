# Workspace realtime updates

Implemented October 26, 2026. Scope: automatic refresh of existing data-backed modules, notification inboxes and future modules using the shared integration. Main HRIS Phase 1 remains active; planned business modules are not implemented by this infrastructure change.

## Contract and trust boundaries

A committed database write produces a generic refresh signal. The authenticated API streams that signal to connected browsers using Server-Sent Events (SSE); the same-origin Next.js proxy forwards the existing HttpOnly session cookie. The signal contains only `{refresh:true}`. It contains no record IDs, user IDs, employee names, branch names, reasons, payroll data or other business fields. Each browser reloads its own permitted data through the existing authenticated and scoped API endpoints. SSE never grants record access or bypasses role/branch/ownership checks.

This is server-to-browser push; normal mutations still use the existing HTTP APIs. A websocket dependency is not needed for this one-way notification channel. It refreshes existing notifications; it does not invent a notification or send email for every edit.

## Coverage

- Employees, 201/profile/documents, user access, My Profile/My Portal, attendance/DTR/rosters, branches/departments, leave management/My Leave/settings/balances/reports use RealtimeQueryProvider for all existing QueryClients, including nested providers.
- Notification inbox and recovery queue subscribe to the same connection. Recovery refreshes in the background and guards against older responses overwriting newer results.
- The active branch selector reloads permissions/options. Open branch details now fetch the selected record, rather than retaining a copied list row indefinitely; lost access/deletion displays a refresh error instead of stale details.
- Server components refresh through the workspace realtime monitor, preserving mounted client state. Existing form drafts and current filters/page selections are retained; permission changes can still cause the normal access redirect.
- The operations overview currently imports static demonstration data from app/data/dashboard. Refresh infrastructure does not turn those constants into live operational analytics. Likewise disabled Soon modules need their future real APIs/screens before they can show live business data. Existing in-memory API services receive same-process mutation refresh signals, but this work does not make their storage persistent or shared.

## Backend design

`RealtimeService` owns one dedicated PostgreSQL LISTEN connection per API process, separate from the normal query pool. PostgreSQL NOTIFY reaches other listening API processes. Listener outages reconnect with capped exponential backoff; reconnection emits a reconciliation signal. Read-side and auth errors never log cookies, connection strings or record content.

Migration `1792972802000-WorkspaceRealtime` installs an invoker-security trigger function and statement-level INSERT/UPDATE/DELETE/TRUNCATE triggers on application tables in the current schema, excluding migrations/typeorm metadata. PostgreSQL delivers notifications at commit, suppresses rolled-back writes and deduplicates identical signals within one transaction. Bulk imports therefore do not push one payload per row. The configured local DB records the migration and has 43 public-table triggers. No business row was edited to activate it.

The global HTTP interceptor also signals successful authenticated POST/PUT/PATCH/DELETE requests. This covers current in-memory services and future REST modules before their tables receive triggers. Preview POSTs are excluded to prevent refresh loops. A future read-only POST must use RealtimeReadOnly or a /preview route. Persistent partial changes can still produce a signal through database triggers even if a later HTTP operation fails.

GET /realtime/events uses the normal AuthGuard and caps six connections per account per API process. It rechecks the server session, active account/current role and forced-password-change state every 20 seconds, closes invalid sessions and cleans up subscriptions/timers on disconnect. Heartbeats keep healthy streams alive. A stream contains no private event history to replay; clients reconcile on reconnect. Session storage remains the existing process-local implementation; multiple API replicas still require the existing sticky-session/shared-session deployment decision.

## Frontend behavior

There is one shared EventSource per browser tab across all mounted subscribers/caches. Refresh bursts are coalesced for 500 ms. TanStack invalidates caches, refetches mounted enabled queries and marks dormant queries stale for the next visit. Hidden tabs defer refresh work until visible. Reconnect and browser-online events refresh missed changes. Disconnected/unsupported streams use a 30-second refresh fallback. A stream without a heartbeat for over 60 seconds is replaced. Last unsubscribe closes the connection and clears timers/listeners.

The proxy forwards streaming chunks without buffering, uses no-store/no-transform and X-Accel-Buffering:no, aborts upstream on browser cancellation, and limits connection setup to eight seconds without imposing an eight-second stream lifetime. It preserves 401/403/429/503 status responses without exposing upstream error details. Reverse proxies must also disable response buffering and allow long-lived responses; constrained serverless runtimes may reconnect more frequently.

## Future module integration

1. Use the existing authenticated API and preserve role, branch and ownership checks. Successful REST mutations already trigger the global interceptor.
2. Wrap a module QueryClient with `RealtimeQueryProvider` from app/components/realtime-query-provider.tsx. Do not create another EventSource per component. Effect-based loaders can subscribe to workspaceRealtime or include useRealtimeRevision in their fetch dependencies; cancel stale requests and preserve draft state.
3. For new persisted tables/background jobs, call `installRealtimeTriggers(queryRunner)` from the new migration after creating the tables, in the intended schema. This guarantees commit-aware updates even for scheduler jobs, direct imports and non-HTTP writers. `RealtimeService.changed()` is also available after a successful commit for non-table/in-memory jobs; do not call it before commit.
4. Mark any new read-only POST with `@RealtimeReadOnly()` to avoid a refetch-feedback loop. GET/HEAD/OPTIONS never trigger the HTTP fallback.
5. Add focused authorization/rollback/reconnect tests. Do not place sensitive business fields in realtime payloads.

## Rollout and recovery

Build the API and run `node scripts/migrate-workspace-realtime.mjs --apply` from application/api before restarting the updated API. Without --apply the runner only checks pending migration status. Build/deploy the web app with its new /api/realtime/events proxy. No SMTP, credits, leave approval settings or scheduler activation is required. PostgreSQL LISTEN needs a session-capable/direct connection; transaction-mode poolers must not be used for this dedicated listener.

The migration changes trigger/function objects only. Down removes those realtime objects without deleting business data; HTTP refresh signals and browser fallback remain. Keep the client/server versions coordinated if rolling back the stream endpoint. Existing environment files and secrets are unchanged. Added development-only @types/pg; Bun dependencies/lockfile were synchronized with scripts disabled after npm's mixed install caused an Ajv/ESLint resolution error. ESLint then passed with the correct Ajv dependency.

## Validation

- Full API suite: 386 passed, one optional test skipped. API lint passed with four pre-existing unrelated warnings.
- Isolated PostgreSQL realtime suite: five passed. Tests cover two independent listeners, no pre-commit/rollback events, transaction batching, future-table installation, reversible trigger removal and real HTTP delivery to two authenticated clients while anonymous access is denied. Fixtures use an isolated schema/channel and test-only sessions; no real employee mutation, notification or email is sent.
- Initial full frontend suite: 174 passed. Added query-client bridging regression passed separately; final suite count is recorded in the HRIS inventory after completion. Tests cover shared connections, batching, hidden tabs, disconnect/reconnect/fallback, stalled streams, cleanup, subscriber isolation, proxy cookie/status/cancellation handling, and separate active/dormant query caches.
- API builds, web TypeScript and changed-file web lint passed. Final production web build result is recorded in the HRIS inventory; the repository has a previously documented unrelated workStore prerender issue.
- Local API health returned 200 and direct/proxied anonymous realtime requests returned 401. One dedicated realtime database listener was active. These checks do not claim a signed-in production multi-user acceptance run.

Manual acceptance: open two signed-in browser profiles with permitted access to the same employee/request/branch. Change a record in one, and verify the other visible list/detail/balance/notification refreshes without a document reload. Leave an unsaved form open and confirm its draft remains. Repeat with an unauthorized branch/account to confirm no additional data becomes accessible. Disconnect/reconnect the network and verify catch-up. Use staging/test identities for any business mutation.

Final checks: all 175 frontend tests passed. Production Webpack compilation and TypeScript passed, but prerendering failed with the existing Next.js workStore invariant on /change-password (also reported /leave/balances); the production web build is not claimed as passing. No unrelated framework fix was introduced. Fresh-process Express JSON parsing returned 200 after dependency synchronization. Two identified API watchers were replaced with a single clean development watcher to clear cached pre-install type/module errors and competing builds; DB synchronization and startup migrations remain disabled. This restart may require users to sign in again because existing sessions are process-local.
