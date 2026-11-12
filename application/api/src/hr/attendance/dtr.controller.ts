import {
  BadRequestException,
  UnauthorizedException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../foundation/auth/auth.context.js';
import { DtrService } from './dtr.service.js';
import {
  DtrCommitDto,
  DtrImportSelectionDto,
  DtrCorrectionDto,
  DtrExportDto,
  DtrPeriodDto,
  DtrQueryDto,
  DtrSaveTemplateDto,
  DtrSettingsDto,
  DtrUploadDto,
} from './dtr.dto.js';
import { RealtimeReadOnly } from '../../realtime/realtime.interceptor.js';
const validation = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

@Controller('attendance/dtr')
export class DtrController {
  constructor(private readonly service: DtrService) {}
  private user(request: AuthenticatedRequest) {
    if (!request.user)
      throw new UnauthorizedException('Authentication required.');
    return request.user;
  }
  @Get('configuration') configuration(
    @Req() req: AuthenticatedRequest,
    @Query('branchId') branchId: string,
  ) {
    return this.service.configuration(this.user(req), branchId);
  }
  @Post('templates') templates(
    @Req() req: AuthenticatedRequest,
    @Body(validation) input: DtrSaveTemplateDto,
  ) {
    return this.service.saveTemplate(this.user(req), input);
  }
  @Put('settings') settings(
    @Req() req: AuthenticatedRequest,
    @Body(validation) input: DtrSettingsDto,
  ) {
    return this.service.saveSettings(this.user(req), input);
  }
  @Post('preview')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 8 * 1024 * 1024,
        files: 1,
        fields: 5,
        fieldSize: 1000,
      },
    }),
  )
  preview(
    @Req() req: AuthenticatedRequest,
    @Body(validation) input: DtrUploadDto,
    @UploadedFile() file?: { buffer: Buffer; originalname: string },
  ) {
    if (!file) throw new BadRequestException('Choose a source workbook.');
    return this.service.preview(
      this.user(req),
      input.branchId,
      file,
      input.templateId,
      input.date,
      { from: input.from, to: input.to },
    );
  }
  @Get('history') history(
    @Req() req: AuthenticatedRequest,
    @Query('branchId') branchId: string,
  ) {
    return this.service.history(this.user(req), branchId);
  }
  @Get('batches/:id') batch(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Query('branchId') branchId: string,
  ) {
    return this.service.batch(this.user(req), branchId, id);
  }
  @Post('batches/:id/commit') commit(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body(validation) input: DtrCommitDto,
  ) {
    return this.service.commit(this.user(req), id, input);
  }
  @Post('batches/:id/calculate')
  @RealtimeReadOnly()
  calculate(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body(validation) input: DtrImportSelectionDto,
  ) {
    return this.service.calculateImport(this.user(req), id, input);
  }
  @Get('ledger') ledger(
    @Req() req: AuthenticatedRequest,
    @Query(validation) input: DtrQueryDto,
  ) {
    return this.service.ledger(this.user(req), input);
  }
  @Get('records/:id') detail(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Query('branchId') branchId: string,
  ) {
    return this.service.detail(this.user(req), branchId, id);
  }
  @Patch('records/:id') correct(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body(validation) input: DtrCorrectionDto,
  ) {
    return this.service.correct(this.user(req), id, input);
  }
  @Post('period') period(
    @Req() req: AuthenticatedRequest,
    @Body(validation) input: DtrPeriodDto,
  ) {
    return this.service.period(this.user(req), input);
  }
  @Post('export') async export(
    @Req() req: AuthenticatedRequest,
    @Body(validation) input: DtrExportDto,
    @Res() response: Response,
  ) {
    const result = await this.service.export(this.user(req), input);
    response.setHeader(
      'Content-Type',
      input.format === 'xlsx'
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : 'text/csv; charset=utf-8',
    );
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.filename}"`,
    );
    response.setHeader('Cache-Control', 'no-store');
    response.send(result.bytes);
  }
}
