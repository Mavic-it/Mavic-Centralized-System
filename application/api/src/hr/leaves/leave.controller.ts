import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../foundation/auth/auth.context.js';
import { LeaveService } from './leave.service.js';
import {
  RequestDto,
  PreviewDto,
  FilterDto,
  CommentDto,
  CancellationResponseDto,
  CancellationDecisionDto,
  AdjustmentDto,
  AllocateDto,
  TypeDto,
  AssignmentDto,
  ResetScheduleDto,
  ResetBalanceDto,
} from './leave.dto.js';
import { document } from './leave.policy.js';
import ExcelJS from 'exceljs';
@Controller('leave')
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class LeaveController {
  constructor(private readonly service: LeaveService) {}
  private user(req: AuthenticatedRequest) {
    if (!req.user) throw new ForbiddenException('Authentication required.');
    return req.user;
  }
  @Get('context') context(@Req() req: AuthenticatedRequest) {
    return this.service.context(this.user(req));
  }
  @Get('me/context') personalContext(@Req() req: AuthenticatedRequest) {
    return this.service.context(this.user(req));
  }
  @Get('me/filing-time') filingTime(@Req() req: AuthenticatedRequest) {
    return this.service.filingTime(this.user(req));
  }
  @Get('me/types') ownTypes(
    @Req() req: AuthenticatedRequest,
    @Query() f: FilterDto,
  ) {
    return this.service.types(this.user(req), true, f.from);
  }
  @Get('types') types(@Req() req: AuthenticatedRequest) {
    return this.service.types(this.user(req));
  }
  @Post('types') createType(
    @Req() req: AuthenticatedRequest,
    @Body() input: TypeDto,
  ) {
    return this.service.saveType(this.user(req), input);
  }
  @Patch('types/:id') saveType(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: TypeDto,
  ) {
    return this.service.saveType(this.user(req), input, id);
  }
  @Post('assignments') assignment(
    @Req() req: AuthenticatedRequest,
    @Body() input: AssignmentDto,
  ) {
    return this.service.assign(this.user(req), input);
  }
  @Post('allocate') allocate(
    @Req() req: AuthenticatedRequest,
    @Body() input: AllocateDto,
  ) {
    return this.service.allocate(this.user(req), input);
  }
  @Post('me/preview') preview(
    @Req() req: AuthenticatedRequest,
    @Body() input: PreviewDto,
  ) {
    return this.service.preview(this.user(req), input);
  }
  @Get('me/balances') ownBalances(
    @Req() req: AuthenticatedRequest,
    @Query() f: FilterDto,
  ) {
    return this.service.balances(this.user(req), f, true);
  }
  @Get('me/overview') personalOverview(
    @Req() req: AuthenticatedRequest,
    @Query() f: FilterDto,
  ) {
    return this.service.personalOverview(this.user(req), f);
  }
  @Get('me/requests') ownRequests(
    @Req() req: AuthenticatedRequest,
    @Query() f: FilterDto,
  ) {
    return this.service.requests(this.user(req), f, true);
  }
  @Post('me/requests')
  @UseInterceptors(
    FileInterceptor('document', { limits: { fileSize: 5242880, files: 1 } }),
  )
  submit(
    @Req() req: AuthenticatedRequest,
    @Body() input: RequestDto,
    @UploadedFile()
    file?: {
      originalname: string;
      mimetype: string;
      buffer: Buffer;
      size: number;
    },
  ) {
    return this.service.submit(this.user(req), input, document(file));
  }
  @Get('requests') requests(
    @Req() req: AuthenticatedRequest,
    @Query() f: FilterDto,
  ) {
    return this.service.requests(this.user(req), f);
  }
  @Get('requests/:id') detail(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.detail(this.user(req), id);
  }
  @Post('requests/:id/approve') approve(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: CommentDto,
  ) {
    return this.service.decide(
      this.user(req),
      id,
      'APPROVED',
      input.comment ?? '',
    );
  }
  @Post('requests/:id/reject') reject(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: CommentDto,
  ) {
    return this.service.decide(
      this.user(req),
      id,
      'REJECTED',
      input.comment ?? '',
    );
  }
  @Post('me/requests/:id/cancel') cancel(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: CommentDto,
  ) {
    return this.service.cancel(this.user(req), id, input.comment ?? '');
  }
  @Post('requests/:id/cancellation-proposal') proposeCancellation(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: CommentDto,
  ) {
    return this.service.proposeCancellation(
      this.user(req),
      id,
      input.comment ?? '',
    );
  }
  @Post('me/requests/:id/cancellation-response') respondCancellation(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: CancellationResponseDto,
  ) {
    return this.service.respondCancellation(this.user(req), id, input);
  }
  @Post('requests/:id/cancellation-decision') decideCancellation(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: CancellationDecisionDto,
  ) {
    return this.service.decideCancellation(
      this.user(req),
      id,
      input.action,
      input.comment,
    );
  }
  @Get('requests/:id/document') async download(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.service.detail(this.user(req), id);
    const [f] = await this.service.db.query<
      Array<{ file_name: string; mime_type: string; data: Buffer }>
    >('SELECT * FROM leave_request_documents WHERE request_id=$1', [id]);
    if (!f) throw new BadRequestException('No document is attached.');
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; sandbox",
    );
    return new StreamableFile(f.data, {
      type: f.mime_type,
      disposition: `attachment; filename="leave-document"; filename*=UTF-8''${encodeURIComponent(f.file_name).replace(/['()*]/g, (c) => '%' + c.charCodeAt(0).toString(16))}`,
    });
  }
  @Get('balances') balances(
    @Req() req: AuthenticatedRequest,
    @Query() f: FilterDto,
  ) {
    return this.service.balances(this.user(req), f);
  }
  @Get('balances/:employeeId/reset') resetSettings(
    @Req() req: AuthenticatedRequest,
    @Param('employeeId') id: string,
    @Query() f: FilterDto,
  ) {
    if (!f.typeId) throw new BadRequestException('Type is required.');
    return this.service.resetSettings(this.user(req), id, f.typeId);
  }
  @Post('balances/:employeeId/reset-schedule') resetSchedule(
    @Req() req: AuthenticatedRequest,
    @Param('employeeId') id: string,
    @Body() input: ResetScheduleDto,
  ) {
    return this.service.saveResetSchedule(this.user(req), id, input);
  }
  @Post('balances/:employeeId/reset') resetBalance(
    @Req() req: AuthenticatedRequest,
    @Param('employeeId') id: string,
    @Body() input: ResetBalanceDto,
  ) {
    return this.service.resetBalance(this.user(req), id, input);
  }
  @Get('balances/:employeeId/transactions') ledger(
    @Req() req: AuthenticatedRequest,
    @Param('employeeId') id: string,
    @Query() f: FilterDto,
  ) {
    if (!f.typeId || !f.year)
      throw new BadRequestException('Type and year are required.');
    return this.service.ledger(this.user(req), id, f.typeId, f.year);
  }
  @Post('balances/:employeeId/adjustments') adjust(
    @Req() req: AuthenticatedRequest,
    @Param('employeeId') id: string,
    @Body() input: AdjustmentDto,
  ) {
    return this.service.adjust(this.user(req), id, input);
  }
  @Get('reports/overview') report(
    @Req() req: AuthenticatedRequest,
    @Query() f: FilterDto,
  ) {
    return this.service.report(this.user(req), f);
  }
  @Get('reports/export') async export(
    @Req() req: AuthenticatedRequest,
    @Query() f: FilterDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const r = await this.service.report(this.user(req), f);
    const safe = (v: string | number) => {
      if (typeof v !== 'string') return v;
      const first = Array.from(v).find(
        (c) => c.charCodeAt(0) > 32 && !/\s/.test(c),
      );
      return first && '=+-@'.includes(first) ? `'${v}` : v;
    };
    const credits = [
      [
        'Employee',
        'Branch',
        'Type',
        'Allocated',
        'Adjustments',
        'Used',
        'Restored',
        'Reserved',
        'Available',
        'Year',
      ],
      ...r.balances.map((b) => [
        b.employeeName,
        b.branchName,
        b.typeName,
        b.allocated,
        b.adjustments,
        b.used,
        b.restored,
        b.reserved,
        b.available,
        b.year,
      ]),
    ];
    const requests = [
      ['Employee', 'Branch', 'Type', 'From', 'To', 'Days', 'Status'],
      ...r.requests.map((q) => [
        q.employeeName,
        q.branchName,
        q.typeName,
        q.startDate,
        q.endDate,
        q.days,
        q.status,
      ]),
    ];
    const basis = [
      ['Reporting basis', r.basis],
      ['Request period', `${r.from} to ${r.to}`],
      ['As of', r.asOf],
    ];
    const types = [
      [
        'Leave type',
        'Code',
        'Policy',
        'Active',
        'Effective from',
        'Used credits',
        'Available credits',
        'Reserved credits',
        'Approved unpaid days',
        'Pending unpaid days',
      ],
      ...(r.typeBreakdown ?? []).map((t) => [
        t.typeName,
        t.code,
        t.paid ? 'Paid' : 'Unpaid',
        t.active ? 'Yes' : 'No',
        t.effectiveFrom,
        t.paid || t.used || t.available || t.reserved ? t.used : 'N/A',
        t.paid || t.used || t.available || t.reserved ? t.available : 'N/A',
        t.paid || t.used || t.available || t.reserved ? t.reserved : 'N/A',
        t.approvedUnpaidDays,
        t.pendingUnpaidDays,
      ]),
    ];
    let buffer: Buffer;
    if (f.format === 'xlsx') {
      const wb = new ExcelJS.Workbook();
      for (const [name, rows] of [
        ['Credits', credits],
        ['Requests', requests],
        ['Leave types', types],
        ['Basis', basis],
      ] as const) {
        const sheet = wb.addWorksheet(name);
        rows.forEach((row) => sheet.addRow(row.map(safe)));
        sheet.getRow(1).font = { bold: true };
        sheet.columns.forEach((column) => (column.width = 22));
      }
      buffer = Buffer.from(await wb.xlsx.writeBuffer());
      response.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
    } else {
      const csv = (rows: Array<Array<string | number>>) =>
        rows
          .map((row) =>
            row
              .map(
                (v) => '"' + String(safe(v) ?? '').replaceAll('"', '""') + '"',
              )
              .join(','),
          )
          .join('\r\n');
      buffer = Buffer.from(
        '\ufeff' +
          csv(credits) +
          '\r\n\r\n' +
          csv(requests) +
          '\r\n\r\n' +
          csv(types) +
          '\r\n\r\n' +
          csv(basis),
      );
      response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    }
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="leave-report.${f.format === 'xlsx' ? 'xlsx' : 'csv'}"`,
    );
    response.setHeader('Cache-Control', 'private, no-store');
    return new StreamableFile(buffer);
  }
}
