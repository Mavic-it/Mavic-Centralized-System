import type { AuthUserContext } from '../foundation/auth/auth.context.js';
import { defaultModuleAccess, registryEntry } from '../foundation/permissions/module-registry.js';
import type { AnalyticsCategory, AnalyticsMode } from './analytics.dto.js';

export type ModuleOverride = { permission_key: string; effect: 'ALLOW' | 'VIEW' | 'EDIT' | 'DENY' };
export function analyticsPermission(user: AuthUserContext, overrides: ModuleOverride[], key: string): boolean {
  let entry = registryEntry(key);
  if (!entry) return false;
  const map = new Map(user.role === 'SUPER_ADMIN' ? [] : overrides.map(row => [row.permission_key, row.effect]));
  const own = entry.critical ? undefined : map.get(key);
  if ((own ?? defaultModuleAccess(entry, user.role)) === 'DENY') return false;
  while (entry.parentKey) {
    entry = registryEntry(entry.parentKey);
    if (!entry) return false;
    if (!entry.critical && map.get(entry.key) === 'DENY') return false;
  }
  return true;
}
export const categoryInfo: Record<AnalyticsCategory, { title: string; key: string; href: string; management?: boolean }> = {
  inquiries: { title:'Inquiries',key:'crm.inquiries.reports',href:'/inquiries/reports' },
  workforce: { title: 'Workforce', key: 'hr.employees', href: '/employees', management: true },
  reservations: { title: 'Reservations', key: 'operations.reservations.list', href: '/reservations/list' },
  spaces: { title: 'Space availability', key: 'operations.reservations.spaces', href: '/reservations/spaces' },
  attendance: { title: 'Attendance & DTR', key: 'hr.attendance', href: '/attendance', management: true },
  leave: { title: 'Leave', key: 'hr.leave.reports', href: '/leave/reports', management: true },
  'official-business': { title: 'Official business', key: 'hr.attendance', href: '/attendance', management: true },
  inventory: { title: 'Stock balances', key: 'inventory.stock', href: '/inventory' },
  movements: { title: 'Stock movements', key: 'inventory.movements', href: '/inventory' },
  assets: { title: 'Assets', key: 'inventory.overview', href: '/inventory' },
  tasks: { title: 'Tasks', key: 'work.tasks', href: '/tasks', management: true },
  incidents: { title: 'Incidents', key: 'work.incidents', href: '/incidents', management: true },
  accounts: { title: 'Accounts', key: 'system.users', href: '/system/users' },
  branches: { title: 'Branches', key: 'system.branches', href: '/branches' },
};
export function permittedCategories(user: AuthUserContext, overrides: ModuleOverride[], mode: AnalyticsMode): AnalyticsCategory[] {
  const manager = ['SUPER_ADMIN', 'HR_ADMIN', 'BRANCH_MANAGER'].includes(user.role);
  const hr = new Set<AnalyticsCategory>(['workforce', 'attendance', 'leave', 'official-business', 'tasks', 'incidents']);
  return (Object.keys(categoryInfo) as AnalyticsCategory[]).filter(id => {
    const info = categoryInfo[id];
    if (mode === 'hr' && !hr.has(id) || info.management && !manager) return false;
    if (id === 'accounts' && !manager && user.role !== 'IT_ADMIN') return false;
    // Inventory and reservation controllers retain domain role/explicit-grant boundaries.
    if (['inventory', 'movements', 'assets'].includes(id) && !['SUPER_ADMIN', 'IT_ADMIN', 'HR_ADMIN', 'BRANCH_MANAGER', 'STAFF'].includes(user.role)) return false;
    return analyticsPermission(user, overrides, info.key);
  });
}
