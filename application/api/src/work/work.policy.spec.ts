import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateIncidentDto, CreateTaskDto, WorkActionDto } from './work.dto.js';
import {
  incidentTransition,
  reportTransition,
  taskTransition,
  taskStatusChange,
  validDate,
} from './work.policy.js';
describe('task workflow', () => {
  it('accepts common violation categories and legacy timekeeping while rejecting unknown categories', async () => {
    for (const category of [
      'ATTENDANCE',
      'CONDUCT',
      'POLICY',
      'PERFORMANCE',
      'SECURITY',
      'PROPERTY',
      'SAFETY',
      'OTHER',
      'TIMEKEEPING',
      'UNKNOWN',
    ]) {
      const dto = plainToInstance(CreateIncidentDto, {
        submissionKey: '123e4567-e89b-42d3-a456-426614174000',
        branchId: 'branch',
        title: 'Incident report',
        description: 'Incident details',
        incidentDate: '2026-11-05',
        category,
      });
      const errors = await validate(dto);
      expect(errors.map((error) => error.property)).toEqual(
        category === 'UNKNOWN' ? ['category'] : [],
      );
    }
  });
  it('requires an assignee update and independent completion review', () => {
    expect(taskTransition('TODO', 'START', true, false)).toBe('IN_PROGRESS');
    expect(taskTransition('IN_PROGRESS', 'SUBMIT', true, false)).toBe(
      'FOR_REVIEW',
    );
    expect(taskTransition('FOR_REVIEW', 'CHANGES', false, true)).toBe(
      'IN_PROGRESS',
    );
    expect(taskTransition('FOR_REVIEW', 'ACCEPT', false, true)).toBe(
      'COMPLETED',
    );
    expect(() => taskTransition('FOR_REVIEW', 'ACCEPT', true, true)).toThrow(
      'different authorized manager',
    );
    expect(() => taskTransition('TODO', 'PROGRESS', false, true)).toThrow(
      'assignee',
    );
    expect(() => taskTransition('TODO', 'ACCEPT', false, true)).toThrow(
      'unavailable',
    );
    expect(() => taskTransition('COMPLETED', 'COMMENT', true, true)).toThrow(
      'closed',
    );
  });
});
describe('confidential incident workflow', () => {
  it('keeps internal review, reporter follow-ups and subject notices separate', () => {
    expect(
      incidentTransition('SUBMITTED', 'REVIEW', true, false, false),
    ).toEqual({ status: 'UNDER_REVIEW', audience: 'INTERNAL' });
    expect(
      incidentTransition('UNDER_REVIEW', 'REQUEST_DETAILS', true, false, false),
    ).toEqual({ status: 'DETAILS_REQUESTED', audience: 'REPORTER' });
    expect(
      incidentTransition('DETAILS_REQUESTED', 'COMMENT', false, true, false),
    ).toEqual({ status: 'UNDER_REVIEW', audience: 'REPORTER' });
    expect(
      incidentTransition('DISCIPLINARY_REVIEW', 'NOTICE', true, false, false),
    ).toEqual({ status: 'NOTICE_ISSUED', audience: 'SUBJECT' });
    expect(
      incidentTransition('NOTICE_ISSUED', 'ACKNOWLEDGE', false, false, true),
    ).toEqual({ status: 'AWAITING_RESPONSE', audience: 'SUBJECT' });
    expect(
      incidentTransition('AWAITING_RESPONSE', 'RESPONSE', false, false, true),
    ).toEqual({ status: 'DECISION_PENDING', audience: 'SUBJECT' });
    expect(
      incidentTransition('DECISION_PENDING', 'DECIDE', true, false, false),
    ).toEqual({ status: 'CLOSED', audience: 'SUBJECT' });
  });
  it('blocks shortcuts, unassigned review and actions on closed cases', () => {
    expect(() =>
      incidentTransition('UNDER_REVIEW', 'DECIDE', true, false, false),
    ).toThrow('unavailable');
    expect(() =>
      incidentTransition('SUBMITTED', 'REVIEW', false, true, false),
    ).toThrow('authorized case reviewer');
    expect(() =>
      incidentTransition('NOTICE_ISSUED', 'ACKNOWLEDGE', false, true, false),
    ).toThrow('recipient');
    expect(() =>
      incidentTransition('CLOSED', 'COMMENT', true, false, false),
    ).toThrow('closed');
  });
});
describe('work input validation', () => {
  it('validates bounded and unique task reassignment lists', async () => {
    const valid = plainToInstance(WorkActionDto, {
      version: 1,
      action: 'REASSIGN',
      employeeIds: ['e1', 'e2'],
    });
    expect(await validate(valid, { whitelist: true })).toHaveLength(0);
    const duplicate = plainToInstance(WorkActionDto, {
      version: 1,
      action: 'REASSIGN',
      employeeIds: ['e1', 'e1'],
    });
    expect(await validate(duplicate, { whitelist: true })).not.toHaveLength(0);
  });

  it('rejects impossible dates and validates leap days', () => {
    expect(validDate('2028-02-29')).toBe('2028-02-29');
    for (const d of [
      '2026-02-29',
      '2026-13-01',
      '2026-10-00',
      'invalid',
      '0000-01-01',
    ])
      expect(() => validDate(d)).toThrow('calendar date');
  });
  it('rejects invalid action ranges, missing fields and forged fields', async () => {
    const options = { whitelist: true, forbidNonWhitelisted: true };
    expect(
      await validate(
        plainToInstance(WorkActionDto, {
          version: 1,
          action: 'PROGRESS',
          message: 'Done',
          progress: 101,
        }),
        options,
      ),
    ).not.toHaveLength(0);
    expect(
      await validate(
        plainToInstance(CreateTaskDto, { title: 'Only title' }),
        options,
      ),
    ).not.toHaveLength(0);
    expect(
      await validate(
        plainToInstance(CreateIncidentDto, { status: 'CLOSED' }),
        options,
      ),
    ).not.toHaveLength(0);
    expect(
      await validate(
        plainToInstance(WorkActionDto, {
          version: 1,
          action: 'COMMENT',
          message: 'Update',
          status: 'COMPLETED',
        }),
        options,
      ),
    ).not.toHaveLength(0);
  });
});

describe('incident report lifecycle', () => {
  it('requires reporter ownership or decision authority for terminal outcomes and rejects later writes', () => {
    expect(
      reportTransition('SUBMITTED', 'WITHDRAW', false, true, false).status,
    ).toBe('WITHDRAWN');
    expect(() =>
      reportTransition('SUBMITTED', 'WITHDRAW', false, false, false),
    ).toThrow('reporter');
    expect(() =>
      reportTransition('UNDER_REVIEW', 'DISMISS', true, false, false),
    ).toThrow('decision reviewer');
    expect(
      reportTransition('UNDER_REVIEW', 'DISMISS', true, false, true).status,
    ).toBe('DISMISSED');
    for (const state of ['WITHDRAWN', 'DISMISSED'])
      expect(() =>
        reportTransition(state, 'COMMENT', true, true, true),
      ).toThrow('closed');
  });
  it('supports acknowledgement and repeated clarification without starting discipline', () => {
    expect(
      reportTransition('SUBMITTED', 'RECEIVE', true, false, false),
    ).toEqual({ status: 'UNDER_REVIEW', audience: 'PARTICIPANTS' });
    expect(
      reportTransition('UNDER_REVIEW', 'REQUEST_DETAILS', true, false, false)
        .status,
    ).toBe('DETAILS_REQUESTED');
    expect(
      reportTransition('DETAILS_REQUESTED', 'CLARIFY', false, true, false)
        .status,
    ).toBe('UNDER_REVIEW');
    expect(() =>
      reportTransition('DETAILS_REQUESTED', 'CLARIFY', false, false, false),
    ).toThrow('addressed');
    expect(() =>
      reportTransition('UNDER_REVIEW', 'CLARIFY', false, true, false),
    ).toThrow('addressed');
  });
  it('requires HR resolution before final closure and rejects further changes', () => {
    expect(() =>
      reportTransition('UNDER_REVIEW', 'RESOLVE', true, false, false),
    ).toThrow('Super/HR');
    expect(() =>
      reportTransition('UNDER_REVIEW', 'CLOSE', true, false, true),
    ).toThrow('Resolve');
    expect(
      reportTransition('UNDER_REVIEW', 'RESOLVE', true, false, true).status,
    ).toBe('RESOLVED');
    expect(() =>
      reportTransition('RESOLVED', 'RESOLVE', true, false, true),
    ).toThrow('resolved');
    expect(
      reportTransition('RESOLVED', 'CLOSE', true, false, true).status,
    ).toBe('CLOSED');
    expect(() =>
      reportTransition('CLOSED', 'COMMENT', true, false, true),
    ).toThrow('closed');
  });
});

describe('simple task states and multipart DTOs', () => {
  it('derives progress and preserves stuck progress while requiring an assignee', () => {
    expect(taskStatusChange('TODO', 'STARTED', true, 0)).toEqual({
      status: 'STARTED',
      progress: 10,
    });
    expect(taskStatusChange('IN_PROGRESS', 'STUCK', true, 50)).toEqual({
      status: 'STUCK',
      progress: 50,
    });
    expect(taskStatusChange('STUCK', 'DONE', true, 50)).toEqual({
      status: 'FOR_REVIEW',
      progress: 100,
    });
    expect(() => taskStatusChange('TODO', 'DONE', false, 0)).toThrow(
      'assignee',
    );
    expect(() =>
      taskStatusChange('FOR_REVIEW', 'NOT_STARTED', true, 100),
    ).toThrow('awaiting');
    expect(() => taskStatusChange('COMPLETED', 'DONE', true, 100)).toThrow(
      'closed',
    );
  });
  it('validates bounded unique multipart employee arrays and numeric action versions', async () => {
    const dto = plainToInstance(CreateTaskDto, {
      submissionKey: '11111111-1111-4111-8111-111111111111',
      employeeIds: '["e1","e2"]',
      title: 'Task',
      description: 'Description',
      priority: 'NORMAL',
      startDate: '2026-10-29',
      dueDate: '2026-11-01',
    });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.employeeIds).toEqual(['e1', 'e2']);
    dto.employeeIds = ['e1', 'e1'];
    expect(await validate(dto)).not.toHaveLength(0);
    expect(
      await validate(
        plainToInstance(WorkActionDto, {
          version: '1',
          action: 'STATUS',
          taskState: 'DONE',
          message: 'Ready',
        }),
      ),
    ).toHaveLength(0);
  });
});
