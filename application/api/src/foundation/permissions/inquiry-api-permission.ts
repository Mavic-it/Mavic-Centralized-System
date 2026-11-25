/** Keep HTTP permission resolution aligned with the inquiry controller's granular operations. */
export function inquiryApiPermission(
  path: string,
  method: string,
  body?: Record<string, unknown>,
): string | undefined {
  if (path !== '/inquiries' && !path.startsWith('/inquiries/'))
    return undefined;
  const segments = path.split('/').filter(Boolean),
    first = segments[1],
    last = segments.at(-1);
  let action: string;
  if (!first) action = method === 'GET' ? 'list' : 'create';
  else if (['metadata', 'customers'].includes(first)) action = 'list';
  else if (
    [
      'dashboard',
      'reports',
      'followups',
      'import',
      'export',
      'settings',
    ].includes(first)
  )
    action = first;
  else if (first === 'bulk') action = 'archive';
  else if (last === 'activities') action = 'activities';
  else if (segments.includes('tasks')) action = 'followups';
  else if (last === 'convert-service') action = 'convert';
  else if (last === 'action')
    action = body?.archived === undefined ? 'update' : 'archive';
  else action = method === 'GET' ? 'list' : 'update';
  return `crm.inquiries.${action}`;
}
