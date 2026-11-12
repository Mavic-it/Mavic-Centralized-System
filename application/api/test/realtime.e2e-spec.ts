import { existsSync } from 'node:fs';
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { installRealtimeTriggers } from '../src/realtime/install-triggers.js';
import { WorkspaceRealtime1792972802000 } from '../src/database/migrations/1792972802000-WorkspaceRealtime.js';
import { Test } from '@nestjs/testing';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { firstValueFrom } from 'rxjs';
import type { Request, Response, NextFunction } from 'express';
import { RealtimeService, REALTIME_CHANNEL_TOKEN } from '../src/realtime/realtime.service.js';
import { RealtimeController } from '../src/realtime/realtime.controller.js';
import { AuthService } from '../src/foundation/auth/auth.service.js';
import { AuthGuard } from '../src/foundation/auth/auth.guard.js';

describe.skipIf(process.env.RUN_DATABASE_MIGRATION_TESTS !== 'true')(
  'PostgreSQL committed realtime changes',
  () => {
    const suffix = randomUUID().replaceAll('-', '');
    const schema = `realtime_test_${suffix}`;
    const channel = `realtime_test_${suffix}`;
    let admin: DataSource, db: DataSource;
    const listeners: Client[] = [];
    const received: string[][] = [[], []];
    beforeAll(async () => {
      if (existsSync('.env')) process.loadEnvFile('.env');
      const options = {
        type: 'postgres' as const,
        host: process.env.DB_HOST ?? 'localhost',
        port: Number(process.env.DB_PORT ?? 5432),
        username: process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_DATABASE,
        synchronize: false,
        migrationsRun: false,
      };
      admin = await new DataSource(options).initialize();
      await admin.query(`CREATE SCHEMA "${schema}"`);
      db = await new DataSource({
        ...options,
        extra: { options: `-c search_path=${schema},public` },
      }).initialize();
      await db.query(
        'CREATE TABLE sample(id integer PRIMARY KEY,private_value text); CREATE TABLE migrations(id integer)',
      );
      const runner = db.createQueryRunner();
      await runner.connect();
      try {
        expect(await installRealtimeTriggers(runner, channel)).toBe(1);
      } finally {
        await runner.release();
      }
      for (let index = 0; index < 2; index++) {
        const listener = new Client({
          host: options.host,
          port: options.port,
          user: options.username,
          password: options.password,
          database: options.database,
        });
        await listener.connect();
        listener.on('notification', (event) => {
          if (event.channel === channel)
            received[index].push(event.payload ?? '');
        });
        await listener.query(`LISTEN ${channel}`);
        listeners.push(listener);
      }
    }, 30_000);
    afterAll(async () => {
      await Promise.all(listeners.map((listener) => listener.end()));
      if (db?.isInitialized) await db.destroy();
      if (admin?.isInitialized) {
        if (!/^realtime_test_[a-f0-9]{32}$/.test(schema))
          throw new Error('Unsafe schema');
        await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
        await admin.destroy();
      }
    });
    it('notifies two independent listeners only on commit, with no row data', async () => {
      const writer = db.createQueryRunner();
      await writer.connect();
      await writer.startTransaction();
      try {
        await writer.query("INSERT INTO sample VALUES(1,'private fixture')");
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(received).toEqual([[], []]);
        await writer.commitTransaction();
        await vi.waitFor(() =>
          expect(received).toEqual([['refresh'], ['refresh']]),
        );
      } finally {
        if (writer.isTransactionActive) await writer.rollbackTransaction();
        await writer.release();
      }
    });
    it('sends nothing for rolled-back writes', async () => {
      const before = received.map((events) => events.length);
      const writer = db.createQueryRunner();
      await writer.connect();
      await writer.startTransaction();
      try {
        await writer.query("UPDATE sample SET private_value='rolled back'");
        await writer.rollbackTransaction();
      } finally {
        await writer.release();
      }
      await new Promise((resolve) => setTimeout(resolve, 80));
      expect(received.map((events) => events.length)).toEqual(before);
    });
    it('coalesces several statements in one transaction and supports future tables', async () => {
      await db.query('CREATE TABLE future_module(id integer)');
      const runner = db.createQueryRunner();
      await runner.connect();
      try {
        expect(await installRealtimeTriggers(runner, channel)).toBe(2);
      } finally {
        await runner.release();
      }
      const before = received[0].length;
      await db.transaction(async (m) => {
        await m.query('INSERT INTO future_module VALUES(1)');
        await m.query('UPDATE future_module SET id=2');
        await m.query('DELETE FROM future_module');
      });
      await vi.waitFor(() => expect(received[0]).toHaveLength(before + 1));
      expect(received.flat().every((value) => value === 'refresh')).toBe(true);
    });
    it('pushes a committed change over real HTTP to two authenticated clients and rejects anonymous access', async () => {
      await db.query("CREATE TABLE users(id text,role text,status text,must_change_password boolean); INSERT INTO users VALUES('fixture-a','EMPLOYEE','ACTIVE',false),('fixture-b','EMPLOYEE','ACTIVE',false)");
      const token = (cookie?: string) => /fixture_session=(fixture-[ab])/.exec(cookie ?? '')?.[1];
      const auth = {
        readSessionCookie: token,
        validateWorkspaceSession: async (session: string) => ({ valid: ['fixture-a','fixture-b'].includes(session), payload: {sub:session,role:'EMPLOYEE'} }),
      };
      const module = await Test.createTestingModule({
        controllers: [RealtimeController],
        providers: [RealtimeService, {provide:DataSource,useValue:db}, {provide:AuthService,useValue:auth},
          {provide:REALTIME_CHANNEL_TOKEN,useValue:channel},
          {provide:APP_GUARD,useValue:new AuthGuard(new Reflector(), {authorize:()=>({allowed:true})} as never)}],
      }).compile();
      const app = module.createNestApplication({logger:false});
      app.use((req: Request & {user?: unknown},_res: Response,next: NextFunction)=>{
        const userId=token(req.headers.cookie);
        if(userId)req.user={userId,role:'EMPLOYEE',branchId:null,email:`${userId}@example.test`};
        next();
      });
      const connected = firstValueFrom(module.get(RealtimeService).changes);
      const aborts: AbortController[]=[];
      try {
        await app.listen(0,'127.0.0.1');await connected;
        const url=`${await app.getUrl()}/realtime/events`;
        expect((await fetch(url)).status).toBe(401);
        const streams=await Promise.all(['fixture-a','fixture-b'].map(async(id)=>{
          const controller=new AbortController();aborts.push(controller);
          const response=await fetch(url,{headers:{cookie:`fixture_session=${id}`},signal:controller.signal});
          expect(response.status).toBe(200);expect(response.headers.get('content-type')).toContain('text/event-stream');
          const reader=response.body!.getReader();const decoder=new TextDecoder();let text='';
          return { async until(event: string) {
            while(!text.includes(`event: ${event}`)){const next=await reader.read();if(next.done)throw new Error('Stream ended early');text+=decoder.decode(next.value,{stream:true});}
            const result=text;text='';return result;
          }};
        }));
        await Promise.all(streams.map((stream)=>stream.until('ping')));
        await db.transaction(async(manager)=>{await manager.query("UPDATE sample SET private_value='committed private fixture'");});
        const updates=await Promise.all(streams.map((stream)=>stream.until('refresh')));
        for(const update of updates){expect(update).toContain('"refresh":true');expect(update).not.toContain('private fixture');}
      } finally {aborts.forEach((controller)=>controller.abort());await app.close();}
    },20_000);
    it('can remove realtime triggers without deleting business data', async () => {
      const runner = db.createQueryRunner();
      await runner.connect();
      try {
        await new WorkspaceRealtime1792972802000().down(runner);
      } finally {
        await runner.release();
      }
      const before = received[0].length;
      await db.query("UPDATE sample SET private_value='after rollback'");
      await new Promise((resolve) => setTimeout(resolve, 80));
      expect(received[0]).toHaveLength(before);
      expect(
        (await db.query('SELECT count(*)::int AS count FROM sample'))[0].count,
      ).toBe(1);
    });
  },
);
