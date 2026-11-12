import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { EmailService } from '../../email/email.service.js';
import { AuthService } from '../auth/auth.service.js';
import type { AuthUserContext } from '../auth/auth.context.js';
import { generateTemporaryPassword } from '../auth/temporary-password.js';
import { UserService, type CreateUserInput } from './user.service.js';
import {
  AccountCredentialRepository,
  type DeliveryAccount,
} from './account-credential.repository.js';

@Injectable()
export class AccountProvisioningService {
  private readonly credentials: AccountCredentialRepository;
  constructor(
    db: DataSource,
    private readonly users: UserService,
    private readonly auth: AuthService,
    private readonly email: EmailService,
  ) {
    this.credentials = new AccountCredentialRepository(db);
  }

  async create(
    input: Omit<
      CreateUserInput,
      'passwordHash' | 'actorId' | 'temporaryPasswordExpiresAt'
    >,
    actor: AuthUserContext,
  ) {
    this.assertAdministrator(actor, 'CREATE');
    if (input.role === 'SUPER_ADMIN' && actor.role !== 'SUPER_ADMIN')
      throw new ForbiddenException(
        'Only a Super Admin can create another Super Admin account.',
      );
    const password = generateTemporaryPassword();
    const account = await this.users.createAccount({
      ...input,
      passwordHash: this.auth.hashPassword(password),
      actorId: actor.userId,
      temporaryPasswordExpiresAt: new Date(
        Date.now() + this.email.temporaryPasswordHours * 3_600_000,
      ),
    });
    return this.deliver(account.id, actor, password);
  }

  async regenerate(id: string, actor: AuthUserContext) {
    this.assertAdministrator(actor, 'UPDATE');
    return this.deliver(id, actor);
  }

  private assertAdministrator(
    actor: AuthUserContext,
    action: 'CREATE' | 'UPDATE',
  ) {
    if (
      !['SUPER_ADMIN', 'IT_ADMIN'].includes(actor.role) ||
      !this.auth.canAccess(actor.role, 'users', action, 'ALL')
    )
      throw new ForbiddenException('Account administration is not permitted.');
  }

  private async deliver(
    id: string,
    actor: AuthUserContext,
    initialPassword?: string,
  ) {
    const password = initialPassword ?? generateTemporaryPassword();
    const attemptId = randomUUID();
    const expiresAt = new Date(
      Date.now() + this.email.temporaryPasswordHours * 3_600_000,
    );
    const account = await this.credentials.prepare(
      id,
      {
        hash: this.auth.hashPassword(password),
        expiresAt,
        attemptId,
        actorId: actor.userId,
        regenerated: !initialPassword,
      },
      (target): asserts target is DeliveryAccount => {
        if (!target) throw new BadRequestException('User account not found.');
        if (target.id === actor.userId)
          throw new ForbiddenException(
            'Another authorized administrator must manage your credentials.',
          );
        if (target.role === 'SUPER_ADMIN' && actor.role !== 'SUPER_ADMIN')
          throw new ForbiddenException(
            'Only a Super Admin can manage a Super Admin credential.',
          );
        if (
          target.status !== 'ACTIVE' ||
          !target.mustChangePassword ||
          target.credentialEmailStatus === 'NOT_REQUIRED'
        )
          throw new BadRequestException(
            'Credential regeneration is available only for active accounts awaiting their initial password change. Use password recovery for established accounts.',
          );
        const age = target.startedAt
          ? Date.now() - new Date(target.startedAt).getTime()
          : Infinity;
        if (target.credentialEmailStatus === 'PROCESSING' && age < 120_000)
          throw new ConflictException(
            'Credential email is already being processed. Refresh the account before retrying.',
          );
        if (age < 30_000)
          throw new ConflictException(
            'Wait 30 seconds before generating another credential email.',
          );
      },
    );
    await this.auth.revokeSessionsForUser(id);
    const delivery = await this.email.sendCredential({
      name: account.name,
      email: account.email,
      password,
      expiresAt,
      purpose: initialPassword ? 'CREATED' : 'REGENERATED',
    });
    if (
      !(await this.credentials.finish(
        account,
        actor.userId,
        attemptId,
        delivery,
      ))
    )
      throw new ConflictException(
        'The credential attempt changed. Refresh the account delivery status.',
      );
    // Only explicit safe account fields cross the API boundary.
    return {
      success: true as const,
      data: {
        id: account.id,
        name: account.name,
        email: account.email,
        role: account.role,
        status: account.status,
        branchId: account.branchId,
        employeeId: account.employeeId,
        mustChangePassword: true,
        temporaryPasswordExpiresAt: expiresAt.toISOString(),
        credentialEmailStatus: delivery.status,
      },
      emailDelivery: delivery.status,
      message:
        delivery.status === 'ACCEPTED_BY_PROVIDER'
          ? 'Account credentials accepted by the email provider. Inbox delivery is not confirmed.'
          : delivery.failure === 'NOT_CONFIGURED'
            ? 'Account saved, but SMTP email is not configured. Configure the email service, then regenerate credentials.'
            : 'Account saved, but credential email delivery failed. Regenerate credentials to retry.',
    };
  }
}
