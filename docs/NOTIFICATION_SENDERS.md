# Notification sender presentation

Compact overview: keep the existing inbox, sender, timestamp and actions with no new props or state. Reduce header and item spacing, use a 30px icon, and clamp message previews to two lines; the complete message remains in the DOM and opens through the existing notification link. Preserve keyboard focus, delete confirmation and mobile width. Scope changes to the notification CSS module; review formatting without adding behavior tests for this presentation-only change.

1. Component tree: existing notification inbox and item link; add a sender text line.
2. Responsibility: services record the sender name at notification creation; inbox displays it.
3. Contract: optional senderName string on notification responses, backed by nullable sender_name.
4. State: existing loading/error/paging states; no new interactive state.
5. Visual system: sender appears below title using existing message typography, wrapping on mobile.
6. Accessibility: plain text within the accessible notification link; existing keyboard flow remains.
7. Files: additive migration, notification service, notification producers and inbox component.
8. Verification: API build, frontend types and focused notification tests.

Older notifications without a recorded sender show “Not recorded”. Automated events use “System”. Confidential incident notices retain “Private workspace” to avoid disclosing identities beyond their record permissions. No historical sender is inferred from a later event.
