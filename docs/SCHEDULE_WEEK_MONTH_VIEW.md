# Employee schedule week and month views — 2026-11-06

## Component design

1. **Component tree:** employee 201 file / My Profile / Attendance → shared `EmployeeWorkScheduleCard` → view selector, date navigation and schedule calendar cells. The two profile surfaces and Attendance keep using this component.
2. **Responsibilities:** the shared card owns navigation and week/month display state; its existing query continues to provide the current employee schedule and edit action. A month query gathers the existing employee-specific week endpoint for the calendar weeks, while display code flattens the returned employee days. No API, authorization, or schedule rule changes.
3. **Contracts:** week endpoint remains `GET /employees/:id/workflow/work-schedule/week?weekStart=YYYY-MM-DD`; response dates continue to carry schedule, assignment, rest-day and approved leave details. Month display accepts no new API values. Existing `employeeId`, `role`, and `readOnly` props are unchanged.
4. **State:** existing current schedule query and week start remain. Add a local `week | month` selector and month anchor. Month query keys include employee ID and `YYYY-MM`; query loading, retryable error, empty schedule, and successful calendar states stay explicit. Schedule assignment invalidates both query families.
5. **Visual system:** retain the current white card, red selected state, and existing spacing. The month view uses a seven-column calendar with weekday headings and subdued adjacent-month days; on narrow screens each date stays readable in compact cells within a horizontal calendar region. Week controls remain unchanged; month mode uses month navigation and a month input.
6. **Accessibility:** selector buttons use `aria-pressed` and a named group; month input and previous/next controls have accessible names; calendar region has a descriptive label, each day has a full date label, focus is visible, and all controls remain keyboard operable. Existing leave badges remain available in each day.
7. **File plan:** change `application/web/app/components/employee-work-schedule-card.tsx` for view state/query/calendar; add focused styles to its CSS module; extend `application/web/app/components/schedule-leave-badge.spec.tsx` or the schedule card presentation tests for month dates, leave/rest days and navigation. Update this design and `docs/HRIS_IMPLEMENTATION_PLAN.md`; no backend files.
8. **Verification:** focused schedule-card and portal tests, frontend TypeScript and changed-file lint, formatting check; review month boundaries (28/29/30/31 days), adjacent dates, and keyboard labels. No real employee records or permissions are changed.

## Boundaries

Month view makes 4–6 parallel calls to the existing week endpoint and relies on the same server authorization and employee filtering as Week view. It displays schedule data already returned by that endpoint. No later HRIS phase is started.
