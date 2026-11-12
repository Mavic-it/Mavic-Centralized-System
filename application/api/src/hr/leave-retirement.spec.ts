import 'reflect-metadata';
import {describe,expect,it} from 'vitest';
import {HrModule} from './hr.module.js';
import {RoleService} from '../foundation/roles/role.service.js';
import {AuthorizationService} from '../security/authorization/authorization.service.js';
const roles=['SUPER_ADMIN','HR_ADMIN','BRANCH_MANAGER','IT_ADMIN','STAFF','EMPLOYEE'] as const;
describe('Retired leave capabilities',()=>{
 it.each(roles)('does not authorize leave operations for %s',role=>{
  const permissions=new RoleService();const authorization=new AuthorizationService();
  expect(permissions.listPermissions(role).some(permission=>permission.module==='leaves')).toBe(false);
  for(const action of ['VIEW','CREATE','APPROVE'] as const)for(const scope of ['OWN','BRANCH','ALL'] as const){
   expect(permissions.hasPermission(role,'leaves',action,scope)).toBe(false);
   expect(authorization.authorize({userId:'fixture',role,branchId:'branch',module:'leaves',action,scope}).allowed).toBe(false);
  }
 });
 it('retains employee and attendance endpoints alongside the new singular leave module',()=>{
  const controllers=Reflect.getMetadata('controllers',HrModule) as object[];
  const paths=controllers.map(controller=>Reflect.getMetadata('path',controller) as string);
  expect(paths).toContain('employees');expect(paths.some(path=>path.includes('attendance'))).toBe(true);expect(paths.some(path=>path.includes('leaves'))).toBe(false);
  const providers=Reflect.getMetadata('providers',HrModule) as Array<{provide?:{name:string}}>;
  expect(paths).toContain('leave');
  expect(providers.some(provider=>provider.provide?.name.includes('Leave'))).toBe(true);
 });
});
