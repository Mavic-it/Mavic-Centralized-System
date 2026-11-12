# Leave filing notice rules

Implemented October 26, 2026 within the authorized leave slice; main HRIS Phase 1 remains active.

## Agreed rules

| Leave type | Minimum notice |
| --- | --- |
| Vacation Leave (VL) | 1 calendar day |
| Service Incentive Leave (SIL) | 1 calendar day |
| Leave Without Pay (LWOP) | 1 calendar day |
| Sick Leave (SL) | 0: same-day filing allowed |
| Emergency Leave (EL) | 0: same-day filing allowed |

All new filings block past dates. A calendar day's notice means the next Philippine calendar date, not 24 elapsed hours. There is no additional time-of-day cutoff. Eligibility, working schedules, holidays, credit requirements, overlap checks and attachment rules still apply.

## Usage

In My Leave -> Request Leave, choose the leave type first. The form shows current Philippine date/time from the server, refreshed every 30 seconds. Start and end default to a single day on the earliest permitted calendar date for that type. Both remain editable; changing the type resets the dates to that type's default. This replaces the previous uniform tomorrow-through-following-day default. Nonworking days are still handled by the existing preview; the earliest permitted calendar date is not a promise of a scheduled workday.

In Leave Settings -> Edit leave policy, **Minimum advance notice (calendar days)** supports 0 through 365. Zero permits today, 1 permits tomorrow, 2 permits the day after tomorrow. The type list summarizes the rule. Saves create the existing versioned policy records.

The backend validates notice in the shared quote path used by preview and submission, using the server's current Asia/Manila date. Browser-supplied clock/time values are not accepted in filing DTOs. After a date boundary the form refreshes its clock within 30 seconds; the backend checks again at submission even before the form refresh. Explicit invalid dates show guidance and submission is disabled. A clock-fetch error blocks filing until retried; there is no browser-clock fallback. Existing drafts are not automatically submitted or shifted to different dates.

## Rollout and compatibility

Migration `1792972800000-LeaveFilingNotice` appends the agreed initial rules for the five known codes as new policy versions. It preserves older versions and all request snapshots/credit history, skips types with an already configured notice value, and does not activate a future-effective policy prematurely. Other/custom types and older effective policy versions without the field use zero notice for new filings, with past dates still blocked. Set custom notice periods explicitly in Leave Settings as needed.

The migration runner is `application/api/scripts/migrate-leave-filing-notice.mjs`: without arguments it reports pending status; `--apply` applies this migration transactionally. The configured local database now records the migration and reports no pending filing-rule migration. No grants, decisions, requests, emails, environment-file edits or schema synchronization were performed. A published policy should be changed through another version rather than deleting history; the migration intentionally rejects destructive down rollback.

Existing pending/approved requests are not revalidated for notice during decisions or cancellation. They retain their snapshots and existing rules. This restriction applies to new filing, including previously possible retrospective filing. DTR reconciliation tests now submit their historical fixture before its leave date using a controlled test clock.

The local API watcher had no active listener during verification. It was replaced with the newly compiled API on port 4000, with process-local DB_SYNCHRONIZE=false and DB_MIGRATIONS_RUN=false. This is a compiled runtime; future source changes require a rebuild/restart or a separately restarted development watcher. Session state is process-local, so users may need to sign in again.

## Verification

- 23 focused API leave tests passed, including notice periods, Manila midnight/month/year/leap-day boundaries, direct backend enforcement and non-overwriting policy rollout.
- 15 PostgreSQL isolated-schema workflow tests passed, including preservation of prior versions, requests and ledger records and repeated migration idempotency.
- 14 focused web leave tests passed, including calendar arithmetic and notice wording.
- API production build and web TypeScript passed. API lint passed with four existing unrelated warnings. Changed-file web ESLint passed.
- Chrome actual-component fixture checks passed at 390px and 1440px for all five types, default/minimum/end dates, rule/time display, previews, past-date blocking, clock-failure blocking and no document overflow/runtime errors. These use artificial API data, not real employee submission. Evidence: `tmp/leave-filing-review/checks.json` and screenshots. Sandbox Chrome debugging timed out; the permitted browser check outside the sandbox passed.
- Local health returned 200; direct/proxied unauthenticated new endpoint checks returned 401 rather than 503. Signed-in production submissions were not performed.

The web production build result is recorded in the maintained HRIS plan after completion.

Final verification: repeated Chrome fixture checks also passed an open-form midnight rollover: the original selected date stayed unchanged, the minimum date advanced with server PHT, and submission became blocked. Web production build reached successful compilation and TypeScript after allowing the existing Geist download, but prerendering /_global-error and /change-password failed with the previously documented Next.js workStore invariant. The production web build is not claimed as passing; unrelated framework/auth-route code was not changed. The local development frontend and restarted API remain the runtime used for the live health checks.
