import type { RoleName } from '../roles/role.service.js';

export type ModuleAccessLevel = 'VIEW' | 'EDIT' | 'DENY';
export type ModulePermission = { key: string; label: string; path: string; parentKey?: string; ceiling: readonly RoleName[]; editCeiling?: readonly RoleName[]; critical?: boolean };

// Absent keys and roles default to DENY. Defaults are resolved dynamically for
// new accounts and role changes, without per-user seed rows.
export const ROLE_MODULE_DEFAULTS: Record<string, Partial<Record<RoleName, ModuleAccessLevel>>> = {
  'workspace.overview': { SUPER_ADMIN:'VIEW', IT_ADMIN:'VIEW', HR_ADMIN:'VIEW', BRANCH_MANAGER:'VIEW', STAFF:'VIEW', EMPLOYEE:'VIEW' },
  'hr.dashboard': { SUPER_ADMIN:'VIEW', HR_ADMIN:'VIEW', BRANCH_MANAGER:'VIEW' },
  'hr.employees': { SUPER_ADMIN:'EDIT', HR_ADMIN:'EDIT', BRANCH_MANAGER:'VIEW' },
  'hr.employee-profile': { SUPER_ADMIN:'EDIT', HR_ADMIN:'EDIT', BRANCH_MANAGER:'EDIT' },
  'hr.attendance': { SUPER_ADMIN:'EDIT', HR_ADMIN:'EDIT', BRANCH_MANAGER:'EDIT' },
  'hr.leave': { SUPER_ADMIN:'EDIT', HR_ADMIN:'EDIT', BRANCH_MANAGER:'EDIT' },
  'hr.leave.balances': { SUPER_ADMIN:'EDIT', HR_ADMIN:'EDIT', BRANCH_MANAGER:'EDIT' },
  'hr.leave.reports': { SUPER_ADMIN:'VIEW', HR_ADMIN:'VIEW', BRANCH_MANAGER:'VIEW' },
  'hr.leave.settings': { SUPER_ADMIN:'EDIT', HR_ADMIN:'EDIT' },
  'work.tasks': { SUPER_ADMIN:'EDIT', IT_ADMIN:'EDIT', HR_ADMIN:'EDIT', BRANCH_MANAGER:'EDIT', STAFF:'EDIT', EMPLOYEE:'EDIT' },
  'work.incidents': { SUPER_ADMIN:'EDIT', IT_ADMIN:'EDIT', HR_ADMIN:'EDIT', BRANCH_MANAGER:'EDIT', STAFF:'EDIT', EMPLOYEE:'EDIT' },
  'operations.reservations': { SUPER_ADMIN:'EDIT', HR_ADMIN:'EDIT', BRANCH_MANAGER:'EDIT' },
  'operations.reservations.list': { SUPER_ADMIN:'EDIT', HR_ADMIN:'EDIT', BRANCH_MANAGER:'EDIT' },
  'operations.reservations.spaces': { SUPER_ADMIN:'EDIT', HR_ADMIN:'EDIT', BRANCH_MANAGER:'EDIT' },
  'operations.reservations.reports': { SUPER_ADMIN:'VIEW', BRANCH_MANAGER:'VIEW' },
  'operations.reservations.settings': { SUPER_ADMIN:'EDIT', BRANCH_MANAGER:'EDIT' },
  'system.users': { SUPER_ADMIN:'EDIT', IT_ADMIN:'EDIT', HR_ADMIN:'VIEW', BRANCH_MANAGER:'EDIT' },
  'system.password-resets': { SUPER_ADMIN:'EDIT', IT_ADMIN:'EDIT' },
  'system.module-access': { SUPER_ADMIN:'EDIT', IT_ADMIN:'EDIT' },
  'system.branches': { SUPER_ADMIN:'EDIT', IT_ADMIN:'VIEW', HR_ADMIN:'VIEW', BRANCH_MANAGER:'VIEW' },
  'people.my-profile': { SUPER_ADMIN:'EDIT', IT_ADMIN:'EDIT', HR_ADMIN:'EDIT', BRANCH_MANAGER:'EDIT', STAFF:'EDIT', EMPLOYEE:'EDIT' },
  'people.my-portal': { SUPER_ADMIN:'EDIT', IT_ADMIN:'EDIT', HR_ADMIN:'EDIT', BRANCH_MANAGER:'EDIT', STAFF:'EDIT', EMPLOYEE:'EDIT' },
  'people.my-leave': { SUPER_ADMIN:'EDIT', IT_ADMIN:'EDIT', HR_ADMIN:'EDIT', BRANCH_MANAGER:'EDIT', STAFF:'EDIT', EMPLOYEE:'EDIT' },
};

const entry = (key: string, label: string, path: string, parentKey?: string, critical = false): ModulePermission => {
  const defaults = ROLE_MODULE_DEFAULTS[key] ?? {};
  return { key, label, path, ...(parentKey ? { parentKey } : {}), ceiling: Object.keys(defaults).filter(role => defaults[role as RoleName] !== 'DENY') as RoleName[], editCeiling: Object.keys(defaults).filter(role => defaults[role as RoleName] === 'EDIT') as RoleName[], ...(critical ? { critical } : {}) };
};
export const MODULE_PERMISSION_REGISTRY: readonly ModulePermission[] = [
  entry('workspace.overview','Overview','/'),
  entry('hr.dashboard','HR dashboard','/hr'),
  entry('hr.employees','Employees','/employees'),
  entry('hr.employee-profile','Employee 201 file','/employees/:id','hr.employees'),
  entry('hr.attendance','Attendance','/attendance'),
  entry('hr.leave','Leave management','/leave'),
  entry('hr.leave.balances','Leave balances','/leave/balances','hr.leave'),
  entry('hr.leave.reports','Leave reports','/leave/reports','hr.leave'),
  entry('hr.leave.settings','Leave settings','/leave/settings','hr.leave'),
  entry('work.tasks','Tasks','/tasks'),
  entry('work.incidents','Incidents','/incidents'),
  entry('operations.reservations','Reservations','/reservations'),
  entry('operations.reservations.list','Reservation list','/reservations/list','operations.reservations'),
  entry('operations.reservations.spaces','Manage spaces','/reservations/spaces','operations.reservations'),
  entry('operations.reservations.reports','Reservation reports','/reservations/reports','operations.reservations'),
  entry('operations.reservations.settings','Reservation settings','/reservations/settings','operations.reservations'),
  entry('system.users','User access','/system/users',undefined,true),
  entry('system.password-resets','Password reset requests','/system/password-reset-requests','system.users',true),
  entry('system.module-access','Module access','/system/module-access','system.users',true),
  entry('system.branches','Branches','/branches'),
  entry('people.my-profile','My profile','/my-profile'),
  entry('people.my-portal','My portal','/me'),
  entry('people.my-leave','Leave','/my-leave'),
];
export function registryEntry(key: string) { return MODULE_PERMISSION_REGISTRY.find(item => item.key === key); }
export function defaultModuleAccess(item: ModulePermission, role: RoleName): ModuleAccessLevel { return ROLE_MODULE_DEFAULTS[item.key]?.[role] ?? 'DENY'; }
