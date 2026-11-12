import { afterEach, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { EmailModule } from './email.module.js';
import { EmailService } from './email.service.js';

afterEach(() => vi.unstubAllEnvs());
describe('EmailModule wiring', () => {
  it('starts without SMTP secrets and safely reports disabled delivery', async () => {
    vi.stubEnv('SMTP_HOST', '');
    vi.stubEnv('TEMPORARY_PASSWORD_TTL_HOURS', '24');
    const module = await Test.createTestingModule({
      imports: [EmailModule],
    }).compile();
    try {
      const service = module.get(EmailService);
      await expect(
        service.sendCredential({
          name: 'Person',
          email: 'person@example.test',
          password: 'TestOnly!234567ABCdef',
          expiresAt: new Date(),
          purpose: 'CREATED',
        }),
      ).resolves.toEqual({ status: 'FAILED', failure: 'NOT_CONFIGURED' });
    } finally {
      await module.close();
    }
  });
});
