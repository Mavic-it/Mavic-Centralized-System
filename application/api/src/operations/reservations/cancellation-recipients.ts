import { defaultModuleAccess, registryEntry } from '../../foundation/permissions/module-registry.js';
import type { RoleName } from '../../foundation/roles/role.service.js';

export function canViewReservations(role: RoleName, overrides: Record<string, string>): boolean {
  if (role === 'SUPER_ADMIN') return true;
  let entry = registryEntry('operations.reservations.list');
  while (entry) {
    const effect = overrides[entry.key];
    if (effect === 'DENY') return false;
    if (entry.key === 'operations.reservations.list' &&
      !['VIEW', 'EDIT', 'ALLOW'].includes(effect ?? '') && defaultModuleAccess(entry, role) === 'DENY') return false;
    entry = entry.parentKey ? registryEntry(entry.parentKey) : undefined;
  }
  return true;
}
