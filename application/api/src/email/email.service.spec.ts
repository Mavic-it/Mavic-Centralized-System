import { describe, expect, it, vi } from 'vitest';
import { emailConfig } from './email.config.js';
import { EmailService } from './email.service.js';
import {
  credentialEmail,
  formatCredentialExpiry,
} from './credential-email.template.js';

const env = {
  SMTP_HOST: 'smtp.example.test',
  SMTP_PORT: '587',
  SMTP_SECURE: 'false',
  SMTP_USER: 'service',
  SMTP_PASSWORD: 'not-a-real-secret',
  SMTP_FROM: 'Mspaces <access@example.test>',
  FRONTEND_URL: 'https://hris.example.test',
};
const input = {
  name: '<img src=x onerror=alert(1)>',
  email: 'person@example.test',
  password: 'TestOnly!ABCdef234567',
  expiresAt: new Date('2030-01-01T00:00:00Z'),
  purpose: 'CREATED' as const,
};

describe('SMTP email configuration and delivery', () => {
  it('sends accurate public reservation status without privileged portal links', async () => {
    const mailer = { sendMail: vi.fn().mockResolvedValue({ accepted: ['person@example.test'] }) };
    const service = new EmailService(mailer as never, emailConfig(env));
    expect((await service.sendClientReservationNotice('person@example.test','RSV-TEST','PENDING')).status).toBe('ACCEPTED_BY_PROVIDER');
    const pending = mailer.sendMail.mock.calls[0][0];
    expect(pending.text).toContain('not yet confirmed');
    expect(pending.text).not.toContain('/reservations');
    await service.sendClientReservationNotice('person@example.test','RSV-TEST','CONFIRMED');
    expect(mailer.sendMail.mock.calls[1][0].subject).toContain('confirmed');
    const disabled = new EmailService(mailer as never, emailConfig({}));
    expect(await disabled.sendClientReservationNotice('person@example.test','RSV-TEST','PENDING')).toEqual({status:'FAILED',failure:'NOT_CONFIGURED'});
  });
  it('reuses SMTP for leave notices with secure record links', async () => {
    const mailer = {
      sendMail: vi
        .fn()
        .mockResolvedValue({ accepted: ['person@example.test'] }),
    };
    const service = new EmailService(mailer as never, emailConfig(env));
    expect(
      (
        await service.sendLeaveNotice(
          'person@example.test',
          'Employee',
          'fixture-id',
          false,
        )
      ).status,
    ).toBe('ACCEPTED_BY_PROVIDER');
    expect(mailer.sendMail.mock.calls[0][0]).toMatchObject({
      subject: '[Mspaces] Leave Request Updated',
    });
    expect(mailer.sendMail.mock.calls[0][0].text).toContain(
      'https://hris.example.test/my-leave?requestId=fixture-id',
    );
    const disabled = new EmailService(mailer as never, emailConfig({}));
    await disabled.sendLeaveNotice(
      'person@example.test',
      'Employee',
      'fixture-id',
      true,
    );
    expect(mailer.sendMail).toHaveBeenCalledTimes(1);
  });
  it('disables sending without SMTP configuration', async () => {
    const mailer = { sendMail: vi.fn() };
    const service = new EmailService(mailer as never, emailConfig({}));
    await expect(service.sendCredential(input)).resolves.toEqual({
      status: 'FAILED',
      failure: 'NOT_CONFIGURED',
    });
    expect(mailer.sendMail).not.toHaveBeenCalled();
  });
  it('requires STARTTLS, certificates and bounded timeouts', () => {
    const config = emailConfig(env);
    expect(config.transport).toMatchObject({
      secure: false,
      requireTLS: true,
      connectionTimeout: 10000,
      socketTimeout: 15000,
      tls: { rejectUnauthorized: true },
      debug: false,
      logger: false,
    });
    expect(config.temporaryPasswordHours).toBe(24);
  });
  it.each([
    { SMTP_PASSWORD: '' },
    { SMTP_PORT: 'invalid' },
    { SMTP_SECURE: 'no' },
    { SMTP_FROM: 'sender@example.test\r\nBcc: other@example.test' },
    { FRONTEND_URL: 'javascript:alert(1)' },
    { FRONTEND_URL: 'http://hris.example.test' },
    { FRONTEND_URL: 'https://user:pass@example.test' },
    { TEMPORARY_PASSWORD_TTL_HOURS: '0' },
    { SMTP_PORT: '465', SMTP_SECURE: 'false' },
  ])('rejects unsafe or incomplete configuration %j', (overrides) => {
    expect(() => emailConfig({ ...env, ...overrides })).toThrow();
  });
  it('supports secure SMTP and configurable lifetime', () => {
    expect(
      emailConfig({
        ...env,
        SMTP_PORT: '465',
        SMTP_SECURE: 'true',
        TEMPORARY_PASSWORD_TTL_HOURS: '12',
      }),
    ).toMatchObject({
      temporaryPasswordHours: 12,
      transport: { secure: true },
    });
    expect(
      emailConfig({
        ...env,
        APP_ENV: 'development',
        FRONTEND_URL: 'http://localhost:3000',
      }).loginUrl,
    ).toBe('http://localhost:3000/login');
  });
  it('includes an escaped HTML template and plain text without injection', () => {
    const template = credentialEmail(input, 'https://hris.example.test/login');
    expect(template.subject).toBe('[Mspaces] Your Account Has Been Created');
    expect(template.html).not.toContain(input.name);
    expect(template.html).toContain('&lt;img');
    expect(template.text).toContain(input.password);
    expect(template.text).toContain('January 1, 2030 at 8:00 AM (PHT)');
    expect(template.html).toContain('January 1, 2030 at 8:00 AM (PHT)');
    expect(template.html).toContain('Change this temporary password');
  });
  it('marks acceptance only after the intended SMTP recipient is accepted', async () => {
    const mailer = {
      sendMail: vi.fn().mockResolvedValue({ accepted: ['other@example.test'] }),
    };
    const service = new EmailService(mailer as never, emailConfig(env));
    await expect(service.sendCredential(input)).resolves.toEqual({
      status: 'FAILED',
      failure: 'SMTP_REJECTED',
    });
    mailer.sendMail.mockResolvedValue({ accepted: [input.email] });
    await expect(service.sendCredential(input)).resolves.toEqual({
      status: 'ACCEPTED_BY_PROVIDER',
      failure: null,
    });
    expect(mailer.sendMail.mock.calls[1][0]).toMatchObject({
      from: 'Mavic Notification System <access@example.test>',
      to: input.email,
      subject: '[Mspaces] Your Account Has Been Created',
    });
  });
  it('does not expose provider or authentication error contents', async () => {
    const mailer = {
      sendMail: vi.fn().mockRejectedValue(new Error('secret provider error')),
    };
    const service = new EmailService(mailer as never, emailConfig(env));
    const result = await service.sendCredential(input);
    expect(result).toEqual({ status: 'FAILED', failure: 'SMTP_UNAVAILABLE' });
    expect(JSON.stringify(result)).not.toContain('secret');
  });
  it('rejects malformed or multiple stored recipients before invoking SMTP', async () => {
    const mailer = { sendMail: vi.fn() };
    const service = new EmailService(mailer as never, emailConfig(env));
    await expect(
      service.sendCredential({
        ...input,
        email: 'one@example.test,two@example.test',
      }),
    ).resolves.toMatchObject({ status: 'FAILED' });
    expect(mailer.sendMail).not.toHaveBeenCalled();
  });
});

describe('Credential expiry display in Philippine time', () => {
  it.each([
    ['2026-10-21T14:30:00Z', 'October 21, 2026 at 10:30 PM (PHT)'],
    ['2026-10-21T16:00:00Z', 'October 22, 2026 at 12:00 AM (PHT)'],
    ['2026-10-21T04:00:00Z', 'October 21, 2026 at 12:00 PM (PHT)'],
    ['2026-12-31T20:05:00Z', 'January 1, 2027 at 4:05 AM (PHT)'],
  ])('formats %s as %s', (date, expected) => {
    expect(formatCredentialExpiry(new Date(date))).toBe(expected);
  });
});

describe('Combined password reset email', () => {
  it('includes the credential and security notice in both email alternatives', () => {
    const template = credentialEmail(
      { ...input, purpose: 'RESET' },
      'https://hris.example.test/login',
    );
    for (const content of [template.html, template.text]) {
      expect(content).toContain(input.password);
      expect(content).toContain('Existing sessions have been signed out.');
      expect(content).toContain('If you did not request this reset');
    }
    expect(template.html).toContain('MAVIC Notification System');
  });
});

describe('Development LAN email links', () => {
  it.each(['10.0.0.2', '192.168.1.50', '172.16.0.2', '172.31.255.254'])(
    'allows %s only in development',
    (host) => {
      const settings = { ...env, FRONTEND_URL: `http://${host}:3000` };
      expect(
        emailConfig({ ...settings, APP_ENV: 'development' }).loginUrl,
      ).toBe(`http://${host}:3000/login`);
      expect(() =>
        emailConfig({ ...settings, APP_ENV: 'production' }),
      ).toThrow();
    },
  );
  it.each(['172.15.0.2', '172.32.0.2', '8.8.8.8', '192.168.example.test'])(
    'rejects public or lookalike HTTP host %s',
    (host) => {
      expect(() =>
        emailConfig({
          ...env,
          APP_ENV: 'development',
          FRONTEND_URL: `http://${host}:3000`,
        }),
      ).toThrow();
    },
  );
});

describe('private incident email', () => {
  it('sends only reference/type/status and an authenticated workspace link', async () => {
    const mailer = {
      sendMail: vi
        .fn()
        .mockResolvedValue({ accepted: ['person@example.test'] }),
    };
    const service = new EmailService(mailer as never, emailConfig(env));
    expect(
      (
        await service.sendIncidentNotice(
          'person@example.test',
          'Employee',
          'case-id',
          'INC-REFERENCE',
          'SAFETY',
          'UNDER_REVIEW',
        )
      ).status,
    ).toBe('ACCEPTED_BY_PROVIDER');
    const sent = mailer.sendMail.mock.calls[0][0] as { text: string };
    expect(sent.text).toContain('INC-REFERENCE');
    expect(sent.text).toContain('SAFETY');
    expect(sent.text).toContain('/incidents?record=case-id');
    expect(sent.text).not.toContain('Private allegation');
  });
});

describe('task decision email', () => {
  it('includes the action and secure link without task details or a visible UUID', async () => {
    const mailer = {
      sendMail: vi
        .fn()
        .mockResolvedValue({ accepted: ['person@example.test'] }),
    };
    const service = new EmailService(mailer as never, emailConfig(env));
    const id = 'b2d3aa31-a96e-41b5-9709-8d160604e828';
    expect(
      (
        await service.sendTaskNotice(
          'person@example.test',
          'Employee',
          id,
          'CHANGES_REQUESTED',
        )
      ).status,
    ).toBe('ACCEPTED_BY_PROVIDER');
    const sent = mailer.sendMail.mock.calls[0][0] as { text: string };
    expect(sent.text).toContain('Changes requested on your task');
    expect(sent.text).toContain(`/tasks?record=${id}`);
    expect(sent.text).not.toContain('Arrange chairs');
    expect(sent.text).not.toContain(`Task ID: ${id}`);
  });

  it('sends a private due-tomorrow reminder to the secure task workspace', async () => {
    const mailer = {
      sendMail: vi
        .fn()
        .mockResolvedValue({ accepted: ['person@example.test'] }),
    };
    const service = new EmailService(mailer as never, emailConfig(env));
    const id = 'b2d3aa31-a96e-41b5-9709-8d160604e828';
    expect(
      (
        await service.sendTaskNotice(
          'person@example.test',
          'Employee',
          id,
          'DUE_TOMORROW',
        )
      ).status,
    ).toBe('ACCEPTED_BY_PROVIDER');
    const sent = mailer.sendMail.mock.calls[0][0] as { text: string };
    expect(sent.text).toContain('Task due tomorrow');
    expect(sent.text).toContain(`/tasks?record=${id}`);
    expect(sent.text).not.toContain('Arrange chairs');
  });
});
