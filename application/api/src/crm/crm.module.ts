import { Module } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import { CustomerController } from './customers/customer.controller.js';
import { CustomerService } from './customers/customer.service.js';
import { InquiryController } from './inquiries/inquiry.controller.js';
import { InquiryService } from './inquiries/inquiry.service.js';
import { InquiryManagementController } from './inquiries/inquiry-management.controller.js';
import { InquiryManagementService } from './inquiries/inquiry-management.service.js';
import { InquiryImportService } from './inquiries/inquiry-import.service.js';
import { InquiryImportController } from './inquiries/inquiry-import.controller.js';
import { InquiryReminderWorker } from './inquiries/inquiry-reminder.worker.js';
import { InquiryRateLimitGuard } from './inquiries/inquiry-rate-limit.guard.js';
import { PostgresRateLimiter } from '../security/persistent-rate-limiter.js';

@Module({
  controllers: [CustomerController, InquiryController, InquiryImportController, InquiryManagementController],
  providers: [
    InquiryRateLimitGuard,
    { provide: PostgresRateLimiter, useFactory: (db: DataSource) => new PostgresRateLimiter(db), inject: [getDataSourceToken()] },
    { provide: InquiryReminderWorker, useFactory: (service: InquiryManagementService) => new InquiryReminderWorker(service), inject: [InquiryManagementService] },
    { provide: InquiryImportService, useFactory: (service: InquiryManagementService) => new InquiryImportService(service), inject: [InquiryManagementService] },
    { provide: InquiryManagementService, useFactory: (db: DataSource) => new InquiryManagementService(db), inject: [getDataSourceToken()] },
    { provide: CustomerService, useFactory: (db: DataSource) => new CustomerService(db), inject: [getDataSourceToken()] },
    { provide: InquiryService, useFactory: (db: DataSource) => new InquiryService(db), inject: [getDataSourceToken()] },
  ],
  exports: [CustomerService, InquiryService],
})
export class CrmModule {}
