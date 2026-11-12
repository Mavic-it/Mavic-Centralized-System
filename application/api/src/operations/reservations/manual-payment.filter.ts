import {
  Catch,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import type { Response } from 'express';

/** Do not let database diagnostics print private proof bytes or receiving-account values. */
@Catch(QueryFailedError)
export class PaymentPersistenceFilter implements ExceptionFilter {
  private readonly logger = new Logger(PaymentPersistenceFilter.name);
  catch(error: QueryFailedError, host: ArgumentsHost) {
    const code = 'code' in error ? String(error.code) : 'UNKNOWN';
    this.logger.warn(
      `Payment persistence failure (${code}); sensitive diagnostics suppressed.`,
    );
    const conflict = code === '23505';
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(conflict ? 409 : 503)
      .json({
        message: conflict
          ? 'This transaction or configuration conflicts with an existing record. Refresh and retry.'
          : 'The payment service is temporarily unavailable. Please retry or contact the branch.',
      });
  }
}
