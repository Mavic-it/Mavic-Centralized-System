import 'reflect-metadata';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Reflector } from '@nestjs/core';
import { lastValueFrom, of, Subject, throwError } from 'rxjs';
import type { ExecutionContext } from '@nestjs/common';
import type { AuthenticatedRequest } from '../foundation/auth/auth.context.js';
import { RealtimeInterceptor } from './realtime.interceptor.js';
import { RealtimeController } from './realtime.controller.js';

afterEach(() => vi.useRealTimers());
describe('Realtime write interception', () => {
  it.each([
    ['POST', '/future-module/items', 201, true],
    ['PATCH', '/employees/one', 200, true],
    ['DELETE', '/notifications/one', 200, true],
    ['GET', '/employees', 200, false],
    ['POST', '/leave/me/preview', 201, false],
    ['POST', '/attendance/dtr/preview', 201, false],
    ['POST', '/employees', 409, false],
  ])(
    '%s %s only publishes for successful mutations',
    async (method, path, statusCode, expected) => {
      const changed = vi.fn();
      const context = {
        switchToHttp: () => ({
          getRequest: () => ({ method, path, user: { userId: 'fixture' } }),
          getResponse: () => ({ statusCode }),
        }),
        getHandler: () => () => undefined,
        getClass: () => RealtimeController,
      } as unknown as ExecutionContext;
      const interceptor = new RealtimeInterceptor(
        { changed } as never,
        new Reflector(),
      );
      await lastValueFrom(
        interceptor.intercept(context, { handle: () => of({ ok: true }) }),
      );
      expect(changed).toHaveBeenCalledTimes(expected ? 1 : 0);
    },
  );
  it('does not publish for a thrown error or an explicitly read-only POST', async () => {
    const changed = vi.fn();
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue(false) };
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ method: 'POST', path: '/items', user: {} }),
        getResponse: () => ({ statusCode: 200 }),
      }),
      getHandler: () => undefined,
      getClass: () => undefined,
    } as unknown as ExecutionContext;
    const interceptor = new RealtimeInterceptor(
      { changed } as never,
      reflector as unknown as Reflector,
    );
    await expect(
      lastValueFrom(
        interceptor.intercept(context, {
          handle: () => throwError(() => new Error('rollback')),
        }),
      ),
    ).rejects.toThrow('rollback');
    reflector.getAllAndOverride.mockReturnValue(true);
    await lastValueFrom(
      interceptor.intercept(context, { handle: () => of({}) }),
    );
    expect(changed).not.toHaveBeenCalled();
  });
});

describe('Authenticated realtime streams', () => {
  function setup() {
    const changes = new Subject<void>();
    const auth = {
      readSessionCookie: vi.fn().mockReturnValue('session-fixture'),
      validateWorkspaceSession: vi.fn().mockResolvedValue({
        valid: true,
        payload: { sub: 'user-1', role: 'EMPLOYEE' },
      }),
    };
    const db = {
      query: vi.fn().mockResolvedValue([{ mustChangePassword: false }]),
    };
    const controller = new RealtimeController(
      { changes } as never,
      auth as never,
      db as never,
    );
    const request = {
      user: { userId: 'user-1', role: 'EMPLOYEE' },
      headers: { cookie: 'mspaces_session=session-fixture' },
    } as AuthenticatedRequest;
    return { controller, request, changes, auth, db };
  }
  it('uses an empty heartbeat and generic refresh signal without record data', async () => {
    const { controller, request, changes } = setup();
    const events: unknown[] = [];
    const subscription = controller
      .stream(request)
      .subscribe((event) => events.push(event));
    await vi.waitFor(() => expect(events).toHaveLength(1));
    changes.next();
    expect(events).toEqual([
      { type: 'ping', data: {} },
      { type: 'refresh', data: { refresh: true } },
    ]);
    subscription.unsubscribe();
    expect(changes.observed).toBe(false);
  });
  it('rejects unauthenticated connections and caps/reclaims per-account slots', () => {
    const { controller, request } = setup();
    expect(() =>
      controller.stream({ headers: {} } as AuthenticatedRequest),
    ).toThrow('Authentication');
    const subscriptions = Array.from({ length: 6 }, () =>
      controller.stream(request).subscribe(),
    );
    expect(() => controller.stream(request)).toThrow('Too many');
    subscriptions.pop()!.unsubscribe();
    subscriptions.push(controller.stream(request).subscribe());
    subscriptions.forEach((subscription) => subscription.unsubscribe());
  });
  it.each(['revoked', 'disabled', 'password-change', 'role-changed'])(
    'closes when access is %s',
    async (kind) => {
      const { controller, request, auth, db } = setup();
      if (kind === 'revoked')
        auth.validateWorkspaceSession.mockResolvedValue({
          valid: false,
          payload: { sub: 'user-1', role: 'EMPLOYEE' },
        });
      if (kind === 'role-changed')
        auth.validateWorkspaceSession.mockResolvedValue({
          valid: true,
          payload: { sub: 'user-1', role: 'STAFF' },
        });
      if (kind === 'disabled') db.query.mockResolvedValue([]);
      if (kind === 'password-change')
        db.query.mockResolvedValue([{ mustChangePassword: true }]);
      const completed = vi.fn();
      const subscription = controller
        .stream(request)
        .subscribe({ complete: completed });
      await vi.waitFor(() => expect(completed).toHaveBeenCalledOnce());
      expect(subscription.closed).toBe(true);
    },
  );
  it('rechecks an established connection and cleans up its timer', async () => {
    vi.useFakeTimers();
    const { controller, request, auth } = setup();
    const completed = vi.fn();
    const subscription = controller
      .stream(request)
      .subscribe({ complete: completed });
    await vi.advanceTimersByTimeAsync(1);
    auth.validateWorkspaceSession.mockResolvedValue({
      valid: false,
      payload: { sub: 'user-1', role: 'EMPLOYEE' },
    });
    await vi.advanceTimersByTimeAsync(20_000);
    expect(completed).toHaveBeenCalledOnce();
    subscription.unsubscribe();
    expect(vi.getTimerCount()).toBe(0);
  });
});
