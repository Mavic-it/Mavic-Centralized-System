# Incident detail clarity

1. Tree: existing IncidentWorkspace, overview, next-action form, collapsed history.
2. Responsibility: presentation only; existing permission-derived available actions remain authoritative.
3. Contracts: unchanged Detail and callbacks; status guidance derives from status and viewer participation.
4. State: native history disclosure starts closed; existing action/loading/error state stays intact.
5. Visual system: lead with status and next step, then report description, action form and optional history.
6. Accessibility: native summary keyboard behavior; history is opened before scrolling after a saved update. No hidden action or changed confirmation.
7. Files: detail-overview.tsx, incident-workspace.tsx, workspace.tsx and workspace.module.css.
8. Verification: frontend types, lint and existing incident presentation tests. No API, privacy, workflow or HRIS phase change.
