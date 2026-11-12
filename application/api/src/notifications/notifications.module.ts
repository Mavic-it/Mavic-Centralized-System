import { Module } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import { NotificationController } from './notification.controller.js';
import { NotificationService } from './notification.service.js';

@Module({
  controllers: [NotificationController],
  providers: [
    {
      provide: NotificationService,
      useFactory: (dataSource: DataSource) =>
        new NotificationService(dataSource),
      inject: [getDataSourceToken()],
    },
  ],
  exports: [NotificationService],
})
export class NotificationsModule {}
