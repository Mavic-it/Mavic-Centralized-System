import {
  formatEmailDate,
  notificationEmail,
} from './notification-email.template.js';
export { escapeHtml } from './notification-email.template.js';

export type CredentialEmail = {
  name: string;
  email: string;
  password: string;
  expiresAt: Date;
  purpose: 'CREATED' | 'REGENERATED' | 'RESET';
};

export const formatCredentialExpiry = formatEmailDate;

export function credentialEmail(input: CredentialEmail, loginUrl: string) {
  return notificationEmail(
    {
      title:
        input.purpose === 'CREATED'
          ? 'Your Account Has Been Created'
          : input.purpose === 'RESET'
            ? 'Your Password Has Been Reset'
            : 'Temporary Password Issued',
      description: 'Your temporary Mspaces account access is ready.',
      name: input.name,
      message: `${input.purpose === 'CREATED' ? 'Your Mspaces account has been created.' : 'An administrator has issued new temporary access for your Mspaces account.'}\nChange this temporary password immediately after signing in. Your workspace access remains restricted until you do.`,
      details: [
        ['Account', input.email],
        ['Temporary password', input.password],
        ['Expires', formatCredentialExpiry(input.expiresAt)],
        ['Status', 'Temporary access issued'],
      ],
      securityNotice: `Do not share your account credentials. ${
        input.purpose === 'RESET'
          ? 'Existing sessions have been signed out. If you did not request this reset, contact your workspace administrator immediately.'
          : 'If you did not expect this email, contact your workspace administrator immediately.'
      }`,
      action: { label: 'Sign in to Mspaces', url: loginUrl },
    },
    loginUrl,
  );
}
