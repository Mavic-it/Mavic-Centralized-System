# Account Security page design

1. Component tree: authorized server page, security header, password form, live password checklist, and guidance panel. The existing field label primitive provides required markers.
2. Responsibilities: the page owns layout and explanatory text; the form owns passwords, visibility, validation feedback, and the existing change-password request.
3. Contracts: POST `/api/auth/change-password` with currentPassword, newPassword, confirmPassword. Server enforces 12–128 characters, lower/uppercase, number, symbol and current-password checks; success revokes sessions and returns to login.
4. State model: local password values, three visibility toggles, pending request, error, and success. No password persists in browser storage. Live checklist derives from new password; matching derives from confirmation.
5. Visual system: workspace-width header, two-column form and guidance cards, white surfaces, subtle borders, red brand accent and restrained status colors. Stack columns on small screens.
6. Accessibility: native labeled password controls and submit; visibility controls have dynamic accessible names and pressed states, all controls have visible focus. Requirement messages update politely; server errors announce as alerts. No animation required.
7. File plan: Account Security page for layout, security form for interactions, scoped CSS module for presentation, tracker for inventory.
8. Verification: check TypeScript and lint; test initial state, requirement guidance, and submission constraints. Browser session and real account change are excluded from automated checks.
