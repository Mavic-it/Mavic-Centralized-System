import { PublicBookingController } from './reservations/public-booking.controller.js';
import { ManualPaymentController, PublicPaymentController } from './reservations/manual-payment.controller.js';
import { ManualPaymentService } from './reservations/manual-payment.service.js';
import { ManualPaymentWorker } from './reservations/manual-payment.worker.js';
import { PublicBookingService } from './reservations/public-booking.service.js';
import { PublicBookingGuard } from './reservations/public-booking.guard.js';
import { PostgresRateLimiter } from '../security/persistent-rate-limiter.js';
import { ClientBookingMailService } from './reservations/client-booking-mail.service.js';
import { Module } from '@nestjs/common';
import { ReservationController } from './reservations/reservation.controller.js';
import { ReservationManagementService } from './reservations/reservation-management.service.js';
import { ReservationMailService } from './reservations/reservation-mail.service.js';
import { getDataSourceToken } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import { EmailModule } from '../email/email.module.js';
import { EmailService } from '../email/email.service.js';

@Module({
  imports: [EmailModule],
  controllers: [ManualPaymentController, PublicPaymentController, ReservationController, PublicBookingController],
  providers: [
    { provide: ManualPaymentService,useFactory:(db: DataSource,r: ReservationManagementService)=>new ManualPaymentService(db,r),inject:[getDataSourceToken(),ReservationManagementService] },
    { provide: ManualPaymentWorker,useFactory:(db: DataSource,p: ManualPaymentService,r: ReservationManagementService,e: EmailService)=>new ManualPaymentWorker(db,p,r,e),inject:[getDataSourceToken(),ManualPaymentService,ReservationManagementService,EmailService] },
    { provide: ClientBookingMailService, useFactory: (db: DataSource, email: EmailService) => new ClientBookingMailService(db,email), inject: [getDataSourceToken(),EmailService] },
    { provide: PostgresRateLimiter, useFactory: (db: DataSource) => new PostgresRateLimiter(db), inject: [getDataSourceToken()] },
    PublicBookingGuard,
    { provide: PublicBookingService, useFactory: (db: DataSource, service: ReservationManagementService) => new PublicBookingService(db, service), inject: [getDataSourceToken(), ReservationManagementService] },
    {
      provide: ReservationManagementService,
      useFactory: (db: DataSource) => new ReservationManagementService(db),
      inject: [getDataSourceToken()],
    },
    {
      provide: ReservationMailService,
      useFactory: (db: DataSource, email: EmailService) => new ReservationMailService(db, email),
      inject: [getDataSourceToken(), EmailService],
    },
  ],
  exports: [ReservationManagementService],
})
export class OperationsModule {}
