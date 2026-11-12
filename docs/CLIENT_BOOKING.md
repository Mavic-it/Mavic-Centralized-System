# Client booking portal

## Component design

- `src/app/layout.tsx`: server-rendered brand header, navigation, footer and BookingProvider. Pages own routing only.
- `components/booking/provider.tsx`: typed in-memory draft and saved receipt; customer data is not persisted in browser storage. Transitions are browse → book → review → confirmation. Reload safely returns to booking when no draft exists.
- `components/booking/search.tsx`: branch/type filters and public space cards. Owns fetched inventory, loading/error/retry/empty states. Props: none; selected space updates the shared draft.
- `components/booking/form.tsx`: booking and customer fields; owns date/guest-dependent availability and field validation. API slots contain start instants and valid end instants, never private events. Controls disable while refreshing; stale responses are ignored.
- `components/booking/review.tsx`: read-only summary, consent, availability recheck and idempotent submit. A conflict retains draft and offers editing. Receipt uses only the POST response, with no public reservation lookup.
- `components/booking/confirmation.tsx`: actual saved status/reference, safe reload empty state.
- `components/ui.tsx`: labeled fields, required stars, progress navigation and layout-matched skeleton. Native controls provide Tab/arrow/Enter behavior; focus rings and inline alerts remain visible. No motion is required.
- `lib/api.ts`, `types/booking.ts`: runtime-validated responses and typed errors; requests omit cookies. `lib/date-time.ts`: Manila date/time presentation.
- Visual hierarchy: red primary action, charcoal headings, warm neutral canvas, white grouped form cards; 8px spacing rhythm; large introductory heading. Desktop 2:1 content/summary grid, two-column form; below 760px one column. Minimum 44px controls, semantic headings, live loading/errors and reduced-motion support.
- Verification: DTO rejection, policy/time boundaries, per-segment coworking capacity, transaction race/idempotency, public metadata privacy, existing admin regression suite, TypeScript/build/lint and responsive browser checks where available.

## Integration policy

One existing API (port 4000) and PostgreSQL database. Public inventory is opt-in via `rooms.public_bookable`, initially false; authorized staff enable it in reservation space settings. Eligible types are existing MEETING_ROOM, CONFERENCE_ROOM and COWORKING_DESK. Pending, confirmed and checked-in reservations consume availability. Coworking consumes guests per overlapping segment; legacy unknown guest counts consume the whole capacity. Other spaces remain exclusive. Room row locks serialize public and internal writes. Public times use 30-minute increments, Manila timezone and existing branch operating/advance/duration rules. No additional holiday model exists; closures use existing space blocks.

Migration is additive: eligibility, source, consent, hashed idempotency key/payload, nullable public event actor and customer email outbox. Existing reservations are retained. Deploy API migration before frontend; recovery is forward-only, or disable public eligibility and roll back application deployment without dropping history.

## Local commands

```sh
npm --prefix application/api run build
npm --prefix application/api run start:dev
npm --prefix application/web run dev -- --port 3000
npm --prefix application/client-booking run dev -- --port 3005
```

Client `.env.example` documents `NEXT_PUBLIC_API_BASE_URL=http://localhost:4000`. Never put credentials in public variables. Existing `DB_MIGRATIONS_RUN=true` applies compiled migrations at API startup. Staff must explicitly enable real rooms for public booking. No sample inventory is inserted.

On Windows PowerShell with script execution disabled, use `npm.cmd` in place of `npm`. Root Bun scripts include `dev:booking`, and root build/lint include all three applications.

## API and changed boundaries

- `GET /public/booking/branches`: active branches with explicitly public inventory.
- `GET /public/booking/spaces?branchId=...&type=...`: allowlisted public metadata only.
- `GET /public/booking/availability?branchId=...&roomId=...&date=YYYY-MM-DD&guestCount=...`: valid start/end choices and branch policy; no private events.
- `POST /public/booking/reservations`: strict normalized contact DTO, terms version `2026-11-v1`, honeypot, UUID idempotency key, transaction lock, existing reservation persistence, staff notification and durable customer email queue.
- No public reservation lookup or guessable-ID confirmation endpoint. Receipt data lives only in tab memory. Reload displays a recovery explanation without disclosing records. Lost-response retries reuse the same key and recover the saved receipt even when the booking now occupies its own slot.
- `ReservationManagementService` shares capacity checking, exposes source in authenticated records and queues customer status updates. `reservation.dto.ts` and the existing admin space editor add the public-bookable opt-in; admin lists/details label client-origin records.
- `1794960000000-PublicClientBooking.ts` adds columns and a mail queue, retaining existing records and the single database. Public event actors are null, not fabricated staff accounts. Existing branch manager notification and SMTP infrastructure remain in use.
- `application/client-booking/src` owns the separate Next.js frontend. `.ai/context/system-overview.md`, root scripts and both workspace lockfiles inventory the new application.

## Operations and validation

The local database migration is present. Verification preserved the existing four spaces and five reservations. All existing spaces remain private until staff opt in under Reservations → Spaces → Edit → Allow public client bookings. Eligible types are meeting/conference rooms and coworking desks; other types remain excluded even if the flag is set.

Public requests are limited per source IP and process (90 reads or 8 submissions per minute), with a bounded bucket map. Multi-replica production deployment should enforce a shared edge rate limit; trusted-proxy configuration must match the actual deployment. Set `CORS_ORIGINS` to the actual frontend origins when deploying (default localhost ports 3000 and 3005). The client sends no admin cookies.

Customer SMTP delivery is durable and retried independently of booking persistence. Inspect `reservation_customer_mail.failure`, `attempts`, and `sent_at` for delivery failures; superseded status notices are skipped. Actual external email delivery was not exercised. Failed/unconfigured SMTP never rolls back a reservation. Staff notifications use the existing reservation mail queue.

Completed checks include API and both frontend production builds; client TypeScript/lint; changed admin frontend lint; API type-aware lint (existing unrelated test warnings remain); real PostgreSQL exclusive-room and coworking races across public/admin writers, idempotency, cancellation, blocks, approval, private inventory and malformed-date checks; live HTTP validation, CORS and unauthenticated admin denial.

Final API suite: **81 test files passed, 547 tests passed; 7 files / 69 tests skipped** behind their existing integration gates. Reservation database gates were enabled for this run. Two additional customer-mail recovery tests passed afterward; the focused mail run passed all 36 tests. Actual SMTP delivery remains unverified. The broader suite includes existing auth guard regressions. No new lint errors remain; unrelated existing API test warnings are recorded rather than reformatted.

Headless Edge checks covered desktop 1440px and mobile 390px: landing → booking → review → pending receipt → safe reload, input labels, first keyboard focus, reduced-motion preference, no horizontal overflow and no runtime exceptions. Browser submissions used intercepted fixtures only; persistence/concurrency used isolated PostgreSQL test schemas with cleanup. Screenshots and the local browser check are under ignored `tmp/client-booking-review/`.

The implementation does not claim a zero-error guarantee. Production configuration still requires explicit inventory opt-in, the organization's review of published booking/privacy wording, real deployment origins and configured SMTP. The workspace npm audit reported 31 dependency advisories during lockfile synchronization; these were not remediated through unrelated or breaking upgrades in this feature.
