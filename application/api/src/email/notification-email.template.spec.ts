import { describe, expect, it, vi } from 'vitest';
import {
  notificationEmail,
  approvedEmailAction,
} from './notification-email.template.js';
import { credentialEmail } from './credential-email.template.js';
import { EmailService } from './email.service.js';
import { emailConfig } from './email.config.js';
import { createTransport } from 'nodemailer';

const origin = 'https://hris.example.test/login';
const eventAt = new Date('2026-12-31T16:05:00Z');
const fixture = {
  title: 'Employee update',
  description: 'A new update',
  message: 'Open your portal.',
  eventAt,
};

describe('Shared Mavic notification template', () => {
  it('builds a multipart MIME message through Nodemailer without network delivery', async () => {
    const transport = createTransport({
      streamTransport: true,
      buffer: true,
      newline: 'unix',
    });
    const mail = await transport.sendMail({
      from: 'Mavic Notification System <sender@example.test>',
      to: 'fixture@example.test',
      ...notificationEmail(fixture, origin),
    });
    if (!Buffer.isBuffer(mail.message))
      throw new Error('Expected buffered MIME output.');
    const mime = mail.message.toString('utf8');
    expect(mime).toContain('multipart/alternative');
    expect(mime).toContain('Content-Type: text/plain');
    expect(mime).toContain('Content-Type: text/html');
    expect(mime).toContain('Subject: [Mspaces] Employee update');
    transport.close();
  });
  it('escapes every dynamic HTML field while preserving readable plain text', () => {
    const unsafe = '<script>"&\'test</script>';
    const mail = notificationEmail(
      {
        ...fixture,
        title: unsafe,
        name: unsafe,
        description: unsafe,
        message: unsafe,
        securityNotice: unsafe,
        details: [[unsafe, unsafe]],
        action: { url: '/my-leave?a=1&b=2', label: unsafe },
      },
      origin,
    );
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&lt;script&gt;&quot;&amp;&#39;test');
    expect(mail.html).toContain('a=1&amp;b=2');
    expect(mail.text).toContain(unsafe);
    expect(mail.text).toContain('https://hris.example.test/my-leave?a=1&b=2');
  });
  it('includes responsive table layout, Outlook width fallback and Philippine dates', () => {
    const mail = notificationEmail(fixture, origin);
    expect(mail.html).toContain('max-width:600px');
    expect(mail.html).toContain('<!--[if mso]>');
    expect(mail.html).toContain('name="viewport"');
    expect(mail.html).not.toContain('class=');
    for (const content of [mail.html, mail.text]) {
      expect(content).toContain('January 1, 2027 at 12:05 AM (PHT)');
      expect(content).toContain('2027 Mspaces. All rights reserved.');
      expect(content).toContain('Please do not reply');
      expect(content).not.toContain('undefined');
    }
    expect(mail.html).not.toContain('<a ');
    expect(mail.text).toContain('Hello,');
  });
  it.each([
    'https://evil.example.test/',
    '//evil.example.test/',
    'javascript:alert(1)',
    'data:text/html,hello',
    'https://hris.example.test.evil.test/',
    'https://user:secret@hris.example.test/',
    'http://hris.example.test/',
  ])('rejects unapproved action %s', (url) =>
    expect(() => approvedEmailAction(url, origin)).toThrow(),
  );
  it('keeps valid configured development URLs and strips subject newlines', () => {
    expect(approvedEmailAction('/login', 'http://localhost:3000/login')).toBe(
      'http://localhost:3000/login',
    );
    expect(
      notificationEmail({ ...fixture, title: 'Notice\r\nBcc: nobody' }, origin)
        .subject,
    ).not.toMatch(/[\r\n]/);
  });
  it.each([
    ['CREATED', 'Your Account Has Been Created'],
    ['REGENERATED', 'Temporary Password Issued'],
    ['RESET', 'Your Password Has Been Reset'],
  ] as const)(
    'renders %s with a descriptive subject and expiring credentials',
    (purpose, title) => {
      const mail = credentialEmail(
        {
          purpose,
          name: 'Ana & Co',
          email: 'ana@example.test',
          password: 'Fixture<&Password',
          expiresAt: eventAt,
        },
        origin,
      );
      expect(mail.subject).toBe(`[Mspaces] ${title}`);
      expect(mail.html).toContain('Fixture&lt;&amp;Password');
      expect(mail.text).toContain('Fixture<&Password');
      expect(mail.html).toContain('Ana &amp; Co');
      expect(mail.text).toContain('January 1, 2027 at 12:05 AM (PHT)');
      expect(mail.text).toContain('workspace access remains restricted');
    },
  );
});

describe('Existing notification delivery uses shared HTML and text', () => {
  const config = emailConfig({
    SMTP_HOST: 'smtp.example.test',
    SMTP_USER: 'fixture',
    SMTP_PASSWORD: 'fixture',
    SMTP_FROM: 'fixture@example.test',
    FRONTEND_URL: 'https://hris.example.test',
  });
  it.each(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'])(
    'renders current leave status %s without private leave data',
    async (status) => {
      const mailer = {
        sendMail: vi.fn().mockResolvedValue({ accepted: ['ana@example.test'] }),
      };
      const service = new EmailService(mailer as never, config);
      await service.sendLeaveNotice(
        'ana@example.test',
        'Ana',
        'reference & value',
        false,
        status,
      );
      const mail = mailer.sendMail.mock.calls[0][0];
      expect(mail.subject).toBe(
        `[Mspaces] Leave Request ${{ PENDING: 'Submitted', APPROVED: 'Approved', REJECTED: 'Rejected', CANCELLED: 'Canceled' }[status]}`,
      );
      expect(mail.html).toContain(`Current status`);
      expect(mail.text).toContain(status);
      expect(mail.text).toContain('requestId=reference%20%26%20value');
      expect(mail.html).toContain('View leave request');
    },
  );
  it('renders reviewer and password change notices through the existing mailer', async () => {
    const mailer = {
      sendMail: vi.fn().mockResolvedValue({ accepted: ['ana@example.test'] }),
    };
    const service = new EmailService(mailer as never, config);
    await service.sendLeaveNotice(
      'ana@example.test',
      'Ana',
      'fixture',
      true,
      'PENDING',
    );
    expect(mailer.sendMail.mock.calls[0][0].subject).toBe(
      '[Mspaces] Leave Request Requires Action',
    );
    await service.sendSecurityNotice(
      'ana@example.test',
      'Ana',
      'Your password was successfully changed.',
      eventAt,
    );
    const mail = mailer.sendMail.mock.calls[1][0];
    expect(mail.subject).toBe('[Mspaces] Your Password Has Been Changed');
    for (const content of [mail.html, mail.text]) {
      expect(content).toContain('January 1, 2027 at 12:05 AM (PHT)');
      expect(content).toContain(
        'contact your system administrator immediately',
      );
      expect(content).toContain('ana@example.test');
    }
  });
});
