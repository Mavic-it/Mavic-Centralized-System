import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { LeaveService } from './leave.service.js';
import type { AuthUserContext } from '../../foundation/auth/auth.context.js';

vi.mock('../attendance/approved-leave.js', () => ({
  lockLeaveDtr: vi.fn(),
  synchronizeApprovedLeave: vi.fn(),
}));

const employee = {
  userId: 'u-employee',
  role: 'EMPLOYEE',
  branchId: 'b-1',
} as AuthUserContext;
const reviewer = {
  userId: 'u-reviewer',
  role: 'HR_ADMIN',
  branchId: 'b-1',
} as AuthUserContext;
const leave = {
  id: 'r-1',
  employeeId: 'e-1',
  branchId: 'b-1',
  status: 'APPROVED',
  startDate: '2027-01-15',
  endDate: '2027-01-15',
  typeId: 't-1',
  creditYear: 2027,
  days: 1,
  policy: { paid: true, allowApprovedCancellation: true },
};

function setup(review?: Record<string, unknown>) {
  const query = vi.fn(async (sql: string) => {
    if (sql.startsWith('SELECT branch_id,employee_id'))
      return [{ branch_id: 'b-1', employee_id: 'e-1' }];
    if (sql.includes('FROM leave_requests r') && sql.includes('WHERE r.id=$1'))
      return [leave];
    if (
      sql.includes('FROM leave_cancellation_reviews') &&
      sql.includes('FOR UPDATE')
    )
      return review ? [review] : [];
    if (sql.includes('SELECT EXISTS(SELECT 1 FROM leave_request_documents'))
      return [{ present: true }];
    return [];
  });
  const manager = { query };
  const service = new LeaveService({
    manager,
    query,
    transaction: (fn: (m: typeof manager) => unknown) => fn(manager),
  } as never);
  vi.spyOn(service, 'own').mockResolvedValue({
    id: 'e-1',
    branchId: 'b-1',
  } as never);
  vi.spyOn(service, 'employee').mockResolvedValue({
    id: 'e-1',
    branchId: 'b-1',
  } as never);
  vi.spyOn(service, 'scope').mockResolvedValue(['b-1']);
  return { service, query };
}

describe('Leave cancellation review', () => {
  it('keeps approved leave and credits intact when an employee asks to cancel', async () => {
    const { service, query } = setup();
    await expect(
      service.cancel(employee, 'r-1', 'Plans changed'),
    ).resolves.toEqual({ pendingReview: true });
    expect(
      query.mock.calls.some(([sql]) =>
        sql.includes('INSERT INTO leave_cancellation_reviews'),
      ),
    ).toBe(true);
    expect(
      query.mock.calls.some(([sql]) => sql.includes("status='CANCELLED'")),
    ).toBe(false);
    expect(
      query.mock.calls.some(([sql]) =>
        sql.includes('leave_credit_transactions'),
      ),
    ).toBe(false);
  });
  it('lets an employee explain why a reviewer proposal should continue', async () => {
    const { service, query } = setup({
      id: 'c-1',
      origin: 'REVIEWER',
      status: 'AWAITING_EMPLOYEE',
    });
    await expect(
      service.respondCancellation(employee, 'r-1', {
        action: 'CONTINUE',
        comment: 'I still need this leave',
      }),
    ).resolves.toEqual({ continued: true });
    expect(
      query.mock.calls.some(([sql]) => sql.includes("status='CLOSED'")),
    ).toBe(true);
    expect(
      query.mock.calls.some(([sql]) =>
        sql.includes("leave_requests SET status='CANCELLED'"),
      ),
    ).toBe(false);
  });
  it('prevents the employee from approving their own cancellation', async () => {
    const { service, query } = setup({
      id: 'c-1',
      origin: 'EMPLOYEE',
      status: 'AWAITING_REVIEW',
    });
    await expect(
      service.decideCancellation(
        { ...reviewer, userId: employee.userId },
        'r-1',
        'APPROVE',
        'Okay',
      ),
    ).rejects.toThrow('Another authorized reviewer');
    expect(
      query.mock.calls.some(([sql]) =>
        sql.includes("leave_requests SET status='CANCELLED'"),
      ),
    ).toBe(false);
  });
  it('restores approved credits only when a separate reviewer approves cancellation', async () => {
    const { service, query } = setup({
      id: 'c-1',
      origin: 'EMPLOYEE',
      status: 'AWAITING_REVIEW',
      proposedStart: null,
      proposedEnd: null,
    });
    vi.spyOn(service, 'own').mockResolvedValue(undefined);
    await expect(
      service.decideCancellation(reviewer, 'r-1', 'APPROVE', 'Confirmed'),
    ).resolves.toEqual({ cancelled: true, replacementRequestId: null });
    expect(
      query.mock.calls.some(([sql]) =>
        sql.includes('leave_credit_transactions'),
      ),
    ).toBe(true);
    expect(
      query.mock.calls.some(([sql]) =>
        sql.includes("leave_requests SET status='CANCELLED'"),
      ),
    ).toBe(true);
    expect(
      query.mock.calls.some(([sql]) =>
        sql.includes("leave_cancellation_reviews SET status='CLOSED'"),
      ),
    ).toBe(true);
  });
  it('creates a new pending request when a reviewer accepts proposed dates', async () => {
    const { service, query } = setup({
      id: 'c-1',
      origin: 'REVIEWER',
      status: 'AWAITING_REVIEW',
      proposedStart: '2027-01-20',
      proposedEnd: '2027-01-20',
    });
    vi.spyOn(service, 'own').mockResolvedValue(undefined);
    vi.spyOn(service, 'quote').mockResolvedValue({
      policy: { paid: true, attachmentRule: 'OPTIONAL' },
      version: 1,
      days: 1,
      dates: [{ date: '2027-01-20', units: 1 }],
    } as never);
    const result = await service.decideCancellation(
      reviewer,
      'r-1',
      'APPROVE',
      'Dates accepted',
    );
    expect(result).toMatchObject({
      cancelled: true,
      replacementRequestId: expect.any(String),
    });
    expect(
      query.mock.calls.some(([sql]) =>
        sql.includes('INSERT INTO leave_requests'),
      ),
    ).toBe(true);
    expect(
      query.mock.calls.some(([sql]) =>
        sql.includes('INSERT INTO leave_request_days'),
      ),
    ).toBe(true);
  });
});
