# Manual reservation payments

This extends the existing public booking app (3005), admin app (3000), NestJS API and PostgreSQL database. There is no payment gateway, money movement API or automatic screenshot verification.

## Contract and trust boundaries

- Existing reservations and recorded payments remain unchanged. New public bookings with a positive server-calculated amount require manual payment. Zero-price bookings retain the existing branch approval policy. A paid public booking cannot be created until an active official receiving account and a payment signing secret exist.
- The review page requests a server-side price quote. Booking creation recalculates from the room rate. A client cannot supply an authoritative price or verification result.
- The reservation reference is not a credential. A private 256-bit HMAC payment token is derived from the existing random submission-key hash and a server secret. It is returned with the receipt and included in email URL fragments. The client strips the fragment and keeps the token only in memory. Refreshing requires reopening the private email link. Never log request authorization headers, private links, tokens or payment evidence.
- Every staff operation checks effective Reservations list or Settings access, explicit denies and selected branch scope. VIEW can read but cannot modify. Only Super Admin may create or change global company receiving accounts; scoped Settings editors may manage branch accounts.
- Customer proof is base64 transported in a bounded JSON request and stored as private PostgreSQL `bytea`, never in either public assets directory. Maximum file size defaults to 5 MB, configurable from 1–10 MB. The API validates the size, allowed MIME, extension, base64 and file signatures. Proof responses require staff authentication, branch access, no-store, nosniff and a sandbox CSP. No storage path is exposed.
- Uploads never count toward money received. Only staff verification creates an existing `reservation_payments` ledger row. Transaction allocation is unique while pending, verified or refunded, normalized across punctuation and case. Staff must independently inspect actual company transaction records outside this application.
- Required deposit is snapshotted on creation (default 100%). Multiple verified payments may satisfy it. Full verified balance is `VERIFIED`; an incomplete verified balance is `PARTIALLY_PAID`. Legacy UNPAID/PAID records remain supported. An edited amount recalculates the balance and returns a confirmed paid booking to PENDING if the deposit is no longer met.
- Holds default to 30 minutes. A submitted proof gets a review deadline anchored to the original payment deadline plus the configured review window (default 1,440 minutes), capped at booking start. Resubmission does not extend that deadline. Expired pending holds stop blocking availability immediately; a 30-second worker records cancellation and audit/notifications. Room and reservation locks prevent concurrent writers from overselling.
- A late payment may be verified and recorded for reconciliation, but an expired/cancelled booking is never automatically restored. A refund is recorded only after staff independently confirms the completed full refund for a verified submission on a cancelled/rejected booking. This does not initiate a refund. Original ledger and evidence are retained; net paid balance subtracts confirmed refund records. Partial refunds are not supported by this first workflow.

## Component design

1. **Tree:** client PaymentPage → PaymentWorkspace → ReservationSummary, AccountInstructions, CopyButton, ProofForm and PaymentHistory. Admin ReservationsWorkspace → PaymentVerificationPanel; Settings → PaymentAccountSettings. Existing Field, Modal, cards and tables are reused.
2. **Responsibilities:** pages compose features; client components own local interaction only. API services own state transitions and persistence. A worker owns bounded expiry, reminders and retryable customer email.
3. **Contracts:** client Zod schemas in `payment-api.ts`; admin contracts in `payment-types.ts`; strict API DTOs in `manual-payment.dto.ts`. API errors use a safe `message` and HTTP status; client errors are displayed accessibly.
4. **State:** server data is refreshed after mutations and every 30 seconds. Draft fields, selected account, preview and review dialog are local state. Tokens remain in memory. Loading, empty, error, unauthorized, disabled, success, resubmission and destructive confirmation states are present.
5. **Visual hierarchy:** prominent amount/deadline, account instructions, then proof form; reservation summary beside them on desktop and below on small screens. Admin uses a horizontally scrollable queue and a detail modal; account forms use a two-column grid that stacks below 760px.
6. **Accessibility:** semantic forms/table, labels, required markers, native input validation, status/error announcements, visible focus, existing native modal focus trap and restoration, keyboard-operable controls. No payment-task animation; responsive layouts support zoom.
7. **Files:** API `manual-payment.*`, `manual-payment.security.ts`, migration and rollout script; client `payment.tsx`, `payment-api.ts`, `/payment/page.tsx`, booking review/receipt; admin `payment-account-settings.tsx`, `payment-verification-panel.tsx`, `payment-types.ts`, `payments.module.css`, `/reservations/payments/page.tsx`. Existing permissions, services, email and capacity logic are extended.
8. **Verification:** isolated PostgreSQL integration tests exercise hold creation, ownership, uploads, staff review, partial deposits, duplicate allocation, permissions, expiry, conflict prevention, notifications and refunds. Existing reservation tests remain part of the check set. Type checks, lint and production builds cover both frontends and the API.

## Database and rollout

Migrations: `1795046400000-ManualReservationPayments.ts` and the forward refund extension `1795046401000-ManualReservationRefunds.ts`. The extension also upgrades installations where the initial migration was already recorded.

Adds reservation payment-hold/deposit columns; `reservation_payment_policy`, `reservation_payment_accounts`, `reservation_payment_submissions`, `reservation_payment_refunds`, `reservation_payment_audit_logs`, `reservation_payment_mail`, plus foreign keys and unique/queue indexes. It does not delete or backfill existing bookings. Proof and account snapshots remain private financial records. Back up and restrict database access accordingly. Retention and deletion require a separately approved business policy; this change never automatically deletes evidence.

Deploy order:

1. Back up the database and build the API: `bun run --filter api build`.
2. From `application/api`, check `node scripts/migrate-manual-reservation-payments.mjs`; apply `node scripts/migrate-manual-reservation-payments.mjs --apply`. The existing public booking migrations must already be applied. The migration runs transactionally. Allow index/table DDL during a maintenance window appropriate to the installation.
3. Set a stable `PAYMENT_ACCESS_SECRET` (at least 32 random characters), `CLIENT_BOOKING_URL` (public HTTPS client origin) and optional `PAYMENT_PROOF_MAX_MB` (default 5, maximum 10). Preserve the secret across API instances/restarts; rotating it invalidates previously emailed links. Existing DB and Nodemailer configuration is reused. SMTP must be configured for email delivery; failure does not lose booking/payment state.
4. Restart the API and deploy both frontends. API endpoints accepting proofs allow bounded 15 MB JSON transport (base64 overhead). The client rewrite limit is 16 MB; match external proxy limits and timeouts.
5. In Reservations → Settings, add actual business-authorized Bank Transfer / GCash accounts. Select a branch for its hold, review, reminder and deposit policy. No fake production accounts are seeded. Configure these before enabling paid public spaces.
6. Smoke-test a real authorized branch workflow before general release. Monitor deferred payment maintenance logs and `reservation_payment_mail` attempts/failure fields; failures retry with bounded backoff. Email delivery is at-least-once: a process failure after SMTP acceptance but before commit may duplicate an email; review/ledger mutations are idempotent.

Recovery: do not run a destructive down migration. Roll back application binaries while retaining tables and evidence, or ship a forward repair. Old code must not be used to approve new unpaid manual-payment bookings; disable paid public booking during any rollback.

## API endpoints

Public, rate limited, payment summary/status/submission require `x-booking-token`:

- `POST /public/booking/quote`
- `GET /public/booking/payment-methods?branchId=...`
- `GET /public/booking/reservations/:reference/payment`
- `GET /public/booking/reservations/:reference/payment-status`
- `POST /public/booking/reservations/:reference/payment-proof`

Authenticated, existing module and branch access enforced:

- `GET/POST /reservations/payment-accounts`
- `PATCH /reservations/payment-accounts/:id` (also activates/deactivates and changes defaults)
- `GET /reservations/payment-accounts/access`
- `GET /reservations/payment-accounts/branches`
- `GET/PATCH /reservations/payment-policy?branchId=...`
- `GET /reservations/payment-verifications` (branch, submitted date range, method, status, customer/reference, page)
- `GET /reservations/payment-verifications/access`
- `GET /reservations/payment-verifications/:id`
- `GET /reservations/payment-verifications/:id/proof`
- `POST /reservations/payment-verifications/:id/{verify|reject|request-resubmission|confirm-refund}`

## Focused checks

From `application/api`:

```powershell
$env:MANUAL_PAYMENT_DB_TEST='true'
$env:PUBLIC_BOOKING_DB_TEST='true'
$env:RESERVATION_DB_TEST='true'
node ../../node_modules/vitest/vitest.mjs run src/operations/reservations/ --maxWorkers=1 --testTimeout=30000 --hookTimeout=30000
```

DB integration tests create and remove uniquely named isolated schemas using the configured local database. They do not insert test accounts or evidence into production tables. Run against a test/local database with schema-creation privileges.

## Implementation inventory

Created:

- `application/api/src/database/migrations/1795046400000-ManualReservationPayments.ts`
- `application/api/src/database/migrations/1795046401000-ManualReservationRefunds.ts`
- `application/api/src/operations/reservations/manual-payment.controller.ts`
- `application/api/src/operations/reservations/manual-payment.dto.ts`
- `application/api/src/operations/reservations/manual-payment.service.ts`
- `application/api/src/operations/reservations/manual-payment.security.ts`
- `application/api/src/operations/reservations/manual-payment.filter.ts`
- `application/api/src/operations/reservations/manual-payment.worker.ts`
- `application/api/src/operations/reservations/manual-payment.integration.spec.ts`
- `application/api/src/operations/reservations/manual-payment.security.spec.ts`
- `application/api/src/operations/reservations/manual-payment.filter.spec.ts`
- `application/api/scripts/migrate-manual-reservation-payments.mjs`
- `application/client-booking/src/app/payment/page.tsx`
- `application/client-booking/src/components/booking/payment.tsx`
- `application/client-booking/src/lib/payment-api.ts`
- `application/client-booking/src/lib/clipboard.ts`
- `application/client-booking/scripts/check-payment-ui.mjs`
- `application/web/app/(workspace)/reservations/payments/page.tsx`
- `application/web/app/reservations/payment-account-settings.tsx`
- `application/web/app/reservations/payment-verification-panel.tsx`
- `application/web/app/reservations/payment-types.ts`
- `application/web/app/reservations/payments.module.css`
- This document.

Extended existing files:

- API `main.ts`, `operations/operations.module.ts`, `foundation/auth/auth.guard.ts`, `email/email.service.ts`, and `.env.example`.
- Reservation `booking-capacity.ts`, `public-booking.controller.ts`, `public-booking.dto.ts`, `public-booking.service.ts`, `reservation-management.service.ts`, and both existing PostgreSQL integration fixtures.
- Client `next.config.ts`, `types/booking.ts`, `lib/api.ts`, `components/ui.tsx`, booking provider/review/summary/confirmation, global styles, and booking policies.
- Admin Reservations workspace and workspace route-permission mapping.
- Root `.gitignore` excludes temporary browser-check artifacts. The local API environment received a generated signing secret without printing or committing it.

## Verification and operating limits

Validation completed November 10, 2026:

- 48 reservation/payment tests, including real PostgreSQL integration with isolated schemas, pass. This includes transaction concurrency, ownership, permissions, private evidence, partial deposits, rejected resubmissions, deadline/review expiry, refunds, net reporting, and notification suppression/delivery decisions.
- API production build/type check passes. API lint passes with pre-existing warnings in unrelated files; focused payment lint is clean.
- Both frontend type checks and full linters pass. The client production build passes.
- Headless Edge browser checks pass against a fresh client production build: secret-fragment removal, backend amount display, account switching, unsupported files, image preview, proof upload, awaiting state, rejected resubmission, and no horizontal overflow at desktop and mobile widths. Fixtures are intercepted in the browser and never create live bookings or payment accounts. Screenshots are generated under ignored `tmp/manual-payment-ui/`.
- The admin production build compiles and passes TypeScript, then fails while prerendering unrelated existing authenticated routes with Next.js `Invariant: Expected workStore to be initialized`. Both Turbopack and webpack reproduce the framework failure. This remains an admin deployment blocker; the payment routes are not the reported failing routes. No unrelated route workaround is retained.
- The local configured database reports no pending payment migrations. Deployment to another database still requires the documented migration procedure.

To reproduce the browser check, build the client, start a fresh instance using `node ../../node_modules/next/dist/bin/next start --port 3015` from `application/client-booking`, then run `node application/client-booking/scripts/check-payment-ui.mjs` from the repository root. It uses installed Microsoft Edge on Windows. `BOOKING_UI_URL` can select another fresh local client instance. Stop the temporary server afterward.

Before operational use, restart the API/client processes to load their latest code/environment, configure real company receiving accounts in Reservations → Settings, set the customer-facing HTTPS `CLIENT_BOOKING_URL`, and verify the existing SMTP configuration. No real receiving-account data is fabricated. Email content and outbox behavior are tested; actual SMTP delivery and actual funds received must be independently verified in the business environment. Partial refunds are not supported; independently confirmed full refunds per verified submission are supported. The existing per-process public limiter requires an upstream shared rate limiter for multi-replica deployments.
