# DTR attendance import flow

This workflow imports an Excel/CSV attendance file into a branch DTR cutoff. It previews calculations first; saving creates draft attendance that can be reviewed and approved through the existing DTR ledger.

## Operator steps

1. Open **Attendance > DTR import** and confirm the selected branch.
2. Choose the source Excel/CSV file. Select a saved branch format only when the file needs a configured column layout or date order.
3. Select the cutoff. The only accepted periods are **11 through 25** of the selected month and **26 through 10** spanning into the following month. The second option starts on the 26th and ends on the 10th of the next month.
4. Review employee identification. A unique employee number or unique normalized full name is matched automatically. Conflicts and ambiguous identities require a manual branch employee selection. A punch on the day after the cutoff may be needed to pair an overnight shift, so identify those rows too.
5. Choose **Calculate & review output**. The table groups work dates by employee and shows imported IN/OUT, the system schedule, potential and approved OT, late, early out/undertime, absence, rest/holiday status, and review exceptions. The system schedule and date-specific roster drive calculations; schedule columns in the source workbook do not override them. Potential OT is not approved OT.
6. Resolve invalid dates or unmatched employees, then enter a reason. Choose whether to reject overlaps or replace unlocked imported rows. Replacement asks for confirmation and records the previous data in audit history. Save creates draft attendance for review.
7. Review saved exceptions in the ledger, correct them with reasons, then use the existing cutoff approval/export controls. Approval and export protections still apply.

## Calculation and cutoff boundaries

The parser retains the original workbook and normalized source rows. Only employee-days attributed inside the selected cutoff are saved. The day after the end date is read as a possible overnight-punch buffer; it is not saved as an employee-day unless the schedule-aware pairing attributes the punch to the final cutoff date. Other dates are reported as outside the cutoff. Missing calendar dates are not inferred as absences; absence is calculated only for represented employee-days according to the existing attendance rules.

Branch employees, effective schedules, date-specific rosters, attendance rules, holidays and approved leave are loaded from the system. The user must correct incorrect automatic matches in the employee identification step. Saved identity mappings are branch-scoped and audited on commit. Reprocessing requires explicit reasoned replacement and cannot bypass approved or locked cutoff controls.

## Troubleshooting

- **No rows in preview:** check the cutoff against dates in the file and the selected sheet/date format.
- **Manual identification required:** choose the correct employee in the selected branch. The system does not guess when identifiers conflict or multiple employees match.
- **Invalid source dates:** correct the source file or use its supported date-order template, then upload it again.
- **Rows need review:** check schedule, punch pairing, break rules and the exception notes in the output and saved ledger.
- **Overlap conflict:** inspect existing employee-days. Select replacement only when the existing rows are unlocked and the replacement is intended.

