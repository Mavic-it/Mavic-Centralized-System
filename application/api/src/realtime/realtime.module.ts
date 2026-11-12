import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { FoundationModule } from '../foundation/foundation.module.js';
import { RealtimeService } from './realtime.service.js';
import { RealtimeController } from './realtime.controller.js';
import { RealtimeInterceptor } from './realtime.interceptor.js';

@Global()
@Module({
  imports: [FoundationModule],
  controllers: [RealtimeController],
  providers: [
    RealtimeService,
    { provide: APP_INTERCEPTOR, useClass: RealtimeInterceptor },
  ],
  exports: [RealtimeService],
})
export class RealtimeModule {}
