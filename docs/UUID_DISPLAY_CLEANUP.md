# UUID display cleanup

Contract: omit internal database UUIDs from intentional record labels and metadata. Preserve employee numbers and human-readable incident references, internal navigation/mutation keys and backend authorization. This is presentation cleanup, not removal of identifiers from browser requests or URLs.

## Component design

1. Component tree: existing PasswordResetQueue table/cards/detail modal; EmployeeWorkScheduleCard history; employee data adapter; attendance table; DetailOverview metadata. No new UI component.
2. Responsibilities: queue presents account/date/link status; schedule history presents effective dates/times; adapter and attendance present branch labels; incident metadata presents the existing business reference.
3. Contracts: existing typed API props and payloads remain; UUIDs stay as selection/request keys. Missing branch name uses Assigned branch; missing reference uses Not available; employee link uses Linked/No employee link.
4. State model: existing server, selection, URL, form and mutation state remain. Loading, empty, error/retry, disabled, unauthorized, success and confirmation states retain their current behavior.
5. Visual system: retain existing responsive table/card/modal layouts, spacing, typography and status colors. Remove technical metadata and preserve primary names, dates and actions.
6. Accessibility: retain semantic definition lists/tables, modal focus management, keyboard interactions, labels and announcements. No added animation, focus target or validation behavior.
7. Files: app/components/password-reset-queue.tsx, employee-work-schedule-card.tsx and people-workspace-services.ts; app/attendance/workspace.tsx; app/work/detail-overview.tsx. Paths are relative to application/web. Update services tests and HRIS inventory.
8. Verification: focused service and work component tests, TypeScript, changed-file ESLint and source audit for direct UUID render/fallback patterns. No signed-in browser session was exercised.

Audit: employee directory/profile/portal, accounts, branches, attendance/import/DTR/schedules, leave, notifications and Tasks/Incidents. No separate ticket module exists in the current web application. Employee ID labels already use employeeNumber; retain these business identifiers. Removed direct UUID displays in password reset details, request fragments and schedule history, and UUID fallbacks in branch/incident labels. UUID-bearing links and HTML form values remain necessary for internal operations.
