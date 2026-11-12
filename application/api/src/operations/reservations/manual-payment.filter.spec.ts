import { describe, it, expect, vi } from 'vitest';
import { Logger, type ArgumentsHost } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { PaymentPersistenceFilter } from './manual-payment.filter.js';

describe('private payment persistence errors', () => {
  it.each([
    ['23505', 409],
    ['08006', 503],
  ])('redacts database parameters for %s', (code, status) => {
    const warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => {});
    const json = vi.fn();
    const response = { status: vi.fn(() => ({ json })) };
    const host = {
      switchToHttp: () => ({ getResponse: () => response }),
    } as unknown as ArgumentsHost;
    try {
      new PaymentPersistenceFilter().catch(
        new QueryFailedError(
          'secret SQL',
          ['private-proof-bytes', 'receiving-account'],
          Object.assign(new Error('private driver details'),{code}),
        ),
        host,
      );
      expect(response.status).toHaveBeenCalledWith(status);
      expect(JSON.stringify(json.mock.calls)).not.toContain('private');
      expect(JSON.stringify(warn.mock.calls)).not.toContain(
        'receiving-account',
      );
    } finally {
      warn.mockRestore();
    }
  });
});
