import type { DataSource } from 'typeorm';
import { BadRequestException } from '@nestjs/common';

export type NotificationType = 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';

export type Notification = {
  id: string;
  userId: string;
  branchId: string | null;
  title: string;
  message: string;
  senderName?: string | null;
  type: NotificationType;
  href?: string | null;
  read: boolean;
  createdAt: string;
};

export class NotificationService {
  private notifications = new Map<string, Notification>();

  constructor(private readonly dataSource?: DataSource) {}

  create(input: Notification): Notification {
    this.notifications.set(input.id, input);
    return input;
  }

  get(id: string): Notification | undefined {
    return this.notifications.get(id);
  }

  async unread(userId: string): Promise<Notification[]> {
    if (this.dataSource) {
      return this.dataSource.query<Notification[]>(
        `SELECT id, user_id AS "userId", branch_id AS "branchId", title,
                message, sender_name AS "senderName", href, type, read, created_at AS "createdAt"
         FROM notifications
         WHERE user_id = $1 AND read = false
           AND created_at >= now() - interval '60 days'
         ORDER BY created_at DESC`,
        [userId],
      );
    }
    return Array.from(this.notifications.values()).filter(
      (notification) =>
        notification.userId === userId &&
        !notification.read &&
        this.isCurrent(notification),
    );
  }

  private isCurrent(note: Notification): boolean {
    return new Date(note.createdAt).getTime() >= Date.now() - 60 * 86_400_000;
  }

  async inbox(userId: string, page = 1, filter = 'all') {
    if (
      !Number.isSafeInteger(page) ||
      page < 1 ||
      page > 100_000 ||
      !['all', 'unread'].includes(filter)
    ) {
      throw new BadRequestException('Invalid notification page or filter.');
    }
    const pageSize = 30;
    if (this.dataSource) {
      const [counts, items] = await Promise.all([
        this.dataSource.query<Array<{ total: number; unreadCount: number }>>(
          `SELECT count(*) FILTER (WHERE $2 = 'all' OR read = false)::int AS total,
                  count(*) FILTER (WHERE read = false)::int AS "unreadCount"
           FROM notifications WHERE user_id = $1
             AND created_at >= now() - interval '60 days'`,
          [userId, filter],
        ),
        this.dataSource.query<Notification[]>(
          `SELECT id, user_id AS "userId", branch_id AS "branchId", title,
                  message, sender_name AS "senderName", href, type, read, created_at AS "createdAt"
           FROM notifications WHERE user_id = $1
             AND created_at >= now() - interval '60 days'
             AND ($2 = 'all' OR read = false)
           ORDER BY created_at DESC, id DESC LIMIT $3 OFFSET $4`,
          [userId, filter, pageSize, (page - 1) * pageSize],
        ),
      ]);
      return {
        items,
        total: counts[0]?.total ?? 0,
        unreadCount: counts[0]?.unreadCount ?? 0,
        page,
        pageSize,
      };
    }
    const all = [...this.notifications.values()]
      .filter((n) => n.userId === userId && this.isCurrent(n))
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() ||
          b.id.localeCompare(a.id),
      );
    const filtered = all.filter((n) => filter === 'all' || !n.read);
    return {
      items: filtered.slice((page - 1) * pageSize, page * pageSize),
      total: filtered.length,
      unreadCount: all.filter((n) => !n.read).length,
      page,
      pageSize,
    };
  }

  async readAll(userId: string): Promise<{ ok: true }> {
    if (this.dataSource) {
      await this.dataSource.query(
        `UPDATE notifications SET read = true
        WHERE user_id = $1 AND read = false AND created_at >= now() - interval '60 days'`,
        [userId],
      );
    } else {
      for (const note of this.notifications.values()) {
        if (note.userId === userId && this.isCurrent(note)) note.read = true;
      }
    }
    return { ok: true };
  }

  async remove(id: string, userId: string): Promise<{ ok: true }> {
    // Each event already has a separate notification row for every recipient.
    if (this.dataSource) {
      await this.dataSource.query(
        'DELETE FROM notifications WHERE id = $1 AND user_id = $2',
        [id, userId],
      );
    } else if (this.notifications.get(id)?.userId === userId) {
      this.notifications.delete(id);
    }
    return { ok: true };
  }

  markRead(id: string): Notification | undefined {
    const notification = this.notifications.get(id);
    if (!notification) {
      return undefined;
    }

    notification.read = true;
    return notification;
  }

  async dismiss(id: string, userId: string): Promise<{ ok: true }> {
    if (this.dataSource) {
      await this.dataSource.query(
        'UPDATE notifications SET read = true WHERE id = $1 AND user_id = $2',
        [id, userId],
      );
    } else if (this.notifications.get(id)?.userId === userId) {
      this.markRead(id);
    }
    return { ok: true };
  }
}
