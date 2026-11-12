import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
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
import type { AuthenticatedRequest } from '../foundation/auth/auth.context.js';
import { WorkService, type WorkUpload } from './work.service.js';
import {
  CreateIncidentDto,
  CreateTaskDto,
  WorkActionDto,
  RecordOffenseDto,
  CreateTaskTemplateDto,
  TaskExportQueryDto,
  TaskTemplateQueryDto,
  StopTaskSeriesDto,
  WorkFilterDto,
  IncidentAuthorityDto,
  IncidentExportQueryDto,
} from './work.dto.js';
import type { WorkKind } from './work.policy.js';

@Controller('work/:kind')
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class WorkController {
  constructor(private readonly service: WorkService) {}
  private user(req: AuthenticatedRequest) {
    if (!req.user) throw new ForbiddenException('Authentication required.');
    return req.user;
  }
  private kind(value: string): WorkKind {
    if (value !== 'tasks' && value !== 'incidents')
      throw new ForbiddenException('Unknown module.');
    return value;
  }
  @Get('context')
  @Header('Cache-Control', 'private, no-store')
  context(@Req() r: AuthenticatedRequest, @Param('kind') k: string) {
    return this.service.context(this.user(r), this.kind(k));
  }
  @Get()
  @Header('Cache-Control', 'private, no-store')
  list(
    @Req() r: AuthenticatedRequest,
    @Param('kind') k: string,
    @Query() f: WorkFilterDto,
  ) {
    return this.service.list(this.user(r), this.kind(k), f);
  }
  @Get('templates')
  @Header('Cache-Control', 'private, no-store')
  templates(
    @Req() r: AuthenticatedRequest,
    @Param('kind') k: string,
    @Query() q: TaskTemplateQueryDto,
  ) {
    if (this.kind(k) !== 'tasks') throw new ForbiddenException();
    return this.service.taskTemplates(this.user(r), q);
  }
  @Post('templates')
  @Header('Cache-Control', 'private, no-store')
  createTemplate(
    @Req() r: AuthenticatedRequest,
    @Param('kind') k: string,
    @Body() d: CreateTaskTemplateDto,
  ) {
    if (this.kind(k) !== 'tasks') throw new ForbiddenException();
    return this.service.createTaskTemplate(this.user(r), d);
  }
  @Get('export')
  async exportTasks(
    @Req() r: AuthenticatedRequest,
    @Param('kind') k: string,
    @Query() q: TaskExportQueryDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (this.kind(k) !== 'tasks') throw new ForbiddenException();
    const file = await this.service.exportTasks(this.user(r), q);
    response.setHeader('Content-Type', file.mime);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.filename}"`,
    );
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(file.content);
  }
  @Get('report-export')
  async exportIncidents(
    @Req() r: AuthenticatedRequest,
    @Param('kind') k: string,
    @Query() q: IncidentExportQueryDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (this.kind(k) !== 'incidents') throw new ForbiddenException();
    const format = q.format ?? 'xlsx';
    const content = await this.service.exportIncidents(this.user(r), Object.assign({},q,{format}));
    response.setHeader('Content-Type', format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="incidents-${format === 'xlsx' ? 'export.xlsx' : 'report.pdf'}"`,
    );
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(content);
  }
  @Get('authority')
  authority(@Req() r: AuthenticatedRequest, @Param('kind') k: string) {
    if (this.kind(k) !== 'incidents') throw new ForbiddenException();
    return this.service.incidentAuthority().list(this.user(r));
  }
  @Post('authority')
  updateAuthority(
    @Req() r: AuthenticatedRequest,
    @Param('kind') k: string,
    @Body() dto: IncidentAuthorityDto,
  ) {
    if (this.kind(k) !== 'incidents') throw new ForbiddenException();
    return this.service.incidentAuthority().update(this.user(r), dto);
  }
  // Separate typed create routes keep validation strict for each contract.
  @Post('task')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 5 * 1024 * 1024,
        files: 1,
        fields: 12,
        fieldSize: 32768,
      },
    }),
  )
  task(
    @Req() r: AuthenticatedRequest,
    @Param('kind') k: string,
    @Body() d: CreateTaskDto,
    @UploadedFile() file: WorkUpload | undefined,
  ) {
    if (this.kind(k) !== 'tasks') throw new ForbiddenException();
    return this.service.create(this.user(r), 'tasks', d, file);
  }
  @Post('report')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 5 * 1024 * 1024,
        files: 1,
        fields: 12,
        fieldSize: 32768,
      },
    }),
  )
  incident(
    @Req() r: AuthenticatedRequest,
    @Param('kind') k: string,
    @Body() d: CreateIncidentDto,
    @UploadedFile() file: WorkUpload | undefined,
  ) {
    if (this.kind(k) !== 'incidents') throw new ForbiddenException();
    return this.service.create(this.user(r), 'incidents', d, file);
  }
  @Post(':id/offense')
  offense(
    @Req() r: AuthenticatedRequest,
    @Param('kind') k: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: RecordOffenseDto,
  ) {
    if (this.kind(k) !== 'incidents') throw new ForbiddenException();
    return this.service.recordOffense(this.user(r), id, d);
  }
  @Get(':id')
  @Header('Cache-Control', 'private, no-store')
  detail(
    @Req() r: AuthenticatedRequest,
    @Param('kind') k: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.detail(this.user(r), this.kind(k), id);
  }
  @Delete(':id')
  @Header('Cache-Control', 'private, no-store')
  remove(
    @Req() r: AuthenticatedRequest,
    @Param('kind') k: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    if (this.kind(k) !== 'tasks') throw new ForbiddenException();
    return this.service.deleteTask(this.user(r), id);
  }
  @Post(':id/stop-series')
  @Header('Cache-Control', 'private, no-store')
  stopSeries(
    @Req() r: AuthenticatedRequest,
    @Param('kind') k: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: StopTaskSeriesDto,
  ) {
    if (this.kind(k) !== 'tasks') throw new ForbiddenException();
    return this.service.stopRecurringTask(this.user(r), id, d.version);
  }
  @Post(':id/actions')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 5 * 1024 * 1024,
        files: 1,
        fields: 12,
        fieldSize: 32768,
      },
    }),
  )
  act(
    @Req() r: AuthenticatedRequest,
    @Param('kind') k: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: WorkActionDto,
    @UploadedFile() file: WorkUpload | undefined,
  ) {
    return this.service.act(this.user(r), this.kind(k), id, d, file);
  }
  @Post(':id/attachments')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 1 },
    }),
  )
  upload(
    @Req() r: AuthenticatedRequest,
    @Param('kind') k: string,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: { buffer: Buffer; originalname: string } | undefined,
    @Body('audience') audience: string,
  ) {
    return this.service.upload(this.user(r), this.kind(k), id, file, audience);
  }
  @Get(':id/attachments/:attachmentId')
  async download(
    @Req() r: AuthenticatedRequest,
    @Param('kind') k: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('attachmentId', ParseUUIDPipe) aid: string,
    @Query('view') view: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = await this.service.download(
      this.user(r),
      this.kind(k),
      id,
      aid,
    );
    res.setHeader('Content-Type', file.mime);
    const filename = file.filename.replace(/["\\\r\n]/g, '_');
    const inline =
      view === '1' &&
      ['application/pdf', 'image/png', 'image/jpeg'].includes(file.mime);
    res.setHeader(
      'Content-Disposition',
      `${inline ? 'inline' : 'attachment'}; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
    );
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    return new StreamableFile(file.content);
  }
}
