import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../../../foundation/auth/auth.context.js';
import { OfficialBusinessService } from './ob.service.js';
import { ObDecisionDto, ObFilingDto, ObFilterDto } from './ob.dto.js';
@Controller('attendance/official-business')
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class OfficialBusinessController {
  constructor(private readonly service: OfficialBusinessService) {}
  private user(r: AuthenticatedRequest) {
    if (!r.user) throw new ForbiddenException('Authentication required.');
    return r.user;
  }
  @Get('context') context(@Req() r: AuthenticatedRequest) {
    return this.service.context(this.user(r));
  }
  @Get('requests') list(
    @Req() r: AuthenticatedRequest,
    @Query() q: ObFilterDto,
  ) {
    return this.service.list(this.user(r), q);
  }
  @Post('preview') preview(
    @Req() r: AuthenticatedRequest,
    @Body() d: ObFilingDto,
  ) {
    return this.service.previewRange(this.user(r), d);
  }
  @Post('requests') submit(
    @Req() r: AuthenticatedRequest,
    @Body() d: ObFilingDto,
  ) {
    return this.service.submitRange(this.user(r), d);
  }
  @Get('requests/:id') detail(
    @Req() r: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.detail(this.user(r), id);
  }
  @Post('requests/:id/decision') decide(
    @Req() r: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: ObDecisionDto,
  ) {
    return this.service.decide(this.user(r), id, d);
  }
}
