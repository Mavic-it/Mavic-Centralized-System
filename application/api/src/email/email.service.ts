import { Inject, Injectable, Logger } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { isEmail } from 'class-validator';
import { EMAIL_CONFIG, type EmailConfig } from './email.config.js';
import { notificationEmail } from './notification-email.template.js';
import {
  credentialEmail,
  type CredentialEmail,
} from './credential-email.template.js';

export type EmailDelivery =
  | { status: 'ACCEPTED_BY_PROVIDER'; failure: null }
  | {
      status: 'FAILED';
      failure: 'NOT_CONFIGURED' | 'SMTP_REJECTED' | 'SMTP_UNAVAILABLE';
    };

export type ReservationEmailEvent='PENDING'|'CONFIRMED'|'REJECTED'|'CANCELLED'|'CHECKED_IN'|'COMPLETED'|'NO_SHOW';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  constructor(
    @Inject(MailerService) private readonly mailer: MailerService,
    @Inject(EMAIL_CONFIG) private readonly config: EmailConfig,
  ) {}

  get temporaryPasswordHours() {
    return this.config.temporaryPasswordHours;
  }

  async sendCredential(input: CredentialEmail): Promise<EmailDelivery> {
    if (!this.config.enabled)
      return { status: 'FAILED', failure: 'NOT_CONFIGURED' };
    return this.send(input.email, credentialEmail(input, this.config.loginUrl));
  }

  async sendSecurityNotice(
    email: string,
    name: string,
    text: string,
    eventAt = new Date(),
  ): Promise<void> {
    if (!this.config.enabled) return;
    await this.send(
      email,
      notificationEmail(
        {
          title: 'Your Password Has Been Changed',
          description: 'A security update for your Mspaces account.',
          name,
          message: text,
          eventAt,
          details: [
            ['Activity', 'Password changed'],
            ['Account', email],
            ['Status', 'Successful'],
          ],
          securityNotice:
            'If you did not request this change, contact your system administrator immediately.',
          action: { label: 'Open Mspaces', url: this.config.loginUrl },
        },
        this.config.loginUrl,
      ),
    );
  }

  async sendLeaveNotice(
    email: string,
    name: string,
    requestId: string,
    reviewers: boolean,
    status?: string,
  ): Promise<EmailDelivery> {
    if (!this.config.enabled)
      return { status: 'FAILED', failure: 'NOT_CONFIGURED' };
    const href = new URL(
      `${reviewers ? '/leave' : '/my-leave'}?requestId=${encodeURIComponent(requestId)}`,
      this.config.loginUrl,
    ).href;
    const titles: Record<string, string> = {
      PENDING: 'Leave Request Submitted',
      APPROVED: 'Leave Request Approved',
      REJECTED: 'Leave Request Rejected',
      CANCELLED: 'Leave Request Canceled',
    };
    return this.send(
      email,
      notificationEmail(
        {
          title: reviewers
            ? 'Leave Request Requires Action'
            : (titles[status ?? ''] ?? 'Leave Request Updated'),
          description: reviewers
            ? 'A leave request is ready for your review.'
            : 'An update is available for your leave request.',
          name,
          message:
            'Open the secure portal for current request details. Leave reasons and supporting documents are available only in the authorized portal.',
          details: [
            ['Request reference', requestId],
            ...(status ? [['Current status', status] as const] : []),
          ],
          action: {
            label: reviewers ? 'Review leave request' : 'View leave request',
            url: href,
          },
        },
        this.config.loginUrl,
      ),
    );
  }

  async sendIncidentNotice(
    email: string,
    name: string,
    id: string,
    reference: string,
    category: string,
    status: string,
  ): Promise<EmailDelivery> {
    if (!this.config.enabled)
      return { status: 'FAILED', failure: 'NOT_CONFIGURED' };
    return this.send(
      email,
      notificationEmail(
        {
          title: 'Incident workspace update',
          description: 'An authorized incident record has an update.',
          name,
          message:
            'Open the secure portal to view the record. Explanations, evidence and internal notes are not included in this email.',
          details: [
            ['Incident reference', reference],
            ['Incident type', category],
            ['Current status', status],
          ],
          action: {
            label: 'Open incident',
            url: new URL(
              `/incidents?record=${encodeURIComponent(id)}`,
              this.config.loginUrl,
            ).href,
          },
        },
        this.config.loginUrl,
      ),
    );
  }

  async sendTaskNotice(
    email: string,
    name: string,
    id: string,
    event:
      | 'ASSIGNED'
      | 'REVIEW_REQUIRED'
      | 'CHANGES_REQUESTED'
      | 'COMPLETED'
      | 'CANCELLED'
      | 'DUE_TOMORROW',
  ): Promise<EmailDelivery> {
    if (!this.config.enabled)
      return { status: 'FAILED', failure: 'NOT_CONFIGURED' };
    const copy = {
      ASSIGNED: [
        'New task assigned',
        'A task has been assigned to you.',
        'Open task',
      ],
      REVIEW_REQUIRED: [
        'Task ready for review',
        'An assigned task is ready for your review.',
        'Review task',
      ],
      CHANGES_REQUESTED: [
        'Changes requested on your task',
        'A reviewer requested changes to your task.',
        'Open task',
      ],
      COMPLETED: [
        'Task completed',
        'Your task has been accepted as complete.',
        'View task',
      ],
      CANCELLED: [
        'Task canceled',
        'An assigned task has been canceled.',
        'View task',
      ],
      DUE_TOMORROW: [
        'Task due tomorrow',
        'An assigned task is due tomorrow. Open the secure task workspace to review it.',
        'Open task',
      ],
    }[event];
    return this.send(
      email,
      notificationEmail(
        {
          title: copy[0],
          description: copy[1],
          name,
          message:
            'Open the secure task workspace for details. Comments and files are available only in the portal.',
          action: {
            label: copy[2],
            url: new URL(
              `/tasks?record=${encodeURIComponent(id)}`,
              this.config.loginUrl,
            ).href,
          },
        },
        this.config.loginUrl,
      ),
    );
  }

  async sendReservationNotice(email:string,name:string,id:string,event:ReservationEmailEvent):Promise<EmailDelivery> {
    if(!this.config.enabled)return {status:'FAILED',failure:'NOT_CONFIGURED'};
    const copy:Record<ReservationEmailEvent,[string,string]>={
      PENDING:['Reservation pending approval','A new reservation is ready for your review.'],
      CONFIRMED:['Reservation confirmed','A reservation you created was confirmed.'],
      REJECTED:['Reservation rejected','A reservation you created was rejected.'],
      CANCELLED:['Reservation cancelled','A reservation you created was cancelled.'],
      CHECKED_IN:['Customer checked in','A customer has checked in for a reservation you created.'],
      COMPLETED:['Reservation completed','A reservation you created has been completed.'],
      NO_SHOW:['Reservation marked no-show','A reservation you created was marked as a no-show.'],
    };
    return this.send(email,notificationEmail({
      title:copy[event][0],description:copy[event][1],name,
      message:'Open the secure Reservations workspace for booking details.',
      action:{label:'Open reservation',url:new URL(`/reservations/list?record=${encodeURIComponent(id)}`,this.config.loginUrl).href},
    },this.config.loginUrl));
  }

  async sendClientReservationNotice(email: string, reference: string, status: string): Promise<EmailDelivery> {
    if (!this.config.enabled) return { status: 'FAILED', failure: 'NOT_CONFIGURED' };
    const label = status === 'PENDING' ? 'Pending approval' : status.replaceAll('_', ' ').toLowerCase();
    return this.send(email, {
      subject: `MSPACES reservation ${reference}: ${label}`,
      text: `Your MSPACES reservation reference is ${reference}. Status: ${label}. ${status === 'PENDING' ? 'Your booking is awaiting staff approval and is not yet confirmed.' : 'Please retain this reference for correspondence with the branch.'}`,
    });
  }

  async sendReservationPaymentNotice(email: string, reference: string, message: string, paymentUrl: string): Promise<EmailDelivery> {
    if (!this.config.enabled) return { status:'FAILED',failure:'NOT_CONFIGURED' };
    return this.send(email,notificationEmail({title:'Reservation payment update',description:`Booking ${reference}`,name:'Customer',
      message,action:{label:'View private payment status',url:paymentUrl}},paymentUrl));
  }

  private async send(
    to: string,
    content: { subject: string; text: string; html?: string },
  ): Promise<EmailDelivery> {
    if (!isEmail(to) || /[\r\n]/.test(to))
      return { status: 'FAILED', failure: 'SMTP_REJECTED' };
    try {
      const result: unknown = await this.mailer.sendMail({
        from: this.config.from,
        to,
        ...content,
      });
      const accepted =
        result && typeof result === 'object' && 'accepted' in result
          ? result.accepted
          : undefined;
      const matched =
        Array.isArray(accepted) &&
        accepted.some(
          (entry: unknown) =>
            typeof entry === 'string' &&
            entry.toLowerCase() === to.toLowerCase(),
        );
      if (matched) return { status: 'ACCEPTED_BY_PROVIDER', failure: null };
      this.logger.warn(
        'Credential email was not accepted by the SMTP provider.',
      );
      return { status: 'FAILED', failure: 'SMTP_REJECTED' };
    } catch {
      // SMTP errors can contain authentication values, recipients or message contents.
      this.logger.warn('SMTP delivery failed; details suppressed.');
      return { status: 'FAILED', failure: 'SMTP_UNAVAILABLE' };
    }
  }
}
