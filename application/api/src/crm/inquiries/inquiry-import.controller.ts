import { UseGuards } from '@nestjs/common';
import { InquiryRateLimitGuard } from './inquiry-rate-limit.guard.js';
import {
  Body,
  Controller,
  ForbiddenException,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { AuthenticatedRequest } from '../../foundation/auth/auth.context.js';
import { InquiryImportService } from './inquiry-import.service.js';
import { parseImportOptions } from './inquiry-import-options.js';

@Controller('inquiries/import')
@UseGuards(InquiryRateLimitGuard)
export class InquiryImportController {
  constructor(private readonly service: InquiryImportService) {}
  @Post('preview')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 5 * 1024 * 1024,
        files: 1,
        fields: 5,
        fieldSize: 65536,
      },
    }),
  )
  preview(
    @Req() r: AuthenticatedRequest,
    @UploadedFile() f: { buffer: Buffer; originalname: string },
    @Body() body: Record<string, unknown>,
  ) {
    return this.run(r, f, body, false);
  }
  @Post('confirm')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 5 * 1024 * 1024,
        files: 1,
        fields: 5,
        fieldSize: 65536,
      },
    }),
  )
  confirm(
    @Req() r: AuthenticatedRequest,
    @UploadedFile() f: { buffer: Buffer; originalname: string },
    @Body() body: Record<string, unknown>,
  ) {
    return this.run(r, f, body, true);
  }
  private run(
    r: AuthenticatedRequest,
    f: { buffer: Buffer; originalname: string },
    body: Record<string, unknown>,
    confirm: boolean,
  ) {
    if (!r.user) throw new ForbiddenException('Authentication required.');
    if (
      !f ||
      !/\.(xlsx|csv)$/i.test(f.originalname) ||
      typeof body.branchId !== 'string' ||
      typeof body.assignedStaffId !== 'string' ||
      body.branchId.length > 100 ||
      body.assignedStaffId.length > 100
    )
      throw new BadRequestException(
        'Choose an XLSX/CSV file, handling branch and assignee.',
      );
    return this.service.run(
      r.user,
      f.buffer,
      body.branchId,
      body.assignedStaffId,
      confirm,
      typeof body.checksum === 'string' ? body.checksum : undefined,
      parseImportOptions(body.options),
    );
  }
}
