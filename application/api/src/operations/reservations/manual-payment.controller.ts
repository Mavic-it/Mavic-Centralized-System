import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  StreamableFile,
  UseGuards,
  UseFilters,
  UsePipes,
  ValidationPipe,
  ForbiddenException,
} from '@nestjs/common';
import { Public } from '../../foundation/auth/auth.decorators.js';
import type { AuthenticatedRequest } from '../../foundation/auth/auth.context.js';
import { PublicBookingGuard } from './public-booking.guard.js';
import { ManualPaymentService } from './manual-payment.service.js';
import { PaymentPersistenceFilter } from './manual-payment.filter.js';
import {
  PaymentAccountDto,
  PaymentDecisionDto,
  PaymentPolicyDto,
  PaymentProofDto,
  PaymentQueueDto,
} from './manual-payment.dto.js';

@Controller('reservations')
@UseFilters(PaymentPersistenceFilter)
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class ManualPaymentController {
  constructor(private readonly service: ManualPaymentService) {}
  private user(r: AuthenticatedRequest) {
    if (!r.user) throw new ForbiddenException('Authentication required.');
    return r.user;
  }
  @Get('payment-accounts') accounts(
    @Req() r: AuthenticatedRequest,
    @Query() q: PaymentQueueDto,
  ) {
    return this.service.accounts(this.user(r), q.branchId);
  }
  @Get('payment-accounts/access') accountAccess(
    @Req() r: AuthenticatedRequest,
  ) {
    return this.service.capabilities(this.user(r), true);
  }
  @Get('payment-accounts/branches') accountBranches(
    @Req() r: AuthenticatedRequest,
  ) {
    return this.service.settingsBranches(this.user(r));
  }
  @Post('payment-accounts') create(
    @Req() r: AuthenticatedRequest,
    @Body() d: PaymentAccountDto,
  ) {
    return this.service.saveAccount(this.user(r), d);
  }
  @Patch('payment-accounts/:id') update(
    @Req() r: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() d: PaymentAccountDto,
  ) {
    return this.service.saveAccount(this.user(r), d, id);
  }
  @Get('payment-policy') policy(
    @Req() r: AuthenticatedRequest,
    @Query() q: PaymentQueueDto,
  ) {
    return this.service.policy(this.user(r), q.branchId ?? '');
  }
  @Patch('payment-policy') savePolicy(
    @Req() r: AuthenticatedRequest,
    @Query() q: PaymentQueueDto,
    @Body() d: PaymentPolicyDto,
  ) {
    return this.service.savePolicy(this.user(r), q.branchId ?? '', d);
  }
  @Get('payment-verifications') queue(
    @Req() r: AuthenticatedRequest,
    @Query() q: PaymentQueueDto,
  ) {
    return this.service.queue(this.user(r), q);
  }
  @Get('payment-verifications/access') verifyAccess(
    @Req() r: AuthenticatedRequest,
  ) {
    return this.service.capabilities(this.user(r), false);
  }
  @Get('payment-verifications/:id') detail(
    @Req() r: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.detail(this.user(r), id);
  }
  @Get('payment-verifications/:id/proof')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Content-Security-Policy', "sandbox; default-src 'none'")
  async proof(
    @Req() r: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    const proof = await this.service.proof(this.user(r), id);
    return new StreamableFile(proof.proof_data, {
      type: proof.proof_mime,
      disposition: 'inline; filename="payment-proof"',
    });
  }
  @Post('payment-verifications/:id/:action') decide(
    @Req() r: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('action') action: string,
    @Body() d: PaymentDecisionDto,
  ) {
    return this.service.decide(this.user(r), id, action, d);
  }
}

@Public()
@Controller('public/booking')
@UseFilters(PaymentPersistenceFilter)
@UseGuards(PublicBookingGuard)
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class PublicPaymentController {
  constructor(private readonly service: ManualPaymentService) {}
  @Get('payment-methods') @Header('Cache-Control', 'no-store') methods(
    @Query() q: PaymentQueueDto,
  ) {
    return this.service.publicAccounts(q.branchId ?? '');
  }
  @Get('reservations/:reference/payment')
  @Header('Cache-Control', 'no-store')
  payment(
    @Param('reference') reference: string,
    @Headers('x-booking-token') token = '',
  ) {
    return this.service.payment(reference, token);
  }
  @Get('reservations/:reference/payment-status')
  @Header('Cache-Control', 'no-store')
  status(
    @Param('reference') reference: string,
    @Headers('x-booking-token') token = '',
  ) {
    return this.service.payment(reference, token);
  }
  @Post('reservations/:reference/payment-proof')
  @Header('Cache-Control', 'no-store')
  submit(
    @Param('reference') reference: string,
    @Headers('x-booking-token') token = '',
    @Body() d: PaymentProofDto,
  ) {
    return this.service.submit(reference, token, d);
  }
}
