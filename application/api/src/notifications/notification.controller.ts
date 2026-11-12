import {
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../foundation/auth/auth.context.js';
import { Notification, NotificationService } from './notification.service.js';

@Controller('notifications')
export class NotificationController {
  constructor(private readonly service: NotificationService) {}

  create(input: Notification): Notification {
    return this.service.create(input);
  }

  get(id: string): Notification | undefined {
    return this.service.get(id);
  }

  @Get('inbox')
  inbox(
    @Req() request: AuthenticatedRequest,
    @Query('page') page = '1',
    @Query('filter') filter = 'all',
  ) {
    return this.service.inbox(request.user?.userId ?? '', Number(page), filter);
  }

  @Post('read-all')
  readAll(@Req() request: AuthenticatedRequest) {
    return this.service.readAll(request.user?.userId ?? '');
  }

  @Delete(':id')
  remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.remove(id, request.user?.userId ?? '');
  }

  @Get('unread')
  unread(@Req() request: AuthenticatedRequest): Promise<Notification[]> {
    return this.service.unread(request.user?.userId ?? '');
  }

  markRead(id: string): Notification | undefined {
    return this.service.markRead(id);
  }

  @Post(':id/read')
  dismiss(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.service.dismiss(id, request.user?.userId ?? '');
  }
}
