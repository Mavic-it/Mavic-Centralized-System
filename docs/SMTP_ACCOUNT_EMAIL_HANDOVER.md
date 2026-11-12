# SMTP account credential email

This implements the attached Automatic Password Generation and Email Delivery request within active HRIS Phase 1. It replaces the previous Resend-specific email adapter with a shared NestJS EmailModule using @nestjs-modules/mailer and Nodemailer. Existing password-reset verification/approval and branch rules remain in place.

## Setup

Install workspace dependencies with Bun. Set these in the API deployment environment or application/api/.env (never commit secrets):

```dotenv
SMTP_HOST=smtp.your-provider.example
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_smtp_username
SMTP_PASSWORD=your_smtp_password_or_app_password
SMTP_FROM="Mspaces <access@your-company.example>"
FRONTEND_URL=https://your-hris.example
TEMPORARY_PASSWORD_TTL_HOURS=24
```

Port 587 uses mandatory STARTTLS. Port 465 requires SMTP_SECURE=true and uses TLS immediately. Certificates are validated; TLS 1.2 or newer is required. Connection/greeting/socket timeouts and a 30-second mailer send timeout prevent indefinite waits. No SMTP debug output, message preview, file attachments or URL content fetching is enabled. The frontend proxies allow 60 seconds for credential sends. Blank SMTP_HOST disables delivery without breaking unrelated routes; malformed configured values stop startup with variable names, never secret values. FRONTEND_URL must be an HTTPS origin; APP_ENV=development permits HTTP localhost/127.0.0.1/::1 only. Do not use an HTTPS URL unless the application actually serves HTTPS there.

For Gmail, use smtp.gmail.com, port 587, SMTP_SECURE=false, the complete Gmail address as SMTP_USER, and an eligible Google app password as SMTP_PASSWORD. Use an allowed From address for that account; organization policies may restrict app passwords or sending identities. Other providers use their own SMTP credentials. See [Google app passwords](https://support.google.com/accounts/answer/185833), [Nodemailer SMTP/TLS](https://nodemailer.com/smtp), and [NestJS Mailer](https://nest-modules.github.io/mailer/docs/mailer.html).

The old RESEND_API_KEY, PASSWORD_RESET_FROM_EMAIL and PUBLIC_APP_URL values no longer configure email delivery. No real environment values were changed during implementation. Restart the API after configuring SMTP.

After building the API, run `node scripts/check-smtp.mjs` from application/api to check configuration and SMTP authentication without sending a message. The command reports missing variable names or safe error codes and never prints secrets. An authenticated SMTP connection still does not guarantee that the configured From address will be accepted; verify that address with your provider.

## API and account workflow

- POST /users retains its existing identity, employee and branch fields and success/data/message envelope. A legacy optional password field is accepted for compatibility but ignored; the API always generates a 12-character password with cryptographic randomInt and rejection sampling, including all four required character classes. It uses the existing salted PBKDF2 hashing and existing first-login guard. No generated password or hash is returned to the browser or recorded in audits/logs.
- Creation sets must_change_password and a configurable expiry, persists a PENDING credential-delivery state, then commits a PROCESSING attempt claim. Normal sign-in is blocked until SMTP acceptance is persisted. The creation response adds emailDelivery=ACCEPTED_BY_PROVIDER or FAILED. Success means provider acceptance, never confirmed inbox delivery. The implementation has no queue and does not claim a queued email.
- A failed email preserves the created account. User Access displays its delivery state and offers Regenerate & email to Super Admin/IT Admin. POST /users/:id/regenerate-credentials creates a new password/hash/expiry and revokes sessions. It only serves active automatically provisioned accounts still awaiting their initial password change; it cannot bypass the recovery review process for established accounts. IT cannot act on a Super Admin, and self-regeneration is prohibited.
- Current attempts hold a two-minute lease; retries within 30 seconds are rejected. No automatic retry replays a saved plaintext credential. Interrupted/uncertain sends must be recovered with explicit regeneration after the lease. A stale result or changed email cannot activate a credential. SMTP acceptance followed by a database failure leaves PROCESSING and blocks login until recovery. This is a recoverable synchronous boundary, not a claim of exactly-once external delivery.
- Account creation, generation attempts and delivery outcomes are audited using IDs, safe status enums and timestamps only. Email templates have escaped HTML and plain-text alternatives. The initial password expires in 24 hours by default (1–168 configurable hours); approved password-reset recovery retains its existing one-hour lifetime.
- The existing /auth/change-password validates the current credential, checks strength/reuse and expiry, clears must_change_password/temporary expiry, audits and revokes sessions. An optimistic hash/expiry check prevents it from overwriting a concurrent regeneration. Ten password-verification attempts per user per 15 minutes are allowed. Existing login throttling remains.
- Existing administrative manual password changes remain available for established accounts; automatically provisioned first-login accounts must use the email regeneration flow. The password-reset queue now sends its temporary access and security notices through the same SMTP service.

## Migration and rollout

Migration 1792540802000-AccountCredentialEmail adds delivery status/attempt/timestamp/failure fields to users and a unique index on lower(email). Legacy accounts default to NOT_REQUIRED; existing passwords, roles, employee links and branches are preserved. If existing emails differ only in case, resolve those duplicate identities through an authorized process before running this migration; the migration does not merge/delete accounts. The database check constrains allowed status values. Down is intentionally non-destructive and preserves account metadata.

1. Build the API: bun run build from application/api.
2. Review/apply the migration with the normal deployment runner, or run `node scripts/migrate-account-credential-email.mjs --apply` to select only this migration. Without --apply the script reports pending status. Apply schema before the updated API/web rollout.
3. Configure SMTP/FRONTEND_URL and restart the API. Deploy the updated web application together with the API. Older clients' supplied initial passwords are ignored; update operational procedures to use emailed credentials.
4. Verify provider acceptance and actual inbox delivery using an explicitly authorized test account. No real credential email was sent during implementation validation.

The configured local database is loopback and reports no pending account-credential migration. Database integration fixtures use connection-local temporary tables and roll back; no real employee or account credentials were modified by validation.

## Limits and review

- Existing sessions, login/password-change rate limits and revocation are process-local. Multiple API replicas require shared session revocation and distributed abuse controls. Regeneration claims/cooldowns are persisted in PostgreSQL and work across replicas.
- SMTP timeout/rejection is reported safely; raw provider errors are suppressed. Provider acceptance is not mailbox delivery, and no bounce webhook is implemented. Late/uncertain SMTP completion can result in an obsolete credential email; regeneration always invalidates the old hash.
- Temporary-password email is weaker than a single-use password-setup link. The requested password flow is implemented; plaintext exists only transiently in API memory and the outgoing email.
- HTML/text rendering, delivery failure, login expiry, first-login restrictions, permission boundaries, duplicate prevention, concurrent/stale attempts and password-change races have focused tests. Real SMTP credentials and production inbox delivery remain operator validation steps.

## Final verification (2026-10-21)

Passed: 156 API foundation/security/email tests; seven PostgreSQL integration tests; seven frontend/proxy tests; API/web production builds; web TypeScript and changed-file ESLint. Full API lint passes with pre-existing warnings in unrelated leave/system/user test files. The PostgreSQL fixtures were rolled back, migration status is current, and check-smtp reports missing configuration without sending email. Real provider acceptance and inbox delivery were not exercised because local SMTP configuration is absent.


Credential email display (2026-10-21): generated passwords default to 12 characters, with supported lengths of 8-12 and all four character classes retained. HTML and plain-text expiry use Singapore time, for example `oct 21,2026 | 10:30pm (SGT)`. Actual expiry durations are unchanged.

Password reset email consolidation (2026-10-21): approved issuance now sends one credential email containing the reset security notice; removed the second issuance email. Sender display name and credential email banner are Mavic Notification System, preserving the configured sender address. The separate notice after an actual password change remains. Phase 1 remains active.

Development LAN login recovery (2026-10-21): API startup rejected the configured HTTP private-LAN FRONTEND_URL, leaving login proxy requests at 503. Email configuration now permits valid RFC1918 IPv4 HTTP origins only under APP_ENV=development, alongside existing localhost exceptions. Public/lookalike HTTP hosts and production HTTP remain rejected. No environment secrets were changed. All 29 email configuration/delivery tests passed. Phase 1 remains active.
