import 'reflect-metadata';
import { Global, Module, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CrmModule } from '../crm.module.js';
import { InquiryManagementController } from './inquiry-management.controller.js';
import { InquiryManagementService } from './inquiry-management.service.js';

describe('Inquiry HTTP dependency injection', () => {
  let app: INestApplication | undefined;
  afterEach(async () => { await app?.close(); });

  it('serves metadata through the Nest guard and enforces its rate limit', async () => {
    const query = vi.fn().mockResolvedValue([{ count: 1 }]);
    class DiagnosticDatabaseModule {}
    Global()(DiagnosticDatabaseModule);
    Module({
      providers: [{ provide: getDataSourceToken(), useValue: { query } }],
      exports: [getDataSourceToken()],
    })(DiagnosticDatabaseModule);
    // Vitest does not emit the constructor metadata emitted by the Nest build.
    Reflect.defineMetadata('design:paramtypes', [InquiryManagementService], InquiryManagementController);
    const metadata = vi.fn().mockResolvedValue({ branches: [], staff: [], lookups: [] });
    const module = await Test.createTestingModule({ imports: [DiagnosticDatabaseModule, CrmModule] })
      .overrideProvider(InquiryManagementService).useValue({ metadata }).compile();
    app = module.createNestApplication();
    app.use((req: { user?: unknown }, _res: unknown, next: () => void) => {
      req.user = { userId: 'diagnostic', role: 'SUPER_ADMIN' };
      next();
    });
    await app.init();
    await request(app.getHttpServer()).get('/inquiries/metadata').expect(200);
    expect(metadata).toHaveBeenCalledOnce();
    expect(query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO api_rate_limit'), expect.any(Array));
    query.mockResolvedValue([{ count: 181 }]);
    await request(app.getHttpServer()).get('/inquiries/metadata').expect(429);
    expect(metadata).toHaveBeenCalledOnce();
  });
});
