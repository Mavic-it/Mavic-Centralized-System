import { existsSync } from 'node:fs';
import nodemailer from 'nodemailer';
import { emailConfig } from '../dist/email/email.config.js';

if (existsSync('.env')) process.loadEnvFile('.env');
let config;
try {
  config = emailConfig();
} catch (error) {
  // Configuration errors contain variable names, never environment values.
  console.error(
    error instanceof Error ? error.message : 'SMTP configuration is invalid.',
  );
  process.exitCode = 1;
}
if (config && !config.enabled) {
  console.log(
    JSON.stringify({
      ready: false,
      missing: [
        'SMTP_HOST',
        'SMTP_USER',
        'SMTP_PASSWORD',
        'SMTP_FROM',
        'FRONTEND_URL',
      ].filter((key) => !process.env[key]?.trim()),
      message:
        'Configure SMTP locally before sending credential email. No email was sent.',
    }),
  );
  process.exitCode = 1;
} else if (config) {
  const transporter = nodemailer.createTransport(config.transport);
  try {
    await transporter.verify();
    console.log(
      JSON.stringify({
        ready: true,
        message:
          'SMTP connection and authentication verified. No email was sent.',
      }),
    );
  } catch (error) {
    const code =
      error &&
      typeof error === 'object' &&
      'code' in error &&
      typeof error.code === 'string' &&
      ['EAUTH', 'ECONNECTION', 'ETIMEDOUT', 'ETLS', 'EDNS', 'ESOCKET'].includes(
        error.code,
      )
        ? error.code
        : 'SMTP_UNAVAILABLE';
    console.error(
      JSON.stringify({
        ready: false,
        code,
        message:
          'SMTP verification failed. Check provider settings and credentials locally. No email was sent.',
      }),
    );
    process.exitCode = 1;
  } finally {
    transporter.close();
  }
}
