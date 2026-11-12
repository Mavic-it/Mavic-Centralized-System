export type NotificationEmail = {
  title: string;
  description: string;
  name?: string;
  message: string;
  eventAt?: Date;
  details?: ReadonlyArray<readonly [string, string]>;
  securityNotice?: string;
  action?: { url: string; label: string };
};

export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        character
      ]!,
  );
}

export function formatEmailDate(value: Date): string {
  const date = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(value);
  const time = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(value);
  return `${date} at ${time} (PHT)`;
}

// emailConfig validates the configured application origin before sending.
export function approvedEmailAction(url: string, loginUrl: string): string {
  const origin = new URL(loginUrl);
  const target = new URL(url, origin);
  if (
    !['https:', 'http:'].includes(target.protocol) ||
    target.origin !== origin.origin ||
    target.username ||
    target.password
  )
    throw new Error('Email action must use the configured application origin.');
  return target.href;
}

/** Shared renderer with escaped values and no raw HTML slots. */
export function notificationEmail(input: NotificationEmail, loginUrl: string) {
  const eventAt = input.eventAt ?? new Date();
  const details = [
    ...(input.details ?? []),
    ['Date and time', formatEmailDate(eventAt)] as const,
  ];
  const greeting = input.name?.trim() ? `Hello, ${input.name}` : 'Hello';
  const action = input.action && {
    ...input.action,
    url: approvedEmailAction(input.action.url, loginUrl),
  };
  const footer = `MAVIC Notification System\nMspaces Centralized Management System\nThis is an automated notification. Please do not reply to this email.\n© ${new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', year: 'numeric' }).format(eventAt)} Mspaces. All rights reserved.`;
  const text = [
    'MAVIC\nMSPACES | Notification System',
    input.title,
    input.description,
    `${greeting},`,
    input.message,
    details.map(([label, value]) => `${label}: ${value}`).join('\n'),
    input.securityNotice,
    action && `${action.label}: ${action.url}`,
    footer,
  ]
    .filter(Boolean)
    .join('\n\n');
  const e = escapeHtml;
  const paragraph = (value: string) => e(value).replace(/\r?\n/g, '<br>');
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${e(input.title)}</title></head>
<body style="margin:0;padding:0;background-color:#f3f4f6;color:#20262e;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f3f4f6"><tr><td align="center" style="padding:24px 12px">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="width:100%;max-width:600px;border:1px solid #e0e3e8;border-top:4px solid #b4233b">
<tr><td style="padding:24px;border-bottom:1px solid #e0e3e8"><p style="margin:0;font-size:26px;font-weight:bold;letter-spacing:3px;color:#b4233b">MAVIC</p><p style="margin:4px 0 0;font-size:12px;letter-spacing:1px;color:#505b68">MSPACES | Notification System</p></td></tr>
<tr><td style="padding:24px"><h1 style="margin:0 0 8px;font-size:24px;line-height:1.3">${e(input.title)}</h1><p style="margin:0 0 24px;color:#505b68">${paragraph(input.description)}</p><p style="margin:0 0 12px">${e(greeting)},</p><p style="margin:0 0 24px">${paragraph(input.message)}</p>
<h2 style="font-size:16px;margin:0 0 12px">Notification details</h2>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;table-layout:fixed;border-top:1px solid #e0e3e8">${details.map(([label, value]) => `<tr><th scope="row" align="left" valign="top" width="36%" style="padding:10px 8px 10px 0;border-bottom:1px solid #e0e3e8;font-size:14px;color:#505b68;overflow-wrap:anywhere;word-wrap:break-word">${e(label)}</th><td valign="top" style="padding:10px 0;border-bottom:1px solid #e0e3e8;font-size:14px;overflow-wrap:anywhere;word-wrap:break-word;word-break:break-word">${paragraph(value)}</td></tr>`).join('')}</table>
${input.securityNotice ? `<p style="margin:24px 0 0;padding:16px;background-color:#fff5f5;border-left:3px solid #b4233b;font-size:14px"><strong>Security reminder</strong><br>${paragraph(input.securityNotice)}</p>` : ''}
${action ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px"><tr><td bgcolor="#b4233b" align="center" style="border:1px solid #b4233b;mso-padding-alt:14px 20px"><a href="${e(action.url)}" style="display:inline-block;padding:14px 20px;color:#ffffff;font-size:16px;font-weight:bold;text-decoration:none">${e(action.label)}</a></td></tr></table><p style="font-size:12px;color:#505b68;overflow-wrap:anywhere;word-break:break-all">If the button does not work, open:<br><a href="${e(action.url)}" style="color:#9b1c31">${e(action.url)}</a></p>` : ''}
</td></tr><tr><td style="padding:24px;border-top:1px solid #e0e3e8;font-size:12px;color:#505b68">${paragraph(footer)}</td></tr></table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`;
  return {
    subject: `[Mspaces] ${input.title.replace(/[\r\n]+/g, ' ')}`,
    text,
    html,
  };
}
