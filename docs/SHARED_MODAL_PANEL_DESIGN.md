# Shared modal panels - 2026-10-23

Use the existing native Modal top-layer component for all form/information surfaces: employee/account/branch editors, emergency contact, leave filing/types/balance history and adjustments, attendance review, credentials with information and existing request/upload details. Default presentation is a full-height right panel with dimmed background. Native popup notifications remain a nonmodal popover as previously requested. Compact decision-only confirmations (confirmation provider, logout, employee/account deletion/status changes ) explicitly opt into centered presentation.

Contract: Modal gains presentation?: drawer | center (default drawer), reflected as data-presentation. Existing content props, handlers, labels, initial focus, busy guards, layered scroll locking, Escape, backdrop hit testing and opener focus remain. Shared CSS owns panel geometry with explicit overrides for legacy centered module styles: right edge, zero outer margin, viewport height, 720px maximum width, square outer edges, contained vertical scrolling and dark backdrop. Existing specialized drawers keep their own inner header/body/footer layouts. No global JavaScript animation or business mutation changes. On mobile panel fills viewport width; confirmations retain current compact styles. Avoid changing navigation/popovers or the API/database.

Verify default/center markup, real employee/emergency/HR editors and representative branch/attendance/leave dialogs, geometry and backdrop at 390/1440px, nested confirmations, keyboard/busy/backdrop behavior and focus restoration, long-form scrolling, focused tests, lint/TypeScript/build. Browser fixtures use mocked data; no real employee mutation is necessary. Main Phase 1 remains active.

Branch deletion asks for a current password, so it follows the input-panel default rather than the centered confirmation exception. All remaining explicitly centered feature dialogs contain no inputs.

Shared-panel final verification: production Next.js Webpack build passed after the final branch-input classification. No migration, configuration or real data update is required.
