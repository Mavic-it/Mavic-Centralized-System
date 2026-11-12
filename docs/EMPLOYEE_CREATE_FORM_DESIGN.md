# Employee creation form layout

The existing Employee Directory owns the Modal > accountForm > personal information, work assignment, employment and work schedule fieldsets. Keep its existing event handlers, input names, branch/department/schedule queries, payload builder, errors, pending guards and confirmation flow. No API or validation contracts change.

The createEmployeeModal scope owns consistent 42px text/select controls, 12px labels, 18-20px field spacing, two-column field groups and three-column employment fields, collapsing to one column on narrow screens. Helper text stays below its field. Schedule radio choices and work-day checkboxes use 16px native controls in 42px clickable labels, with visible selected and focus states. These controls explicitly override generic accountForm sizing and grid labels that caused the original misalignment. File uploads receive their own padding. Disabled controls remain visibly distinct.

Use the existing fieldset/legend and label semantics, native focus/keyboard behavior and shared modal focus/close guards. Branch loading/error/retry, required custom schedules, creation errors and submitting states retain their existing behavior. Verify TypeScript and focused ESLint; inspect both schedule states and narrow/wide viewports when browser access is available. Phase 1 remains active.

Validation: web TypeScript passed. No browser automation was available, so live modal interactions and narrow/wide viewport appearance remain unverified. No additional tests were added for this presentation-only change.
