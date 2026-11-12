import { Module } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import { EmailModule } from '../email/email.module.js';
import { EmailService } from '../email/email.service.js';
import { WorkMailService } from './work-mail.service.js';
import { WorkController } from './work.controller.js';
import { WorkService } from './work.service.js';
import { TaskRecurrenceWorker } from './task-recurrence.worker.js';
@Module({
  imports: [EmailModule],
  controllers: [WorkController],
  providers: [
    {
      provide: WorkMailService,
      useFactory: (db: DataSource, email: EmailService) =>
        new WorkMailService(db, email),
      inject: [getDataSourceToken(), EmailService],
    },
    {
      provide: WorkService,
      useFactory: (db: DataSource) => new WorkService(db),
      inject: [getDataSourceToken()],
    },
    {
      provide: TaskRecurrenceWorker,
      useFactory: (work: WorkService) => new TaskRecurrenceWorker(work),
      inject: [WorkService],
    },
  ],
})
export class WorkModule {}
