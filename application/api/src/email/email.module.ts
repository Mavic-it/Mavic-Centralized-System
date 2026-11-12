import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MailerModule } from '@nestjs-modules/mailer';
import { EMAIL_CONFIG, emailConfig, type EmailConfig } from './email.config.js';
import { EmailService } from './email.service.js';

@Module({
  imports: [ConfigModule],
  providers: [{ provide: EMAIL_CONFIG, useFactory: () => emailConfig() }],
  exports: [EMAIL_CONFIG],
})
class EmailConfigurationModule {}

@Module({
  imports: [
    EmailConfigurationModule,
    MailerModule.forRootAsync({
      imports: [EmailConfigurationModule],
      inject: [EMAIL_CONFIG],
      useFactory: (config: EmailConfig) => ({
        transport: config.transport,
        defaults: { from: config.from },
        preview: false,
        verifyTransporters: false,
        sendTimeout: 30_000,
      }),
    }),
  ],
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
