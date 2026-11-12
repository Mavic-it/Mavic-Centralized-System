# Shared application modals

## 1. Component tree

`RootLayout → DialogProvider → feature workspaces → Modal`. The provider also renders a `ConfirmationDialog` using `Modal`. Branch, employee, account, profile, document, and sign-out actions share these primitives.

## 2. Responsibilities

- `Modal` owns the styled native dialog, top-layer presentation, background isolation, focus restoration, Escape/backdrop dismissal, and nested scroll locking.
- `DialogProvider` owns a queue of confirmation requests and resolves each request exactly once. It performs no API calls.
- Feature components retain their forms, permissions, validation, mutations, loading/error feedback, and success notifications. A cancelled confirmation never starts its mutation.

## 3. Contracts

- `Modal`: dialog HTML attributes/children, required `onClose`, `busy?`, and `initialFocusRef?`. Mounting opens it; unmounting closes it. Every caller supplies `aria-labelledby` or an accessible label.
- `useConfirmation()`: accepts `{ title, description, confirmLabel, tone?: 'danger' | 'default' }` and returns `Promise<boolean>`. Cancel, Escape, backdrop dismissal, and provider disposal resolve false; explicit confirmation resolves true.
- Existing API and error shapes remain owned by their features.

## 4. State model

Modal state is local and mounted only while open. Shared confirmation state transitions from queued to active to accepted/cancelled; repeated resolution is ignored. Confirmation defaults to Cancel focus. Existing pending mutations disable dismissal and controls. Errors remain inline or in existing notifications; forms remain open for retry. Unauthorized actions retain existing role guards. No URL or server state is introduced.

## 5. Visual system

Use a white surface, subtle border/shadow, 14px corners, a muted backdrop, readable title/body hierarchy, 24px desktop padding, and 8/12/16/24px spacing. Red identifies destructive actions; secondary buttons use neutral borders. Confirmations are compact; forms keep their existing width variants. Dialogs fit the viewport, scroll internally, and use 16px mobile padding. Buttons have visible hover, disabled, and focus states; narrow confirmation actions stack.

## 6. Accessibility

Native `showModal()` provides top-layer stacking and inert background content, including nested confirmations. Dialogs have accessible titles and optional descriptions. Escape and backdrop clicks cancel unless busy; clicks beginning in content cannot dismiss. Focus stays in the modal and returns to its opener; initial confirmation focus is Cancel. Busy status is exposed with `aria-busy`, validation remains announced by existing alerts, and reduced-motion users receive no entry animation. Keyboard and zoom users can reach internally scrolling content.

## 7. File plan

- Add `application/web/app/components/ui/modal.tsx` and `modal.css` for the primitive and common visual system.
- Add `application/web/app/components/ui/confirmation-provider.tsx` and `confirmation-queue.ts` for accessible promise-based confirmations and queue ownership.
- Add `application/web/app/components/ui/modal-layer.ts` and update `ui/sonner.tsx` and `components/icon-action-button.tsx` so notifications and tooltips remain in the active dialog layer. Move a stable toast portal host to preserve notifications across open/close transitions.
- Change `application/web/app/layout.tsx` to mount the shared provider.
- Migrate `branches/workspace.tsx`, `branches/components/branch-detail-panel.tsx`, `components/employee-documents-section.tsx`, `components/my-profile-workspace.tsx`, and `components/people-workspace.tsx` away from browser confirmation calls.
- Migrate modal shells in `branches/components/branch-form-dialog.tsx`, `branches/components/branch-delete-dialog.tsx`, `components/people-workspace.tsx`, `components/account-branch-dialog.tsx`, and `components/app-shell.tsx`.
- Update `application/web/app/globals.css` and `components/people-workspace.module.css` to retain feature layouts while deferring modal surfaces to the primitive.
- Add focused confirmation behavior coverage and update `components/modal-layering.spec.ts`; record completion in `docs/HRIS_IMPLEMENTATION_PLAN.md`.

## 8. Verification

Exercise acceptance, cancellation, queued requests, and disposal. Check browser keyboard focus, Escape, background isolation, nested confirmations, busy dismissal prevention, backdrop drag, and mobile sizing when browser automation is available. Run focused tests, changed-file lint, and web TypeScript/build checks. Inventory application sources to ensure browser alert/confirm/prompt calls and standalone modal shells have been removed. This is shared UI work within the current scope; the main HRIS Phase 1 boundary is unchanged.
