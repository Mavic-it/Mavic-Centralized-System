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
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../../foundation/auth/auth.context.js';
import {
  CreateReservationDto,
  ReservationPaymentDto,
  ReservationQueryDto,
  ReservationReasonDto,
  ReservationSettingsDto,
  ReservationSpaceDto,
  SpaceBlockDto,
} from './reservation.dto.js';
import { ReservationManagementService } from './reservation-management.service.js';

@Controller('reservations')
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class ReservationController {
  constructor(private readonly service: ReservationManagementService) {}
  private user(r: AuthenticatedRequest) {
    if (!r.user) throw new ForbiddenException('Authentication required.');
    return r.user;
  }
  @Get('branches') branches(@Req() r: AuthenticatedRequest) {
    return this.service.branches(this.user(r));
  }
  @Get('spaces') spaces(
    @Req() r: AuthenticatedRequest,
    @Query('branchId') branchId?: string,
  ) {
    return this.service.spaces(this.user(r), branchId);
  }
  @Post('spaces') saveSpace(
    @Req() r: AuthenticatedRequest,
    @Body() d: ReservationSpaceDto,
  ) {
    return this.service.saveSpace(this.user(r), d);
  }
  @Patch('spaces/:id') updateSpace(
    @Req() r: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() d: ReservationSpaceDto,
  ) {
    return this.service.saveSpace(this.user(r), d, id);
  }
  @Post('spaces/:id/blocks') block(
    @Req() r: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() d: SpaceBlockDto,
  ) {
    return this.service.block(this.user(r), id, d);
  }
  @Get('availability') availability(
    @Req() r: AuthenticatedRequest,
    @Query('roomId') id: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.service.availability(this.user(r), id, from, to);
  }
  @Get('summary') summary(
    @Req() r: AuthenticatedRequest,
    @Query('branchId') id?: string,
  ) {
    return this.service.summary(this.user(r), id);
  }
  @Get('reports') report(
    @Req() r: AuthenticatedRequest,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('branchId') id?: string,
  ) {
    return this.service.report(this.user(r), from, to, id);
  }
  @Get('customer-history') customerHistory(
    @Req() r: AuthenticatedRequest,
    @Query('email') email: string,
  ) {
    return this.service.customerHistory(this.user(r), email);
  }
  @Get('settings') settings(
    @Req() r: AuthenticatedRequest,
    @Query('branchId') id: string,
  ) {
    return this.service.settings(this.user(r), id);
  }
  @Patch('settings') saveSettings(
    @Req() r: AuthenticatedRequest,
    @Query('branchId') id: string,
    @Body() d: ReservationSettingsDto,
  ) {
    return this.service.saveSettings(this.user(r), id, d);
  }
  @Get('calendar') calendar(
    @Req() r: AuthenticatedRequest,
    @Query() q: ReservationQueryDto,
  ) {
    return this.service.list(this.user(r), q, true);
  }
  @Get() list(@Req() r: AuthenticatedRequest, @Query() q: ReservationQueryDto) {
    return this.service.list(this.user(r), q);
  }
  @Post() create(
    @Req() r: AuthenticatedRequest,
    @Body() d: CreateReservationDto,
  ) {
    return this.service.create(this.user(r), d);
  }
  @Get(':id') detail(@Req() r: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.detail(this.user(r), id);
  }
  @Patch(':id') update(@Req() r:AuthenticatedRequest,@Param('id') id:string,@Body() d:CreateReservationDto){
    return this.service.update(this.user(r),id,d);
  }
  @Post(':id/payments') payment(
    @Req() r: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() d: ReservationPaymentDto,
  ) {
    return this.service.payment(this.user(r), id, d);
  }
  @Post(':id/:action') transition(
    @Req() r: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('action') action: string,
    @Body() d: ReservationReasonDto,
  ) {
    return this.service.transition(this.user(r), id, action, d?.reason);
  }
}
