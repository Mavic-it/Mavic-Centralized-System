import {
  InquiryBranchQueryDto,
  InquiryCustomerQueryDto,
} from './inquiry.dto.js';
import { UseGuards } from '@nestjs/common';
import { InquiryRateLimitGuard } from './inquiry-rate-limit.guard.js';
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../foundation/auth/auth.context.js';
import {
  InquiryActionDto,
  InquiryActivityDto,
  InquiryBulkDto,
  InquiryConversionDto,
  InquiryLookupDto,
  InquiryQueryDto,
  InquiryTaskDto,
  InquiryTaskResultDto,
  SaveInquiryDto,
} from './inquiry.dto.js';
import { InquiryManagementService } from './inquiry-management.service.js';
import {
  InquiryReminderPolicyDto,
  InquiryRescheduleDto,
} from './inquiry.dto.js';

@Controller('inquiries')
@UseGuards(InquiryRateLimitGuard)
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class InquiryManagementController {
  constructor(private readonly service: InquiryManagementService) {}
  private user(r: AuthenticatedRequest) {
    if (!r.user) throw new ForbiddenException('Authentication required.');
    return r.user;
  }
  @Get() list(@Req() r: AuthenticatedRequest, @Query() q: InquiryQueryDto) {
    return this.service.list(this.user(r), q);
  }
  @Get('metadata') metadata(@Req() r: AuthenticatedRequest) {
    return this.service.metadata(this.user(r));
  }
  @Get('customers') customers(
    @Req() r: AuthenticatedRequest,
    @Query() q: InquiryCustomerQueryDto,
  ) {
    return this.service.customers(this.user(r), q.branchId, q.search);
  }
  @Get('dashboard') dashboard(
    @Req() r: AuthenticatedRequest,
    @Query() q: InquiryQueryDto,
  ) {
    return this.service.analytics(this.user(r), q);
  }
  @Get('reports') reports(
    @Req() r: AuthenticatedRequest,
    @Query() q: InquiryQueryDto,
  ) {
    return this.service.analytics(this.user(r), q, 'reports');
  }
  @Get('followups') followups(
    @Req() r: AuthenticatedRequest,
    @Query() q: InquiryQueryDto,
  ) {
    return this.service.tasks(this.user(r), q);
  }
  @Get('export') async export(
    @Req() r: AuthenticatedRequest,
    @Query() q: InquiryQueryDto,
    @Res() res: Response,
  ) {
    const format = q.format ?? 'csv';
    res.setHeader(
      'Content-Type',
      format === 'xlsx'
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : format === 'pdf'
          ? 'application/pdf'
          : 'text/csv; charset=utf-8',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="inquiries.${format}"`,
    );
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(await this.service.export(this.user(r), q));
  }
  @Post() create(@Req() r: AuthenticatedRequest, @Body() d: SaveInquiryDto) {
    return this.service.save(this.user(r), d);
  }
  @Post('bulk') bulk(
    @Req() r: AuthenticatedRequest,
    @Body() d: InquiryBulkDto,
  ) {
    return this.service.bulk(this.user(r), d);
  }
  @Get('settings/reminders') reminderPolicy(
    @Req() r: AuthenticatedRequest,
    @Query() q: InquiryBranchQueryDto,
  ) {
    return this.service.reminderPolicy(this.user(r), q.branchId);
  }
  @Patch('settings/reminders') saveReminderPolicy(
    @Req() r: AuthenticatedRequest,
    @Query() q: InquiryBranchQueryDto,
    @Body() d: InquiryReminderPolicyDto,
  ) {
    return this.service.reminderPolicy(this.user(r), q.branchId, d);
  }
  @Post('settings') lookup(
    @Req() r: AuthenticatedRequest,
    @Body() d: InquiryLookupDto,
  ) {
    return this.service.lookup(this.user(r), d);
  }
  @Patch('settings/:id') updateLookup(
    @Req() r: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() d: InquiryLookupDto,
  ) {
    return this.service.lookup(this.user(r), d, id);
  }
  @Get(':id') detail(@Req() r: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.detail(this.user(r), id);
  }
  @Patch(':id') update(
    @Req() r: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() d: SaveInquiryDto,
  ) {
    return this.service.save(this.user(r), d, id);
  }
  @Post(':id/action') action(
    @Req() r: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() d: InquiryActionDto,
  ) {
    return this.service.action(this.user(r), id, d);
  }
  @Post(':id/convert-service') convert(
    @Req() r: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() d: InquiryConversionDto,
  ) {
    return this.service.convertService(this.user(r), id, d);
  }
  @Post(':id/activities') activity(
    @Req() r: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() d: InquiryActivityDto,
  ) {
    return this.service.activity(this.user(r), id, d);
  }
  @Post(':id/tasks') schedule(
    @Req() r: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() d: InquiryTaskDto,
  ) {
    return this.service.schedule(this.user(r), id, d);
  }
  @Post(':id/tasks/:taskId') complete(
    @Req() r: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('taskId') taskId: string,
    @Body() d: InquiryTaskResultDto,
  ) {
    return this.service.complete(this.user(r), id, taskId, d);
  }
  @Post(':id/tasks/:taskId/reschedule') reschedule(
    @Req() r: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('taskId') taskId: string,
    @Body() d: InquiryRescheduleDto,
  ) {
    return this.service.reschedule(this.user(r), id, taskId, d);
  }
}
