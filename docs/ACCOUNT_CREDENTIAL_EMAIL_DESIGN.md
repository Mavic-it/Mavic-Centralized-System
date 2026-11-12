# Account credential email design

Scope: Phase 1 account security. New accounts receive API-generated temporary passwords through SMTP. Existing account links, role restrictions and branch derivation remain authoritative.

## Contract and trust boundaries

- POST /users accepts account identity and assignments; passwords are generated only by the API. Responses preserve success/data/message and add emailDelivery. No credential/hash is returned.
- POST /users/:id/regenerate-credentials is restricted to account administrators and accounts still awaiting their first password change. IT cannot manage Super Admin credentials; self-regeneration is prohibited. Normal recovery retains its existing verification/approval workflow.
- SMTP acceptance is distinct from inbox delivery. No persistent queue stores credential contents. Failed or interrupted sends require explicit regeneration; each regeneration replaces the prior hash and revokes sessions.
- Persist delivery state, an attempt identifier and timestamps; never persist email bodies or plaintext credentials. A committed PROCESSING claim prevents concurrent delivery; stale attempts can be regenerated after a bounded lease. A stale result cannot finalize a newer attempt or activate a credential if the registered email changed while sending.
- SMTP credentials and provider responses remain server-side. TLS/STARTTLS is mandatory; templates escape all dynamic HTML and include a plain-text alternative. Missing configuration disables sending without preventing unrelated application startup.

## Component design

1. Component tree: existing User Access page -> account creation modal, AccountCredentialNotice, AccountCredentialStatus, CredentialRegenerationDialog -> shared Modal/buttons.
2. Responsibilities: creation modal collects identity/assignments; notice explains automatic delivery; status displays persisted delivery/first-login state; regeneration dialog confirms a new credential email. Existing page owns queries and invalidation.
3. Contracts: account data adds mustChangePassword, temporaryPasswordExpiresAt, credentialEmailStatus and credentialEmailSentAt. Dialog props: account, pending, error, onSubmit, onClose. No credential fields/props/events exist.
4. State: query data remains in React Query; creation/regeneration pending and safe errors remain local. Success or failed delivery refreshes accounts. Failed delivery preserves the account and offers regeneration without duplicate account creation. No URL or browser storage contains credentials.
5. Visual system: reuse existing account cards, table, field hints and red primary actions; compact delivery badges below account status. Modal has a clear email recipient and one primary action; wraps on mobile. No decorative animation.
6. Accessibility: semantic status/alert announcements, named buttons, visible focus, native modal focus containment/restoration, Escape cancellation except while pending. Submit supports Enter; cancel remains a separate button. Native shared controls preserve zoom and reduced-motion behavior.
7. File plan: email config/module/service/template under api/src/email; password generator, account-provisioning service and account-credential repository under foundation (repository owns row locks, delivery writes and audit transactions); additive user delivery migration; modify users controller/DTO/service and SMTP reset adapter. Add web account-credential-email.tsx for presentation; existing people-workspace orchestrates create/retry; update shared account types/mapping.
8. Verification: generator character classes/uniqueness; SMTP acceptance, rejection, config validation, escaped template; creation without leaked secrets, duplicates, retry authorization/concurrency/expiry; login and forced-change/session guards; frontend status/confirmation rendering; API/web types, lint and builds; database fixtures rolled back. No real email or account reset during validation.

## Reliability and rollout

Default creation credential lifetime: 24 hours, configurable with TEMPORARY_PASSWORD_TTL_HOURS. Apply additive migration before the new API. SMTP sends are synchronous and bounded; the web proxy must allow sufficient time. If a response is interrupted, refresh account records before retrying creation. A crashed PROCESSING attempt can be regenerated after two minutes. SMTP acceptance followed by a database failure remains an uncertain outcome and must be resolved by regeneration; login stays blocked until acceptance is persisted. Existing sessions/rate limits are process-local and require shared production storage for multiple replicas.
