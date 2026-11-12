# MSPACES — Client Reservation Booking Portal
## Codex implementation prompt + end-to-end system flow

> Paste this entire document into Codex in VS Code from the root of the EXISTING MSPACES repository. Inspect the codebase and integrate with its actual architecture; do not assume example route or API names already exist.

## 1. Project context and non-negotiable requirements

Build a **separate public-facing Next.js frontend** named **Client Reservation Booking Portal** for MSPACES customers to reserve meeting rooms or coworking spaces.

- **Existing admin/employee frontend:** `application/web`, runs with `npm --prefix application/web run dev -- --port 3000`.
- **New client frontend:** create `application/client-booking`, runs with **`npm --prefix application/client-booking run dev -- --port 3005`**.
- **Backend:** REUSE the existing NestJS REST API/backend application. **Do not create a second backend, API service, or separate database.**
- **Database:** REUSE the existing PostgreSQL database and existing branch, space, customer (where applicable), reservation, availability, schedule, and notification data/models.
- The new frontend must communicate **through the existing backend API only**, not connect to PostgreSQL directly. If public booking endpoints are missing, add minimal, backward-compatible controllers/services inside the EXISTING NestJS backend.
- Keep the existing app on port 3000 fully functional and retain its reservation/admin workflows and access control. Client bookings must appear in the existing reservation system, not a second disconnected reservation table.
- Inspect and reuse the repository's existing Next.js patterns, styling, component library (including shadcn/ui if installed), API utilities, validation conventions, NestJS DTOs, ORM/schema/migrations, and mail/notification implementation. Prefer incremental changes over unrelated refactors.
- All public endpoints must be explicitly scoped and secure. Never expose employee or internal reservation data, PostgreSQL credentials, API secrets, admin auth tokens, or other clients' personal information.
- Use **Asia/Manila** as the initial MSPACES business timezone unless the existing branch configuration specifies another timezone; enforce consistent date/time parsing and storage.

## 2. Intended system flow

```text
Visitor opens http://localhost:3005
    ↓
Client Booking Landing Page
    ├── Select branch (e.g., Makati, Ortigas; dynamic from existing DB)
    ├── Choose space type (Meeting Room or Coworking)
    └── Browse available spaces
    ↓
Availability Calendar + Time Selection
    ├── Month/Week/Day or clear calendar/date controls
    ├── Choose date and space
    ├── View selectable time slots based on backend availability
    ├── Display hours, capacity, amenities, and rules if stored
    └── Display unavailable/fully booked/blocked dates appropriately
    ↓
Client Booking Form
    ├── Branch *
    ├── Date *
    ├── Start time *
    ├── End time *
    ├── Guests *
    ├── Purpose *
    ├── Full name *
    ├── Email *
    ├── Contact number *
    ├── Company
    └── Note/Requests
    ↓
Review Reservation
    ├── Verify branch, space, date, time, duration, guests, customer details
    ├── Show price ONLY if the backend has a configured, reliable pricing model
    ├── Display applicable policies and privacy notice
    └── Require explicit acknowledgement of applicable booking terms
    ↓
Submit Reservation
    ├── Backend revalidates all fields and availability atomically
    ├── Prevent duplicate submissions / overlapping capacity conflicts
    ├── Save in EXISTING reservation data model / database
    ├── Mark reservation source as client/public portal if supported
    └── Apply configured approval policy (Pending or Confirmed)
    ↓
Booking Confirmation Screen
    ├── Reference number + saved booking details
    ├── Clear status (Pending Approval / Confirmed)
    ├── Existing backend email confirmation/notification, if configured
    └── Booking visible in existing admin reservation calendar/list
    ↓
Admin/Branch Manager on http://localhost:3000
    ├── Sees new client reservation in existing reservation module
    ├── Can review, approve, reject, reschedule, or cancel as permitted
    └── Changes automatically affect client availability
```

**Important:** Do NOT promise a confirmed booking while it is pending approval. Whether pending reservations block timeslots must follow existing reservation policy; choose and document one consistent rule if the system lacks one.

## 3. New frontend page structure

Implement the public portal with an intentional, responsive UI. Adjust file structure to match the repository's Next.js App Router conventions:

```text
application/client-booking/
  package.json
  next.config.*
  .env.example
  src/
    app/
      layout.tsx
      page.tsx                   # Branded landing page with branch/space search
      book/page.tsx              # Availability calendar and reservation form
      review/page.tsx            # Review booking, revalidate, submit
      confirmation/page.tsx      # Successful booking and actual status
      loading.tsx                # Layout-matched loading skeleton
      error.tsx                  # Friendly API failure handling
    components/
      booking/                   # Branch/space picker, calendar, slot picker,
                                 # guest count, summary, form and status
      ui/                        # Reuse repo-approved UI components/patterns
    lib/
      api/                       # Typed clients for existing backend endpoints
      validation/                # Client-side schema mirrors server DTOs
      date-time/                 # Branch-timezone/date formatting helpers
    types/
      booking.ts
```

- **Landing page:** MSPACES branding, simple hero, “Book a Space” call to action, branch search, Meeting Rooms and Coworking options, and how booking works. Only display real branches/spaces from existing data; do not invent offerings or prices.
- **Booking page:** Clearly visible branch, space, and interactive calendar; usable available-time picker; concise space information; form based on supplied reference screenshot.
- **Review page:** Complete read-only summary with edit/back option, applicable terms, final server-side availability refresh before submission; prevent repeated clicks and show helpful conflict errors.
- **Confirmation page:** Actual backend booking reference and actual status, with safe handling of reload/deep links. Do not allow a guessable reservation ID to reveal customer data; use a short-lived server-issued or signed scoped access token if exposing reservation details by link.
- Offer responsive desktop and mobile layouts, proper keyboard accessibility, visible focus states, descriptive validation feedback, loading skeletons mirroring final layouts, empty states, and error/retry states.
- Display **red `*` markers for all required inputs**. Do **not** append the word “Optional” to nonrequired field labels. Use the same form UX/validation principles across this new frontend.

## 4. Availability calendar and scheduling rules

Use the EXISTING backend as the single source of truth for availability. A pretty client-only calendar is not sufficient.

1. Branch selection filters eligible/publicly bookable spaces.
2. Space type allows `Meeting Room` and `Coworking`; use the existing taxonomy, not a competing enum when one exists.
3. Picking a space shows its capacity, amenities, operating hours, slot duration, booking lead time, and minimum/maximum duration **where present/configured**.
4. Calendar displays available dates and time slots obtained from the backend, refreshed on branch/space/date/guest changes and again before submission.
5. Exclude past times, non-operating hours, branch closures, holidays (if configured), disabled resources, maintenance blocks, manually blocked time, and conflicts with existing reservations.
6. For an **exclusive meeting room**, any overlapping reservation that counts as occupying it prevents an additional booking (including buffers/cleanup periods if configured).
7. For a **shared coworking space**, track remaining seats/capacity: a slot is bookable only when `existing occupied guests + requested guests <= available capacity` for **every overlapping segment** of the requested period. Do not mark the whole coworking area booked merely because one client reserved a seat.
8. Validate `end > start`, guests as a positive integer <= capacity, branch/space compatibility, minimum/maximum booking lengths, permitted time increments, and reservations crossing midnight only if the existing policies allow it.
9. Show the selected duration (for example `1.0 hours`) as a **derived display**, never a user-entered value.
10. Validate again on the backend at save time inside a database transaction. Prevent race conditions/double-booking under simultaneous requests (e.g., PostgreSQL exclusion constraint for exclusive room intervals where schema allows it, or per-resource transaction locking; serialize capacity checks for coworking). Ensure rules cover every status that should consume availability.
11. Return a human-friendly `409 Conflict` response if another booking just took the selected slot; refresh availability and allow selection of a different slot.
12. Honor cancellation, rejected, rescheduled, and admin-created/edited reservations in availability calculations. No stale-only frontend truth.

## 5. Booking form matching the reference image

Create the following sections and validation rules, in roughly the supplied two-column desktop layout and single-column mobile layout.

### Booking details

| Field | Required | Behavior |
|---|---|---|
| Branch | Yes | Dynamic options from active/bookable existing branches |
| Space | Yes | Options filtered by selected branch and space type; only public-bookable spaces |
| Date | Yes | Calendar picker with blocked dates and valid date bounds |
| Start time | Yes | Choose a backend-available slot, not an unverified free-text value |
| End time | Yes | Choose valid endpoint/duration checked against availability |
| Guests | Yes | Integer >= 1, no greater than space capacity and availability |
| Purpose | Yes | Configurable options or existing purpose values; if `Other` requires details, validate accordingly |

### Customer details

| Field | Required | Behavior |
|---|---|---|
| Full name | Yes | Trim whitespace; enforce reasonable length |
| Email | Yes | Validate email format, normalization, server-side checks |
| Contact number | Yes | Accept practical Philippine number formats without unnecessarily breaking international formats; normalize server-side |
| Company | No | Optional free-text, length-limited |
| Special requests | No | Optional multiline text, length-limited, escaped on display |

- Preserve user-entered data when changing steps or when submission fails.
- Always validate on the **NestJS backend** even if the browser validates too.
- Required labels have a visible **red asterisk**; optional labels are plain, with no “Optional” text.
- Use safe, scoped customer data storage following existing privacy conventions and do not log PII/secrets.

## 6. Integration with existing NestJS backend

**FIRST inspect the current API endpoints, modules, service methods, DTOs, guards, database entities, reservation status rules, audit logs, and notifications.** Reuse them wherever possible. The following are suggested endpoint shapes **only if equivalent safe public endpoints do not already exist** (do not create duplicates):

```http
GET  /public/booking/branches
GET  /public/booking/spaces?branchId=...&type=...
GET  /public/booking/availability?branchId=...&spaceId=...&date=...&guests=...
POST /public/booking/quote             # Only if pricing or preview needs server calculation
POST /public/booking/reservations
GET  /public/booking/reservations/confirmation?token=...   # Optional secure access
```

Implement public endpoints in the **same existing NestJS API**, sharing existing business services, database connection, and reservation persistence. If the existing API authentication guards apply by default, add carefully scoped access for public booking only; do not remove guards from admin endpoints. Validate and authorize all branch IDs/space IDs server-side; only allow public-bookable inventory to be exposed.

Example `POST` inputs: `branchId`, `spaceId`, `date`/start/end instants with timezone, `guests`, `purpose`, `fullName`, `email`, `contactNumber`, `company`, `specialRequests`, accepted terms/version if applicable, and an idempotency key. Determine the exact DTO fields from the current reservation model. Return the saved reference, current status, and safe client-display fields.

- Public API response must provide only public resource metadata and aggregated available/unavailable slots; never return other customers' names, private notes, employee records, or internal reservation metadata.
- Add input validation and output DTO serialization; rate-limit public endpoints, particularly booking submissions. Add spam protections appropriate to the existing stack; never block legitimate users silently.
- Use idempotency keys to ensure refreshes/retries/double-clicks do not create duplicate bookings.
- Use server-side transactions and database-safe conflict prevention; do not rely on `GET availability` alone.
- If the current reservation schema lacks a public-booking source field or customer fields, extend it **minimally with a backward-compatible migration** after inspecting existing fields. Do not reset data, delete bookings, or create a separate booking schema that bypasses the existing module.
- Reuse existing notification/email infrastructure (such as Nodemailer if installed), when configured. Booking persistence must not be silently lost due to SMTP problems; handle notification failure safely and visibly to staff/logs.
- Existing admin calendar/list and reports must show client-origin reservations, appropriately labelled where possible. Existing admin actions update availability and client booking status consistently.
- If booking is approval-based, save `PENDING` (or the actual configured status), explain it on the confirmation page, and only send a “confirmed” email after staff approval. If auto-confirmation is configured, save the actual confirmed status and notify accordingly.
- Make CORS allow `http://localhost:3005` for the new development frontend while retaining existing origins. Follow current cookie/session conventions. Do not expose admin sessions to unauthenticated public visitors.

## 7. Environment and run commands

Create a separate `.env.example` for the new frontend and document values derived from the current backend configuration:

```dotenv
# Example only; match the actual NestJS base URL/prefix after inspection.
NEXT_PUBLIC_API_BASE_URL=http://localhost:<EXISTING_API_PORT>
NEXT_PUBLIC_APP_NAME=MSPACES Client Booking
```

Do not put database credentials or private secrets in any `NEXT_PUBLIC_*` variable. Use the existing backend `.env` and database configuration unchanged unless necessary for CORS or an additive feature.

Provide the exact commands after implementation:

```bash
# Terminal 1 — existing NestJS backend: use the repository's actual command
# Terminal 2 — existing internal frontend (do not change)
npm --prefix application/web run dev -- --port 3000

# Terminal 3 — new client frontend
npm --prefix application/client-booking run dev -- --port 3005
```

Expected local destinations:

- `http://localhost:3000` — existing protected admin/employee application
- `http://localhost:3005` — new public client reservation portal
- **One** existing NestJS API and **one** existing PostgreSQL database shared by both frontends

## 8. UI / UX design requirements

- Modern, clean, friendly client-facing MSPACES design. Reuse the existing design tokens/brand colors where available; avoid inconsistent duplicate UI frameworks.
- Landing experience with a clear primary booking action; do not force account creation or login unless the current business rules explicitly require it. Prefer guest checkout-style booking.
- Booking screen should visually match the supplied screenshot's layout: “Booking details” then “Customer details”, with Branch/Space, Date/Start time, End time/Guests, Purpose, Full name/Email, Contact number/Company, Special requests, derived duration, and **Review reservation** primary button.
- Make calendar and selectable time slots genuinely interactive and disabled states unmistakable.
- Responsive on mobile, tablet, and desktop without horizontal overflow; use generous but efficient spacing.
- Show skeletons while fetching branches/spaces/availability, with shapes matching loaded output; use route `loading.tsx` where appropriate.
- Never leave a broken blank screen: include loading, empty/no availability, validation error, API failure, booking conflict, and successful confirmation states.
- Provide clear messages like “This time is no longer available. Please select another slot.” rather than raw stack traces.
- Follow WCAG-minded accessibility: labels, keyboard-friendly calendar, status announcements, contrast, focus, touch targets, and semantic headings.

## 9. Security, privacy, and operational guardrails

- Public booking should not require access to admin JWT/session or private internal endpoints.
- Validate all input and prices (where applicable) on the backend; sanitize output and guard against XSS.
- Do not publicly display entire reservation objects, customer details, internal maintenance notes, or private calendar events.
- Never trust client-supplied availability, price, branch ownership, booking status, or reservation reference.
- Apply reasonable request limits, logging without personal data, secure token design for any public manage/confirmation links, and safe CORS configuration.
- Preserve existing admin RBAC, audit logs, database records, and migrations; no destructive schema operations or mock data overwriting production-like records.
- Collect only the customer data required for reservations, provide privacy/terms links and appropriate consent where required.

## 10. Acceptance criteria / tests

1. Existing frontend still runs on `3000`; new frontend independently starts on `3005`; both use the same existing NestJS backend and PostgreSQL database.
2. Portal shows active branches and eligible meeting/coworking spaces from the actual database, not hard-coded arrays.
3. Calendar and time slots correctly reflect admin reservations, resource operating hours, blocked dates, and space capacity.
4. Customer can fill every screenshot field, with red stars for required fields and no “Optional” word on nonrequired labels.
5. Customer reviews and submits an available booking, then sees the saved backend reference and correct pending/confirmed status.
6. Newly submitted booking is visible in the existing admin reservation list/calendar and can be managed there; updates affect subsequent client availability.
7. Concurrent attempts for the same exclusive room/slot cannot both succeed. Concurrent coworking bookings cannot exceed guest capacity.
8. Double-submit or retry with the same idempotency key does not create a second booking.
9. Invalid dates, capacity, phone/email formats, missing fields, unavailable slots, and expired/invalid secure links fail gracefully.
10. No public endpoint leaks another customer's personal details, backend secrets, or privileged admin functions.
11. New frontend passes the repo's applicable lint, type check, build, and tests; existing frontend/backend still pass relevant checks.
12. Mobile UX, loading skeletons, form errors, and success/error states work correctly.

## 11. Codex execution instructions and expected report

Work in this order:

1. **Audit** the repository and identify actual frontend/backend locations, reservation models/API, authentication/CORS, availability logic, role rules, notification setup, and current UI patterns. Briefly summarize your findings.
2. **Plan** the smallest compatible integration and name any missing schema fields/endpoints you need. No separate backend or database.
3. **Implement** the new Next.js frontend in `application/client-booking`, configure its dev command to run on `3005`, and wire all screens to real backend responses.
4. **Extend the existing NestJS API only as required**, safely and backward-compatibly; implement server-authoritative availability, collision protection, and booking persistence through existing models.
5. **Integrate** with the existing admin reservations list/calendar, status workflow, and notifications.
6. **Verify** end-to-end with suitable tests, type checking, linting, build validation, and a manual browser-ready checklist.
7. **Report** changed files, added/modified endpoints, migrations (if any), required environment variables, exact start commands, test results, and any outstanding manual configuration.

Do not stop after scaffolding or return only a plan: implement functional end-to-end behavior within the existing repository, and clearly distinguish completed work from any blockers. Do not fabricate working integrations when no endpoint exists.
