import {
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import type { WorkService } from './work.service.js';

export class TaskRecurrenceWorker implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private busy = false;
  private readonly logger = new Logger(TaskRecurrenceWorker.name);

  constructor(private readonly work: Pick<WorkService, 'processRecurringTasks'>) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.run(), 30_000);
    this.timer.unref();
    void this.run();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async run() {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.work.processRecurringTasks();
    } catch {
      this.logger.warn('Recurring task generation failed; private task details suppressed.');
    } finally {
      this.busy = false;
    }
  }
}
