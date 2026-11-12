import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedRequest, AuthUserContext } from './auth.context.js';
import { EmployeeController } from '../../hr/employees/employee.controller.js';
import { EmployeeService } from '../../hr/employees/employee.service.js';
import { UserService } from '../users/user.service.js';
import { DtrService } from '../../hr/attendance/dtr.service.js';
import { LeaveService } from '../../hr/leaves/leave.service.js';
import { UserController } from '../users/user.controller.js';
import { BranchService } from '../branches/branches.service.js';
import { AuthService } from './auth.service.js';
import type { DataSource } from 'typeorm';

const manager: AuthUserContext = { userId:'manager',email:'manager@example.test',role:'BRANCH_MANAGER',branchId:'first',branchIds:['first','second'],scope:'BRANCH' };
describe('selected administrator branch boundaries',()=>{
 it('allows only Super Admin to set selected or all Branch Manager grants', async()=>{
  const users=new UserService();
  vi.spyOn(users,'findById').mockResolvedValue({id:'target',role:'BRANCH_MANAGER'} as Awaited<ReturnType<UserService['findById']>>);
  const branches=new BranchService();
  const save=vi.spyOn(branches,'saveAdminBranchAccess').mockResolvedValue(undefined);
  const controller=new UserController(users,branches,new AuthService());
  const actor={...manager,role:'SUPER_ADMIN' as const};
  await expect(controller.saveAdminBranchAccess({user:{...actor,role:'IT_ADMIN'}} as AuthenticatedRequest,'target',{mode:'SELECTED',branchIds:['first','second']})).rejects.toThrow('Only a Super Admin');
  await expect(controller.updateRole('target',{user:{...actor,role:'IT_ADMIN'}} as AuthenticatedRequest,{role:'BRANCH_MANAGER',employeeId:'employee',branchId:'first'})).rejects.toThrow('Only a Super Admin');
  await controller.saveAdminBranchAccess({user:actor} as AuthenticatedRequest,'target',{mode:'ALL',branchIds:[]});
  expect(save).toHaveBeenCalledWith('target',{mode:'ALL',branchIds:[]},'manager');
  await controller.saveAdminBranchAccess({user:actor} as AuthenticatedRequest,'target',{mode:'SELECTED',branchIds:['first','second']});
  expect(save).toHaveBeenCalledWith('target',{mode:'SELECTED',branchIds:['first','second']},'manager');
 });
 it('reads only selected employee branches and rejects a different explicit filter',async()=>{
  const employees=new EmployeeService(),users=new UserService();
  const list=vi.spyOn(employees,'list').mockImplementation(async branchId=>[{id:branchId!,branchId:branchId!,name:branchId!,employeeNumber:'EMP001',email:'person@example.test',position:'Staff',department:'Ops',status:'ACTIVE',employment:{employeeType:'FULL_TIME',startDate:'2024-01-01'}}]);
  const controller=new EmployeeController(employees,users);
  const result=await controller.list({user:manager} as AuthenticatedRequest);
  expect(result.map(employee=>employee.branchId)).toEqual(['first','second']);
  expect(list.mock.calls.map(args=>args[0])).toEqual(['first','second']);
  await expect(controller.list({user:manager} as AuthenticatedRequest,'third')).rejects.toThrow('Branch access denied');
 });
 it('permits DTR operations in a selected secondary branch and denies other branches/IT roles',()=>{
  const dtr=new DtrService({} as DataSource);
  expect(()=>dtr.requireManager(manager,'second','IMPORT')).not.toThrow();
  expect(()=>dtr.requireManager(manager,'third','IMPORT')).toThrow('Branch access denied');
  expect(()=>dtr.requireManager({...manager,role:'IT_ADMIN'},'second','IMPORT')).toThrow('Attendance management access denied');
 });
 it('applies selected branches to leave reads and decisions',async()=>{
  const leave=new LeaveService({} as DataSource);
  expect(await leave.scope(manager)).toEqual(['first','second']);
  expect(await leave.scope(manager,'second')).toEqual(['second']);
  await expect(leave.scope(manager,'third')).rejects.toThrow('Branch access denied');
 });
 it.each(['HR_ADMIN','BRANCH_MANAGER','STAFF','EMPLOYEE'] as const)('does not allow %s to grant administrator branch access',async role=>{
  const controller=new UserController(new UserService(),new BranchService(),new AuthService());
  await expect(controller.saveAdminBranchAccess({user:{...manager,role}} as AuthenticatedRequest,'target',{mode:'ALL',branchIds:[]})).rejects.toThrow('Administrator account access management required');
 });
});
