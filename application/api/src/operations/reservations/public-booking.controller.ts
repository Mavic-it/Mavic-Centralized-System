import { Body, Controller, Get, Header, Post, Query, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { Public } from '../../foundation/auth/auth.decorators.js';
import { PublicBookingService } from './public-booking.service.js';
import { PublicBookingGuard } from './public-booking.guard.js';
import { PublicAvailabilityQuery, PublicBookingDto, PublicSpaceQuery, PublicCancellationDto, PublicQuoteDto } from './public-booking.dto.js';

@Public()
@Controller('public/booking')
@UseGuards(PublicBookingGuard)
@UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
export class PublicBookingController {
  constructor(private readonly service: PublicBookingService) {}
  @Post('quote') @Header('Cache-Control','no-store') quote(@Body() body: PublicQuoteDto) { return this.service.quote(body); }
  @Post('cancellation-requests') @Header('Cache-Control','no-store') requestCancellation(@Body() body: PublicCancellationDto) { return this.service.requestCancellation(body); }
  @Get('branches') @Header('Cache-Control','no-store') branches() { return this.service.branches(); }
  @Get('spaces') @Header('Cache-Control','no-store') spaces(@Query() query: PublicSpaceQuery) { return this.service.spaces(query); }
  @Get('availability') @Header('Cache-Control','no-store') availability(@Query() query: PublicAvailabilityQuery) { return this.service.availability(query); }
  @Post('reservations') @Header('Cache-Control','no-store') create(@Body() body: PublicBookingDto) { return this.service.create(body); }
}
