# Mavic notification email templates

2026-10-29 update: task assignment and key task decisions now use the same shared renderer with generic, private task notices. Incident mail was added separately in the incident workflow. The original supported-event inventory below describes the 2026-10-26 template rollout and is historical.

Implemented 2026-10-26 within the existing Phase 1 and authorized leave slice.

The shared renderer is `application/api/src/email/notification-email.template.ts`. It builds email-safe inline HTML and matching plain text, with a fluid 600px table, an Outlook conditional fixed-width wrapper, text branding, details, security reminder, optional same-origin action and automated-message footer. There are no external assets, CSS framework dependencies or template assets to copy during builds. This retains the existing TypeScript rendering approach rather than adding Handlebars and a second deployment path.

Supported mail events: account created, temporary credential regenerated, password reset, password changed, leave review required and leave updates (submitted/approved/rejected/canceled when a current status is available). Dates and expiry now use Asia/Manila with readable PHT labels; this supersedes the prior SGT credential presentation. Leave details show current status at post-commit delivery; they are not a frozen historical event snapshot. Reasons, proof and other confidential leave data remain in the authorized portal. No new task, incident, activation, deactivation or attendance email events were added because these do not currently send email.

SMTP transport, configured Mavic sender, recipient acceptance checks, redacted failures, password hashes, credential expiry, forced first-login change, session revocation, notification recipients and post-commit leave delivery remain in place. Action URLs are checked against the configured FRONTEND_URL origin. All dynamic HTML values are escaped. There is no database migration or environment change.

Build and restart the API using the existing deployment process to activate these templates. Artificial HTML/text previews are generated under `tmp/mavic-email-review`; these contain only example.test identities and deliberately fake credentials. Do not generate previews from real credential messages or log message content.

Domain deliverability remains an operator task: identify the authenticated sending domain and provider, publish that provider's SPF and DKIM settings, and configure DMARC policy/reporting with the domain owner after checking alignment. No DNS access or verified custom sending domain was supplied for this change. A Gmail sender must not be presented as authenticated for an unrelated custom domain. Provider SMTP verification does not prove inbox delivery or SPF/DKIM/DMARC alignment.

Validation uses mocked MailerService and a local Nodemailer stream transport (multipart text/plain plus text/html), without sending to employees. Actual Gmail/Outlook/Yahoo/iOS client rendering and real inbox delivery require a controlled test mailbox; cross-client compatibility is designed for, not certified by automated string/layout checks.

Verification: API build passed; full API suite passed 358 tests with one optional integration test skipped. Existing SMTP connection/authentication verified successfully outside the restricted network sandbox without sending a message. The initial sandbox DNS check failed with EDNS; the authorized network verification succeeded. API lint retains four pre-existing warnings in unrelated user/system tests.
