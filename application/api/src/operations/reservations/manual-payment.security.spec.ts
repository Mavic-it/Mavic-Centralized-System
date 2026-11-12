import 'reflect-metadata';
import { afterEach, describe, it, expect } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  bookingPaymentToken,
  matchesPaymentToken,
  validatePaymentFile,
} from './manual-payment.security.js';
import {
  PaymentProofDto,
  PaymentDecisionDto,
  PaymentAccountDto,
} from './manual-payment.dto.js';
const before = process.env.PAYMENT_ACCESS_SECRET;
afterEach(() => {
  if (before === undefined) delete process.env.PAYMENT_ACCESS_SECRET;
  else process.env.PAYMENT_ACCESS_SECRET = before;
});
describe('payment trust boundaries', () => {
  it('fails closed without a stable secret and binds tokens to both booking and submission key', () => {
    delete process.env.PAYMENT_ACCESS_SECRET;
    expect(() => bookingPaymentToken('RSV-A-B', 'hash')).toThrow(
      'not configured',
    );
    process.env.PAYMENT_ACCESS_SECRET = 'test-only-32-character-minimum-secret';
    const token = bookingPaymentToken('RSV-A-B', 'hash');
    expect(matchesPaymentToken(token, 'RSV-A-B', 'hash')).toBe(true);
    expect(matchesPaymentToken(token, 'RSV-C-D', 'hash')).toBe(false);
    expect(matchesPaymentToken(token, 'RSV-A-B', 'other')).toBe(false);
    expect(matchesPaymentToken('bad', 'RSV-A-B', 'hash')).toBe(false);
  });
  it('validates file signatures instead of trusting MIME or extensions', () => {
    expect(() =>
      validatePaymentFile(
        Buffer.from('<html>unsafe</html>').toString('base64'),
        'image/png',
      ),
    ).toThrow();
    expect(() =>
      validatePaymentFile('not base64', 'application/pdf'),
    ).toThrow();
    expect(() =>
      validatePaymentFile(
        Buffer.from('%PDF-1.4\ncontent\n%%EOF').toString('base64'),
        'application/pdf',
      ),
    ).not.toThrow();
    expect(() =>
      validatePaymentFile(
        Buffer.from('%PDF-1.4\ncontent').toString('base64'),
        'application/pdf',
      ),
    ).toThrow();
  });
  it('rejects client-supplied verification fields and malformed money', async () => {
    const errors = await validate(
      plainToInstance(PaymentProofDto, {
        paymentAccountId: 'bad',
        transactionReference: 'X',
        amount: -100,
        paymentDateTime: 'invalid',
        mime: 'text/html',
        fileName: 'x.html',
        proofBase64: 'AAAA',
        verificationStatus: 'VERIFIED',
        verifiedBy: 'admin',
      }),
      { whitelist: true, forbidNonWhitelisted: true },
    );
    expect(errors.map((e) => e.property)).toEqual(
      expect.arrayContaining([
        'verificationStatus',
        'verifiedBy',
        'amount',
        'paymentAccountId',
        'mime',
      ]),
    );
    expect(
      await validate(
        plainToInstance(PaymentDecisionDto, {
          notes: ' ',
          verifiedAmount: 1.001,
        }),
      ),
    ).toHaveLength(2);
    expect(
      await validate(
        plainToInstance(PaymentAccountDto, {
          paymentMethod: 'STRIPE',
          accountName: ' ',
          accountNumber: 'x',
          isActive: true,
          isDefault: false,
        }),
      ),
    ).not.toHaveLength(0);
  });
});
