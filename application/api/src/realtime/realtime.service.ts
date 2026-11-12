import {
  Inject,
  Optional,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Client } from 'pg';
import { Subject } from 'rxjs';

export const REALTIME_CHANNEL = 'mspaces_workspace_refresh_v1';
export const REALTIME_CHANNEL_TOKEN = Symbol('REALTIME_CHANNEL');

@Injectable()
export class RealtimeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RealtimeService.name);
  private readonly updates = new Subject<void>();
  readonly changes = this.updates.asObservable();
  private listener?: Client;
  private retry?: ReturnType<typeof setTimeout>;
  private stopped = false;
  private delay = 1000;

  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    @Optional()
    @Inject(REALTIME_CHANNEL_TOKEN)
    private readonly channel = REALTIME_CHANNEL,
  ) {
    if (!/^[a-z][a-z0-9_]{0,62}$/.test(channel))
      throw new Error('Invalid realtime channel.');
  }

  onModuleInit() {
    void this.connect();
  }

  private async connect() {
    if (this.stopped) return;
    const options = this.db.options;
    if (options.type !== 'postgres') return;
    const ssl =
      typeof options.ssl === 'object'
        ? {
            ca: options.ssl.ca,
            cert: options.ssl.cert,
            key: options.ssl.key,
            rejectUnauthorized: options.ssl.rejectUnauthorized,
            minVersion: options.ssl.minVersion,
          }
        : options.ssl;
    const client = new Client({
      connectionString: options.url,
      host: options.host,
      port: options.port,
      user: options.username,
      password: options.password,
      database: options.database,
      ssl,
      connectionTimeoutMillis: 5000,
      application_name: 'mspaces-realtime',
    });
    this.listener = client;
    const disconnected = () => {
      if (this.listener !== client) return;
      this.listener = undefined;
      void client.end().catch(() => undefined);
      if (!this.stopped && !this.retry) {
        this.logger.warn(
          'Realtime database listener disconnected; reconnect scheduled.',
        );
        this.retry = setTimeout(() => {
          this.retry = undefined;
          void this.connect();
        }, this.delay);
        this.retry.unref();
        this.delay = Math.min(30_000, this.delay * 2);
      }
    };
    client.on('error', disconnected);
    client.on('end', disconnected);
    client.on('notification', (message) => {
      if (message.channel === this.channel && message.payload === 'refresh')
        this.updates.next();
    });
    try {
      await client.connect();
      await client.query(`LISTEN ${this.channel}`);
      this.delay = 1000;
      // Reconciliation after a listener outage: clients reload authorized data.
      this.updates.next();
    } catch {
      disconnected();
    }
  }

  /** Call after commit for non-HTTP jobs on future tables without triggers. */
  changed() {
    if (this.stopped) return;
    this.updates.next();
    // One shared PostgreSQL channel also reaches other API processes.
    void this.db
      .query('SELECT pg_notify($1,$2)', [this.channel, 'refresh'])
      .catch(() => {
        this.logger.warn(
          'Realtime publication unavailable; clients retain refresh fallback.',
        );
      });
  }

  async onModuleDestroy() {
    this.stopped = true;
    clearTimeout(this.retry);
    const listener = this.listener;
    this.listener = undefined;
    this.updates.complete();
    await listener?.end().catch(() => undefined);
  }
}
