import { describe, expect, it } from 'vitest';
import { MODULE_PERMISSION_REGISTRY, defaultModuleAccess } from './module-registry.js';
import type { RoleName } from '../roles/role.service.js';

const roles: RoleName[] = ['SUPER_ADMIN','IT_ADMIN','HR_ADMIN','BRANCH_MANAGER','STAFF','EMPLOYEE'];
const expected: Record<string, string> = {
  'workspace.overview':'VVVVVV', 'hr.dashboard':'V-VV--',
  'hr.employees':'E-EV--', 'hr.employee-profile':'E-EE--',
  'hr.attendance':'E-EE--', 'hr.leave':'E-EE--',
  'hr.leave.balances':'E-EE--', 'hr.leave.reports':'V-VV--',
  'work.tasks':'EEEEEE', 'work.incidents':'EEEEEE',
  'operations.reservations.list':'E-EE--',
  'operations.reservations.spaces':'E-EE--',
  'operations.reservations.reports':'V--V--',
  'operations.reservations.settings':'E--E--',
  'system.users':'EEVE--', 'system.password-resets':'EE----',
  'system.module-access':'EE----', 'system.branches':'EVVV--',
  'people.my-profile':'EEEEEE', 'people.my-portal':'EEEEEE',
  'people.my-leave':'EEEEEE',
};
describe('role module defaults', () => {
  it('matches the requested matrix and denies unconfigured modules', () => {
    for (const [key, levels] of Object.entries(expected)) {
      const item = MODULE_PERMISSION_REGISTRY.find(entry => entry.key === key);
      expect(item, key).toBeDefined();
      expect(roles.map(role => ({ VIEW:'V', EDIT:'E', DENY:'-' })[defaultModuleAccess(item!, role)]).join(''), key).toBe(levels);
    }
    expect(defaultModuleAccess({ key:'future.module',label:'Future',path:'/future',ceiling:[] },'SUPER_ADMIN')).toBe('DENY');
  });
});
