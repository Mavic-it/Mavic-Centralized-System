import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { AuditService } from './audit.service.js';
import type { AuditLog } from './audit.service.js';

@Controller('audit')
export class AuditController {
  constructor(private readonly service: AuditService) {}

  @Post()
  record(@Body() input: AuditLog): Promise<AuditLog> {
    return this.service.record(input);
  }

  @Get()
  list(@Query('branchId') branchId?: string): Promise<AuditLog[]> {
    return this.service.list(branchId);
  }
}
