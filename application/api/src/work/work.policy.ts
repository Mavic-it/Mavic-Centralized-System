import { BadRequestException, ForbiddenException } from '@nestjs/common';
export type WorkKind = 'tasks' | 'incidents';
export type WorkRecord = {
  id: string;
  branchId: string;
  employeeId: string | null;
  employeeName?: string;
  profilePictureUpdatedAt?: string | null;
  reporterId?: string;
  reviewerId?: string | null;
  createdBy?: string;
  seriesId?: string | null;
  templateId?: string | null;
  occurrenceDate?: string | null;
  recurrence?: 'DAILY' | 'WEEKLY' | 'MONTHLY' | null;
  recurrenceEndDate?: string | null;
  recurrenceActive?: boolean | null;
  startDate?: string | null;
  dueDate?: string;
  createdAt?: string;
  branchName?: string;
  priority?: string;
  sharedWithSubject?: boolean;
  caseStatus?: string | null;
  reportSource?: string;
  reportScope?: string;
  referenceNumber?: string;
  category?: string;
  title: string;
  description: string;
  status: string;
  version: number;
  progress?: number;
  assignees?: Array<{
    id: string;
    name: string;
    profilePictureUpdatedAt?: string | null;
    branchId: string;
    currentBranchId: string;
    branchName: string;
  }>;
  currentBranchId: string | null;
};
export function validDate(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(date.getTime()) ||
    date.getUTCFullYear() < 1 ||
    date.toISOString().slice(0, 10) !== value
  )
    throw new BadRequestException('Enter a valid calendar date.');
  return value;
}
export function taskTransition(
  status: string,
  action: string,
  assignee: boolean,
  manager: boolean,
): string {
  if (['COMPLETED', 'CANCELLED'].includes(status))
    throw new BadRequestException('This task is closed.');
  if (['START', 'PROGRESS', 'SUBMIT'].includes(action) && !assignee)
    throw new ForbiddenException('Only the assignee can update task progress.');
  if (
    ['ACCEPT', 'CHANGES', 'CANCEL'].includes(action) &&
    (!manager || assignee)
  )
    throw new ForbiddenException(
      'A different authorized manager must review this task.',
    );
  if (action === 'COMMENT') return status;
  if (action === 'START' && status === 'TODO') return 'IN_PROGRESS';
  if (
    action === 'PROGRESS' &&
    ['TODO', 'STARTED', 'IN_PROGRESS', 'STUCK'].includes(status)
  )
    return 'IN_PROGRESS';
  if (
    action === 'SUBMIT' &&
    ['TODO', 'STARTED', 'IN_PROGRESS', 'STUCK'].includes(status)
  )
    return 'FOR_REVIEW';
  if (action === 'ACCEPT' && status === 'FOR_REVIEW') return 'COMPLETED';
  if (action === 'CHANGES' && status === 'FOR_REVIEW') return 'IN_PROGRESS';
  if (action === 'CANCEL') return 'CANCELLED';
  throw new BadRequestException(
    'The task changed or this action is unavailable.',
  );
}
export function incidentTransition(
  status: string,
  action: string,
  reviewer: boolean,
  reporter: boolean,
  subject: boolean,
): { status: string; audience: string } {
  if (['CLOSED', 'WITHDRAWN', 'DISMISSED'].includes(status))
    throw new BadRequestException('This incident is closed.');
  if (action === 'COMMENT') {
    if (!reviewer && !reporter)
      throw new ForbiddenException(
        'Only the reporter or reviewer can add follow-up details.',
      );
    return {
      status:
        status === 'DETAILS_REQUESTED' && reporter ? 'UNDER_REVIEW' : status,
      audience: reviewer ? 'INTERNAL' : 'REPORTER',
    };
  }
  if (action === 'ACKNOWLEDGE') {
    if (!subject || status !== 'NOTICE_ISSUED')
      throw new ForbiddenException(
        'Only the recipient can acknowledge an issued notice.',
      );
    return { status: 'AWAITING_RESPONSE', audience: 'SUBJECT' };
  }
  if (action === 'RESPONSE') {
    if (!subject || !['NOTICE_ISSUED', 'AWAITING_RESPONSE'].includes(status))
      throw new ForbiddenException(
        'Only the recipient can respond to an open notice.',
      );
    return { status: 'DECISION_PENDING', audience: 'SUBJECT' };
  }
  if (!reviewer)
    throw new ForbiddenException('An authorized case reviewer is required.');
  const next: Record<string, { from: string[]; to: string; audience: string }> =
    {
      REVIEW: {
        from: ['SUBMITTED', 'DETAILS_REQUESTED'],
        to: 'UNDER_REVIEW',
        audience: 'INTERNAL',
      },
      REQUEST_DETAILS: {
        from: ['SUBMITTED', 'UNDER_REVIEW'],
        to: 'DETAILS_REQUESTED',
        audience: 'REPORTER',
      },
      ESCALATE: {
        from: ['UNDER_REVIEW'],
        to: 'DISCIPLINARY_REVIEW',
        audience: 'INTERNAL',
      },
      NOTICE: {
        from: ['DISCIPLINARY_REVIEW'],
        to: 'NOTICE_ISSUED',
        audience: 'SUBJECT',
      },
      DECIDE: { from: ['DECISION_PENDING'], to: 'CLOSED', audience: 'SUBJECT' },
      CLOSE: {
        from: [
          'SUBMITTED',
          'UNDER_REVIEW',
          'DETAILS_REQUESTED',
          'DISCIPLINARY_REVIEW',
        ],
        to: 'CLOSED',
        audience: 'REPORTER',
      },
      ASSIGN_REVIEWER: {
        from: [
          'SUBMITTED',
          'UNDER_REVIEW',
          'DETAILS_REQUESTED',
          'DISCIPLINARY_REVIEW',
          'NOTICE_ISSUED',
          'AWAITING_RESPONSE',
          'DECISION_PENDING',
        ],
        to: status,
        audience: 'INTERNAL',
      },
      SET_SUBJECT: {
        from: ['SUBMITTED', 'UNDER_REVIEW', 'DETAILS_REQUESTED'],
        to: status,
        audience: 'INTERNAL',
      },
    };
  const rule = next[action];
  if (!rule || !rule.from.includes(status))
    throw new BadRequestException(
      'The case changed or this action is unavailable.',
    );
  return { status: rule.to, audience: rule.audience };
}

export function reportTransition(
  status: string,
  action: string,
  reviewer: boolean,
  participant: boolean,
  hr: boolean,
) {
  if (['CLOSED', 'WITHDRAWN', 'DISMISSED'].includes(status))
    throw new BadRequestException('This report is closed.');
  if (action === 'WITHDRAW') {
    if (!participant || status === 'RESOLVED')
      throw new ForbiddenException(
        'Only the reporter can withdraw an open report.',
      );
    return { status: 'WITHDRAWN', audience: 'PARTICIPANTS' };
  }
  if (action === 'DISMISS') {
    if (!reviewer || !hr || status === 'RESOLVED')
      throw new ForbiddenException(
        'An authorized decision reviewer is required.',
      );
    return { status: 'DISMISSED', audience: 'PARTICIPANTS' };
  }
  if (action === 'CLARIFY' || action === 'EXPLAIN') {
    if (
      !participant ||
      (action === 'CLARIFY' && status !== 'DETAILS_REQUESTED') ||
      (action === 'EXPLAIN' &&
        !['SUBMITTED', 'UNDER_REVIEW', 'ESCALATED'].includes(status))
    )
      throw new ForbiddenException(
        'Only the addressed employee/reporter can reply to an open report.',
      );
    return { status: 'UNDER_REVIEW', audience: 'PARTICIPANTS' };
  }
  if (action === 'COMMENT' && participant && !reviewer && status !== 'RESOLVED')
    return {
      status: status === 'DETAILS_REQUESTED' ? 'UNDER_REVIEW' : status,
      audience: 'REPORTER',
    };
  if (!reviewer)
    throw new ForbiddenException('An authorized case reviewer is required.');
  if (action === 'CLOSE') {
    if (!hr)
      throw new ForbiddenException(
        'Only Super/HR administrators can close reports.',
      );
    if (status !== 'RESOLVED')
      throw new BadRequestException('Resolve the report before closing it.');
    return { status: 'CLOSED', audience: 'PARTICIPANTS' };
  }
  if (status === 'RESOLVED')
    throw new BadRequestException(
      'This report is resolved; only closure is available.',
    );
  if (
    action === 'COMMENT' ||
    action === 'ASSIGN_REVIEWER' ||
    action === 'SET_SUBJECT'
  )
    return { status, audience: 'INTERNAL' };
  if (action === 'RECEIVE')
    return {
      status: status === 'SUBMITTED' ? 'UNDER_REVIEW' : status,
      audience: 'PARTICIPANTS',
    };
  if (
    action === 'REVIEW' &&
    ['SUBMITTED', 'DETAILS_REQUESTED', 'ESCALATED'].includes(status)
  )
    return { status: 'UNDER_REVIEW', audience: 'INTERNAL' };
  if (
    action === 'REQUEST_DETAILS' &&
    ['SUBMITTED', 'UNDER_REVIEW', 'ESCALATED'].includes(status)
  )
    return { status: 'DETAILS_REQUESTED', audience: 'PARTICIPANTS' };
  if (
    action === 'HR_ESCALATE' &&
    ['SUBMITTED', 'UNDER_REVIEW', 'DETAILS_REQUESTED'].includes(status)
  )
    return { status: 'ESCALATED', audience: 'INTERNAL' };
  if (action === 'RESOLVE') {
    if (!hr)
      throw new ForbiddenException(
        'Only Super/HR administrators can resolve reports.',
      );
    if (['UNDER_REVIEW', 'ESCALATED'].includes(status))
      return { status: 'RESOLVED', audience: 'PARTICIPANTS' };
  }
  throw new BadRequestException(
    'The report changed or this action is unavailable.',
  );
}

export function taskStatusChange(
  status: string,
  state: string | undefined,
  assignee: boolean,
  progress: number,
) {
  if (!assignee)
    throw new ForbiddenException('Only an assignee can update task status.');
  if (['COMPLETED', 'CANCELLED'].includes(status))
    throw new BadRequestException('This task is closed.');
  if (status === 'FOR_REVIEW')
    throw new BadRequestException('This task is awaiting review.');
  const map: Record<string, { status: string; progress: number }> = {
    NOT_STARTED: { status: 'TODO', progress: 0 },
    STARTED: { status: 'STARTED', progress: 10 },
    IN_PROGRESS: { status: 'IN_PROGRESS', progress: 50 },
    STUCK: { status: 'STUCK', progress },
    DONE: { status: 'FOR_REVIEW', progress: 100 },
  };
  const next = map[state ?? ''];
  if (!next) throw new BadRequestException('Select a valid task status.');
  return next;
}
