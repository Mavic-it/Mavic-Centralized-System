import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { CrmModule } from './crm/crm.module.js';
import { DatabaseModule } from './database/database.module.js';
import { FoundationModule } from './foundation/foundation.module.js';
import { HrModule } from './hr/hr.module.js';
import { InventoryModule } from './inventory/inventory.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { OperationsModule } from './operations/operations.module.js';
import { ReportingModule } from './reporting/reporting.module.js';
import { SecurityModule } from './security/security.module.js';
import { SystemModule } from './system/system.module.js';
import { RealtimeModule } from './realtime/realtime.module.js';
import { WorkModule } from './work/work.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true }),
    DatabaseModule,
    FoundationModule,
    HrModule,
    OperationsModule,
    CrmModule,
    InventoryModule,
    NotificationsModule,
    ReportingModule,
    SystemModule,
    RealtimeModule,
    SecurityModule,
    WorkModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
