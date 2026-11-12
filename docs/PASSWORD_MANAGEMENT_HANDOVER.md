# Password recovery and account security

Implemented the password recovery foundation within the active Phase 1 foundation/auth boundary.

Current email setup (2026-10-20): the Automatic Password Generation feature replaces the Resend-specific adapter with a shared SMTP EmailModule using NestJS Mailer and Nodemailer. See [SMTP_ACCOUNT_EMAIL_HANDOVER.md](SMTP_ACCOUNT_EMAIL_HANDOVER.md) for the current SMTP variables, new-account delivery/regeneration, migration and rollout. Existing Resend environment values no longer configure sending.

2026-10-20 follow-up: recovery fields include format examples and help text, and submission shows an explicit success or retryable failure. Known and unknown identifiers retain the same success response. Account UUID lookup is supported alongside employee identifiers and email. New requests and notifications are inserted in one SQL statement; active `SUPER_ADMIN` and `IT_ADMIN` recipients receive one alert each, while duplicate open requests create none. The workspace bell fetches unread notifications every 30 seconds and on opening, links recovery alerts to the review queue, and marks alerts read through an authenticated, recipient-scoped API.

Migration `1792540801000-AccountRecoveryNotifications` allows `notifications.branch_id` to be null for standalone accounts, preserving existing foreign keys and rows. Apply it before deploying the updated API: after building the API, run `node scripts/migrate-account-recovery-notifications.mjs --apply` from `application/api`. The runner selects only this migration. Local verification reports no pending notification migration. Eleven focused API tests, API build, focused API lint and web TypeScript passed; a rolled-back database check verified two active admin recipients, deduplication and nullable branch support without persisting requests or alerts.

## Existing patterns reused

Authentication already used PostgreSQL `users`, bcrypt/PBKDF2 password hashes, role checks, branch access, an HttpOnly `mspaces_session` cookie, user status checks, and audit logs. The existing app had a public `/forgot-password` route allowance but no recovery API, no account password-change API, and no email adapter. Sessions are held in a process-local map.

## Flow now available

1. `/login` links to `/forgot-password`. The public form accepts a registered email, account UUID, or employee number plus an optional message. Known and unknown identifiers receive the same generic confirmation. Pending requests are deduplicated and a per-process IP limit allows five submissions per hour.
2. Authorized Super Admin, IT Admin, HR Admin, and Branch Manager users can open **System → Password reset requests**. Authorization is checked by the API with the `password_resets` permission and scoped to authorized branches for branch roles. A requester cannot verify or approve their own request.
3. An administrator records identity verification, approves, then issues a temporary password. The API generates it with cryptographic `randomInt` and rejection sampling, sends it only to the account email on file through SMTP, and activates its PBKDF2 hash only after the provider accepts the email. The recovery credential expires in 60 minutes, and the plaintext is not returned or persisted. Failed dispatch leaves the request approved and retryable; retry generates a new credential. Newly created accounts use a separate configurable 24-hour first-login credential as described in the SMTP handover.
4. A temporary-password login receives a restricted session. Server API guards allow only session inspection, logout, and password change until the user changes it. The UI redirects the user to `/me/security`; this page also serves ordinary password changes for every role, including standalone admins without an employee profile. Password changes invalidate current-process sessions, reject reuse of the current password, write an audit entry, and send a best-effort security notice.

Provider acceptance is shown separately from inbox delivery. Dispatch failures are retryable with a newly generated credential. The integration does not yet process provider bounce webhooks, so a later mailbox delivery failure after provider acceptance cannot automatically transition a request back to retry. A separate reset security notice and password-change notice are best-effort emails and contain no credential.

## Migration and configuration

Additive migration: `1792540800000-PasswordRecovery`. It adds password state columns to `users` and creates `password_reset_requests` with review/approval/fulfillment fields, delivery status, indexes, and an open-request uniqueness constraint. Existing users default to normal password status. The migration was applied to the configured local database; it must also be applied to each deployment before the updated API is released. The repository's TypeORM configuration has `DB_MIGRATIONS_RUN=false` unless explicitly enabled; review pending migrations and apply through the normal migration deployment process. In PowerShell, after review, run the API once with:

```powershell
$env:DB_SYNCHRONIZE = "false"
$env:DB_MIGRATIONS_RUN = "true"
bun run start:prod
```

The configured TypeORM runner applies all pending migrations.

Set these API environment values to enable credential email (see the SMTP handover for validated values and TLS settings):

- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`: provider host, port and TLS mode.
- `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`: provider authentication and allowed sender.
- `FRONTEND_URL`: public HTTPS origin used to build the login link.

With SMTP disabled, issue attempts report email failure and do not alter the recovery account credential. No real provider credentials were added to `.env` or `.env.example`.

## Verification and known limits

Focused API checks passed: 18 tests across password recovery, authorization, authentication, and session suites. API production build and API lint passed (lint reports existing warnings in unrelated leave/user tests); web production build, TypeScript, and changed-file ESLint passed. Live local API smoke checks returned database health 200, the generic public response, and 401 for unauthenticated admin and password-change endpoints. No provider delivery was exercised because this environment has no configured credentials. No account credentials were reset by these changes; the smoke requests used unmatched test identifiers.

The repository's session registry and rate limits are process-local. Production deployments with multiple API replicas need shared session revocation and distributed rate limiting before relying on reset-session invalidation and public abuse controls across replicas. The admin queue currently loads at most 300 records per selected status; search/date filters operate on those loaded rows. Identity verification remains the administrator's documented HR/IT process; this feature does not collect sensitive documents or claim independent identity proof.

The temporary-password-in-email design is weaker than an approved single-use reset link. It sends only a temporary credential, never the permanent password. Replacing it with single-use links remains a future security improvement.

Follow-up final verification: changed-file web ESLint and web production build passed.


Simplified recovery approval (2026-10-21): removed the separate Verify identity action/API and verification prerequisite. Authorized administrators approve pending requests directly, then generate and email temporary access. Legacy VERIFIED requests remain approvable and display as pending; historical verification data is retained. Removed the verification filter/timeline step. Self-review restrictions, branch permissions, audit, approval-before-issuance and expiry remain. No schema or active Phase 1 boundary change.
