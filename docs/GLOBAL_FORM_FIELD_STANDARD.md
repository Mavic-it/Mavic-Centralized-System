# Global form field standard — 2026-11-05

Scope: audit all existing forms and editable controls, across authentication/recovery/security, people/201-file/self-service/accounts, branches/departments, attendance/import/review/settings, leave/policies/credits, reservations/spaces/payments, and tasks/incidents. Initial source audit: 353 native/shared input/select/textarea control sites across 48 frontend files; 145 already declare required, 100 without the shared required marker. Includes repeated/dynamic component sites, not a count of runtime fields.

## Component design

1. Tree: existing pages/forms → existing labeled controls and field wrappers → shared FieldLabel → existing RequiredMark. Existing Branch Field and ModalFieldLabel reuse RequiredMark. Radio/checkbox groups use their group heading/legend; required file pickers use their visible file label.
2. Responsibilities: FieldLabel keeps label text and its marker together in one inline span; RequiredMark supplies accessible required text and explicit red color. Feature forms own required conditions and native/schema validation. No runtime DOM rewriting or observer.
3. Contracts: FieldLabel takes span HTML attributes, ReactNode children and required?:boolean. RequiredMark remains the existing reusable star. Required condition on label and control must match. Login Zod validation and backend DTO/service validation remain authoritative. Native required is added where a field is already mandatory under the existing contract.
4. State: dynamic labels recompute from existing form/action state. Optional fields have no asterisk and no optional-label suffix. Disabled/read-only/defaulted controls keep their existing behavior; filters/search do not become required. Loading/error/unauthorized/success/confirmation behavior remains feature-owned and unchanged.
5. Visuals: default label text color; only the asterisk uses explicit red in every theme. One consistent inline spacing after the label, no new grid row for a star. Preserve layout and group structure; no new animations.
6. Accessibility: real label/for associations remain, native required or aria-required for custom groups, accessible Required marker, existing error descriptions/focus behavior. Conditional comment requirements remain action-specific; no blanket required on approval comments or optional emergency contacts. Markers work at mobile widths, zoom and in light/dark fixtures.
7. Files: `application/web/app/components/field-label.tsx`, `required-mark.tsx`, `globals.css`, audited form files under `app/attendance`, `branches/components`, `change-password`, `forgot-password`, `login`, `components`, `leave`, `reservations`, `work`; focused source-audit and component tests. Maintain this inventory and `docs/HRIS_IMPLEMENTATION_PLAN.md`.
8. Verification: syntax-aware source audit for missing/mismatched required indicators and optional-label text; focused presentation/validation tests, frontend TypeScript/ESLint/build; actual-component browser fixtures for dynamic fields, native validation, keyboard, light/dark color, narrow/wide layouts and accessibility associations. No real records or permissions changed by tests.

## Boundaries

Optional attachment policy option text (the policy's value) and explanatory prose are not optional field-label badges and remain meaningful. Existing optional data is not made mandatory. Backend business policies, database schema and HRIS Phase 1 boundary are unchanged. Ambiguous controls are checked against schemas/handlers rather than inferred from appearance.
