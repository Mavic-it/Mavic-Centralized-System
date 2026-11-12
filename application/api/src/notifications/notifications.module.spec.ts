import { describe, expect, it, vi } from 'vitest';
import { NotificationController } from './notification.controller.js';
import { NotificationService } from './notification.service.js';

describe('MSPACES notifications module', () => {
  it('limits persisted read updates to the authenticated recipient', async () => {
    const query = vi.fn().mockResolvedValue([]);
    const service = new NotificationService({ query } as never);
    await service.dismiss('note-1', 'u-1');
    expect(query).toHaveBeenCalledWith(
      'UPDATE notifications SET read = true WHERE id = $1 AND user_id = $2',
      ['note-1', 'u-1'],
    );
  });

  it('returns persisted destinations only for the authenticated recipient', async () => {
    const notes = [{ id: 'note-1', href: '/my-leave?requestId=leave-1' }];
    const query = vi.fn().mockResolvedValue(notes);
    const service = new NotificationService({ query } as never);
    await expect(service.unread('u-1')).resolves.toEqual(notes);
    expect(query.mock.calls[0][0]).toContain('sender_name AS "senderName"');
    expect(query.mock.calls[0][0]).toContain(
      'WHERE user_id = $1 AND read = false',
    );
    expect(query.mock.calls[0][1]).toEqual(['u-1']);
  });

  it('sends a notification and marks it as unread until read', async () => {
    const service = new NotificationService();
    const controller = new NotificationController(service);

    const note = controller.create({
      id: 'note-1',
      userId: 'u-1',
      branchId: 'branch-1',
      title: 'Leave approved',
      message: 'Your annual leave request has been approved.',
      type: 'INFO',
      read: false,
      createdAt: '2026-10-10T12:00:00Z',
    });

    expect(note.title).toBe('Leave approved');
    await expect(
      controller.unread({ user: { userId: 'u-1' } } as any),
    ).resolves.toHaveLength(1);

    controller.markRead('note-1');
    expect(controller.get('note-1')?.read).toBe(true);
  });
});

describe('Notification history and personal deletion', () => {
  const note = (id: string, userId = 'a', age = 0, read = false) => ({
    id,
    userId,
    branchId: null,
    title: 'Shared event',
    message: 'An update',
    type: 'INFO' as const,
    read,
    createdAt: new Date(Date.now() - age * 86_400_000).toISOString(),
  });

  it('retains read notifications and excludes expired records and other recipients', async () => {
    const service = new NotificationService();
    [
      note('unread'),
      note('read', 'a', 59, true),
      note('expired', 'a', 61),
      note('private', 'b'),
    ].forEach((n) => service.create(n));
    await service.dismiss('unread', 'a');
    const all = await service.inbox('a');
    expect(all.items.map((n) => n.id)).toEqual(['unread', 'read']);
    expect(all.unreadCount).toBe(0);
    expect((await service.inbox('a', 1, 'unread')).total).toBe(0);
  });

  it('deletes only the authenticated user copy and permits repeat deletion', async () => {
    const service = new NotificationService();
    service.create(note('copy-a'));
    service.create(note('copy-b', 'b'));
    await service.remove('copy-b', 'a');
    expect((await service.inbox('b')).total).toBe(1);
    await service.remove('copy-a', 'a');
    await service.remove('copy-a', 'a');
    expect((await service.inbox('a')).total).toBe(0);
    expect((await service.inbox('b')).total).toBe(1);
  });

  it('marks all read only for the recipient without removing history', async () => {
    const service = new NotificationService();
    service.create(note('a'));
    service.create(note('b', 'b'));
    await service.readAll('a');
    expect((await service.inbox('a')).items[0].read).toBe(true);
    expect((await service.unread('b')).length).toBe(1);
  });

  it('pages in stable chronological order and validates inputs', async () => {
    const service = new NotificationService();
    for (let i = 0; i < 35; i++)
      service.create(note(`n-${String(i).padStart(2, '0')}`));
    const first = await service.inbox('a'),
      second = await service.inbox('a', 2);
    expect(first.items.length).toBe(30);
    expect(second.items.length).toBe(5);
    expect(
      new Set([...first.items, ...second.items].map((n) => n.id)).size,
    ).toBe(35);
    for (const page of [0, -1, 1.5, NaN, 100001])
      await expect(service.inbox('a', page)).rejects.toThrow();
    await expect(service.inbox('a', 1, 'invalid')).rejects.toThrow();
  });

  it('scopes persisted delete and bulk-read queries to the authenticated recipient', async () => {
    const query = vi.fn().mockResolvedValue([]);
    const service = new NotificationService({ query } as never);
    await service.remove('id', 'a');
    await service.readAll('a');
    expect(query.mock.calls[0]).toEqual([
      'DELETE FROM notifications WHERE id = $1 AND user_id = $2',
      ['id', 'a'],
    ]);
    expect(query.mock.calls[1][0]).toContain('WHERE user_id = $1');
    expect(query.mock.calls[1][1]).toEqual(['a']);
  });
});
