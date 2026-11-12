import { isIP } from 'node:net';
import { isEmail } from 'class-validator';
import type SMTPTransport from 'nodemailer/lib/smtp-transport/index.js';

export type EmailConfig = {
  enabled: boolean;
  from: string;
  loginUrl: string;
  temporaryPasswordHours: number;
  transport: SMTPTransport.Options;
};

export function emailConfig(env: NodeJS.ProcessEnv = process.env): EmailConfig {
  const hours = Number(env.TEMPORARY_PASSWORD_TTL_HOURS ?? 24);
  if (!Number.isInteger(hours) || hours < 1 || hours > 168)
    throw new Error(
      'TEMPORARY_PASSWORD_TTL_HOURS must be an integer from 1 to 168.',
    );
  const disabled: EmailConfig = {
    enabled: false,
    from: '',
    loginUrl: '',
    temporaryPasswordHours: hours,
    transport: { host: 'localhost', port: 587 },
  };
  if (!env.SMTP_HOST?.trim()) return disabled;
  for (const key of [
    'SMTP_USER',
    'SMTP_PASSWORD',
    'SMTP_FROM',
    'FRONTEND_URL',
  ] as const) {
    if (!env[key]?.trim())
      throw new Error(`${key} is required when SMTP_HOST is configured.`);
  }
  const port = Number(env.SMTP_PORT ?? 587);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('SMTP_PORT must be a valid port.');
  if (
    env.SMTP_SECURE !== undefined &&
    !['true', 'false'].includes(env.SMTP_SECURE)
  )
    throw new Error('SMTP_SECURE must be true or false.');
  const secure = env.SMTP_SECURE === 'true';
  if (port === 465 && !secure)
    throw new Error('SMTP_SECURE must be true for port 465.');
  const from = env.SMTP_FROM!.trim();
  const address = /<([^<>]+)>$/.exec(from)?.[1] ?? from;
  if (/[\r\n]/.test(from) || !isEmail(address))
    throw new Error('SMTP_FROM must contain a valid sender email address.');
  let frontend: URL;
  try {
    frontend = new URL(env.FRONTEND_URL!);
  } catch {
    throw new Error('FRONTEND_URL must be a valid HTTPS origin.');
  }
  const localDevelopment =
    env.APP_ENV === 'development' &&
    frontend.protocol === 'http:' &&
    (['localhost', '127.0.0.1', '[::1]'].includes(frontend.hostname) ||
      (isIP(frontend.hostname) === 4 &&
        /^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(frontend.hostname)));
  if (
    frontend.username ||
    frontend.password ||
    (frontend.protocol !== 'https:' && !localDevelopment) ||
    frontend.pathname !== '/' ||
    frontend.search ||
    frontend.hash
  )
    throw new Error(
      'FRONTEND_URL must be an HTTPS origin (HTTP localhost/private LAN addresses are allowed only in development).',
    );
  return {
    enabled: true,
    from: `Mavic Notification System <${address}>`,
    loginUrl: new URL('/login', frontend).toString(),
    temporaryPasswordHours: hours,
    transport: {
      host: env.SMTP_HOST.trim(),
      port,
      secure,
      requireTLS: !secure,
      auth: { user: env.SMTP_USER!, pass: env.SMTP_PASSWORD! },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
      dnsTimeout: 5_000,
      tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' },
      logger: false,
      debug: false,
      disableFileAccess: true,
      disableUrlAccess: true,
    },
  };
}

export const EMAIL_CONFIG = Symbol('EMAIL_CONFIG');
