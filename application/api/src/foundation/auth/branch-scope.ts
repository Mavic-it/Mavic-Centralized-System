import type { AuthUserContext } from './auth.context.js';

// A finite selection always takes precedence over historical company-wide defaults.
export function selectedBranchScope(user: AuthUserContext): string[] | undefined {
  if (user.branchIds !== undefined) return user.branchIds;
  if (user.role === 'SUPER_ADMIN' || user.role === 'IT_ADMIN' || (user.role === 'HR_ADMIN' && !user.branchId)) return undefined;
  return user.branchId ? [user.branchId] : [];
}
export function includesBranch(user: AuthUserContext, branchId: string): boolean {
  const ids = selectedBranchScope(user);
  return ids === undefined || ids.includes(branchId);
}
