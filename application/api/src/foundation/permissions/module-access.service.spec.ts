import { describe, expect, it, vi } from 'vitest';
import type { DataSource } from 'typeorm';
import { ForbiddenException } from '@nestjs/common';
import { ModuleAccessService } from './module-access.service.js';
import type { AuthUserContext } from '../auth/auth.context.js';

const actor = (role:AuthUserContext['role'],userId='actor'):AuthUserContext => ({userId,email:'actor@example.test',role,branchId:'branch-a',branchIds:['branch-a'],scope:'BRANCH'});

describe('module access service',()=>{
  it('scopes IT preview account listing to assigned branches',async()=>{
    const query=vi.fn(async(_sql:string,_params?:unknown[])=>[]);
    const service=new ModuleAccessService({query} as unknown as DataSource);
    await service.listAccounts(actor('IT_ADMIN'));
    expect(query.mock.calls[0]?.[1]).toEqual([null,'IT_ADMIN',null,['branch-a'],false]);
    await expect(service.listAccounts(actor('IT_ADMIN'),'branch-b')).rejects.toThrow('Branch access denied');
  });
  it('applies a parent deny to nested pages while preserving role defaults',async()=>{
    const query=vi.fn(async(sql:string)=>{
      if(sql.includes('FROM users')) return [{id:'target',name:'Target',email:'target@example.test',role:'HR_ADMIN',employeeId:'e1',branchId:'branch-a',status:'ACTIVE'}];
      if(sql.includes('FROM user_module_permissions')) return [{permissionKey:'hr.leave',effect:'DENY',updatedAt:new Date()}];
      return [];
    });
    const service=new ModuleAccessService({query} as unknown as DataSource);
    const access=await service.effective('target',actor('SUPER_ADMIN'));
    expect(access.permissions.find(item=>item.key==='hr.leave')?.allowed).toBe(false);
    expect(access.permissions.find(item=>item.key==='hr.leave.reports')?.allowed).toBe(false);
    expect(access.permissions.find(item=>item.key==='hr.leave.reports')?.viewAllowed).toBe(false);
    expect(access.permissions.find(item=>item.key==='hr.employees')?.allowed).toBe(true);
    expect(access.permissions.find(item=>item.key==='hr.employees')?.manageable).toBe(true);
  });

  it('keeps child page edit permission independent of a view-only parent',async()=>{
    const query=vi.fn(async(sql:string,params?:unknown[])=>{
      if(sql.includes('FROM users')) return [{id:params?.[0],name:'Target',email:'target@example.test',role:'HR_ADMIN',employeeId:'e1',branchId:'branch-a',status:'ACTIVE'}];
      if(sql.includes('FROM user_module_permissions')) return [{permissionKey:'hr.leave',effect:'VIEW',updatedAt:new Date()}];
      return [];
    });
    const service=new ModuleAccessService({query} as unknown as DataSource);
    const access=await service.effective('target',actor('SUPER_ADMIN'));
    expect(access.permissions.find(item=>item.key==='hr.leave')?.accessLevel).toBe('VIEW');
    expect(access.permissions.find(item=>item.key==='hr.leave.settings')?.accessLevel).toBe('EDIT');
    expect(access.permissions.find(item=>item.key==='hr.leave.settings')?.editAllowed).toBe(true);
    expect(access.permissions.find(item=>item.key==='hr.employees')?.accessLevel).toBe('EDIT');
    expect(access.permissions.find(item=>item.key==='hr.dashboard')?.accessLevel).toBe('VIEW');
    expect(access.permissions.find(item=>item.key==='hr.dashboard')?.editAllowed).toBe(true);
  });

  it('persists denied-to-view and view-to-edit grants beyond the target role default ceiling', async () => {
    let storedEffect: 'VIEW' | 'EDIT' | 'DENY' = 'DENY';
    const manager = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        if (sql.includes('SELECT role,status')) return [{ role: 'EMPLOYEE', status: 'ACTIVE' }];
        if (sql.includes('SELECT effect FROM user_module_permissions')) return [{ effect: storedEffect }];
        if (sql.includes('INSERT INTO user_module_permissions')) storedEffect = params?.[2] as typeof storedEffect;
        return [];
      }),
    };
    const dataSource = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        if (sql.includes('FROM users')) return [{ id: params?.[0], name: 'Target', email: 'target@example.test', role: 'EMPLOYEE', employeeId: 'e1', branchId: 'branch-a', status: 'ACTIVE' }];
        if (sql.includes('FROM user_module_permissions')) return [{ permissionKey: 'hr.employees', effect: storedEffect, updatedAt: new Date() }];
        return [];
      }),
      transaction: vi.fn(async (work: (value: typeof manager) => Promise<unknown>) => work(manager)),
    };
    const service = new ModuleAccessService(dataSource as unknown as DataSource);

    const view = await service.update('target', ['hr.employees'], 'VIEW', actor('SUPER_ADMIN'));
    expect(storedEffect).toBe('VIEW');
    expect(view.permissions.find(item => item.key === 'hr.employees')?.accessLevel).toBe('VIEW');

    const edit = await service.update('target', ['hr.employees'], 'EDIT', actor('SUPER_ADMIN'));
    expect(storedEffect).toBe('EDIT');
    expect(edit.permissions.find(item => item.key === 'hr.employees')?.accessLevel).toBe('EDIT');
  });

  it('keeps Employee self-service editable while denying employee-directory access',async()=>{
    const query=vi.fn(async(sql:string,params?:unknown[])=>{
      if(sql.includes('FROM users')) return [{id:params?.[0],name:'Employee',email:'employee@example.test',role:'EMPLOYEE',employeeId:'e1',branchId:'branch-a',status:'ACTIVE'}];
      return [];
    });
    const service=new ModuleAccessService({query} as unknown as DataSource);
    const access=await service.effective('employee',actor('SUPER_ADMIN'));
    expect(access.permissions.find(item=>item.key==='people.my-portal')?.accessLevel).toBe('EDIT');
    expect(access.permissions.find(item=>item.key==='people.my-leave')?.accessLevel).toBe('EDIT');
    expect(access.permissions.find(item=>item.key==='hr.employees')?.accessLevel).toBe('DENY');
    expect(access.permissions.find(item=>item.key==='hr.employees')?.viewAllowed).toBe(true);
    expect(access.permissions.find(item=>item.key==='hr.employees')?.editAllowed).toBe(true);
  });

  it('lets IT Admin change modules where their own effective access is Edit, but not others',async()=>{
    let targetEffect: 'VIEW'|'EDIT'|'DENY'|null = null;
    const manager={query:vi.fn(async(sql:string,params?:unknown[])=>{
      if(sql.includes('SELECT role,status')) return [{role:'EMPLOYEE',status:'ACTIVE'}];
      if(sql.includes('SELECT effect FROM user_module_permissions')) return targetEffect?[{effect:targetEffect}]:[];
      if(sql.includes('INSERT INTO user_module_permissions')) targetEffect=params?.[2] as typeof targetEffect;
      return [];
    })};
    const dataSource={
      query:vi.fn(async(sql:string,params?:unknown[])=>{
        if(sql.includes('FROM users')) return [{id:params?.[0],name:'Target',email:'target@example.test',role:params?.[0]==='actor'?'IT_ADMIN':'EMPLOYEE',employeeId:'e1',branchId:'branch-a',status:'ACTIVE'}];
        if(sql.includes('FROM user_module_permissions')) return [];
        return [];
      }),
      transaction:vi.fn(async(work:(value:typeof manager)=>Promise<unknown>)=>work(manager)),
    };
    const service=new ModuleAccessService(dataSource as unknown as DataSource);
    const preview=await service.effective('target',actor('IT_ADMIN'));
    expect(preview.permissions.find(item=>item.key==='work.tasks')?.manageable).toBe(true);
    expect(preview.permissions.find(item=>item.key==='hr.attendance')?.manageable).toBe(false);
    await service.update('target',['work.tasks'],'VIEW',actor('IT_ADMIN'));
    expect(targetEffect).toBe('VIEW');
    await expect(service.update('target',['hr.attendance'],'DENY',actor('IT_ADMIN'))).rejects.toThrow('You can only manage modules where you have edit access.');
    await expect(service.update('actor',['work.tasks'],'DENY',actor('IT_ADMIN'))).rejects.toThrow('You cannot change your own module access.');
  });

  it('applies delegated IT Admin bulk changes transactionally and rejects out-of-authority modules',async()=>{
    const managerQuery=vi.fn(async(sql:string,params?:unknown[])=>{
      if(sql.includes('SELECT id,status')) return [{id:'target',status:'ACTIVE'}];
      return [];
    });
    const dataSource={
      query:vi.fn(async(sql:string,params?:unknown[])=>{
        if(sql.includes('FROM users')) return [{id:params?.[0],name:'Account',email:'account@example.test',role:params?.[0]==='actor'?'IT_ADMIN':'EMPLOYEE',employeeId:'e1',branchId:'branch-a',status:'ACTIVE'}];
        return [];
      }),
      transaction:vi.fn(async(work:(value:{query:typeof managerQuery})=>Promise<unknown>)=>work({query:managerQuery})),
    };
    const service=new ModuleAccessService(dataSource as unknown as DataSource);
    await expect(service.bulk(['target'],'work.tasks','VIEW',actor('IT_ADMIN'))).resolves.toMatchObject({updatedUserIds:['target'],permissionKey:'work.tasks',effect:'VIEW'});
    expect(dataSource.transaction).toHaveBeenCalledOnce();
    await expect(service.bulk(['target'],'hr.attendance','DENY',actor('IT_ADMIN'))).rejects.toThrow('You can only manage modules where you have edit access.');
  });

  it('preserves full access for Super Admin accounts and prevents overrides',async()=>{
    const query=vi.fn(async(sql:string)=>sql.includes('FROM users')?[{id:'root',name:'Root',email:'root@example.test',role:'SUPER_ADMIN',employeeId:null,branchId:null,status:'ACTIVE'}]:[]);
    const service=new ModuleAccessService({query} as unknown as DataSource);
    const access=await service.effective('root',actor('SUPER_ADMIN','root'));
    expect(access.permissions.every(item=>item.allowed)).toBe(true);
    await expect(service.update('root',['hr.employees'],'DENY',actor('SUPER_ADMIN','someone-else'))).rejects.toThrow(ForbiddenException);
  });

  it('prevents self escalation and branch-crossing account inspection',async()=>{
    const query=vi.fn(async(sql:string)=>sql.includes('FROM users')?[{id:'target',name:'Target',email:'target@example.test',role:'HR_ADMIN',employeeId:'e1',branchId:'branch-b',status:'ACTIVE'}]:[]);
    const service=new ModuleAccessService({query} as unknown as DataSource);
    await expect(service.update('target',['hr.employees'],'ALLOW',actor('SUPER_ADMIN','target'))).rejects.toThrow(ForbiddenException);
    await expect(service.effective('target',actor('IT_ADMIN'))).rejects.toThrow(ForbiddenException);
  });

  it('does not let even a Super Admin override critical administrator permissions',async()=>{
    const query=vi.fn(async(sql:string)=>sql.includes('FROM users')?[{id:'employee',name:'Employee',email:'employee@example.test',role:'EMPLOYEE',employeeId:'e1',branchId:'branch-a',status:'ACTIVE'}]:[]);
    const service=new ModuleAccessService({query} as unknown as DataSource);
    await expect(service.update('employee',['system.users'],'EDIT',actor('SUPER_ADMIN'))).rejects.toThrow('Critical account recovery');
  });

  it('commits a bulk assignment and its audit rows in one transaction',async()=>{
    const managerQuery=vi.fn(async(sql:string)=>sql.includes('SELECT id,status')?[{id:'e1',status:'ACTIVE'},{id:'e2',status:'ACTIVE'}]:[]);
    const manager={query:managerQuery};
    const dataSource={query:vi.fn(async(sql:string,params:string[])=>sql.includes('FROM users')?[{id:params[0],name:params[0],email:'employee@example.test',role:'EMPLOYEE',employeeId:params[0],branchId:'branch-a',status:'ACTIVE'}]:[]),transaction:vi.fn(async(work:(value:typeof manager)=>Promise<unknown>)=>work(manager))};
    const service=new ModuleAccessService(dataSource as unknown as DataSource);
    const result=await service.bulk(['e1','e2'],'hr.employees','DENY',actor('SUPER_ADMIN'));
    expect(result.updatedUserIds).toEqual(['e1','e2']);
    expect(dataSource.transaction).toHaveBeenCalledOnce();
    expect(managerQuery.mock.calls.filter(([sql])=>sql.includes('INSERT INTO user_module_permission_audit'))).toHaveLength(2);
  });

  it('saves an individual override and records actor, target, branch, and old/new effect',async()=>{
    const auditParams:unknown[][]=[];
    const managerQuery=vi.fn(async(sql:string,params:unknown[])=>{if(sql.includes('INSERT INTO user_module_permission_audit'))auditParams.push(params);return sql.includes('SELECT role,status')?[{role:'EMPLOYEE',status:'ACTIVE'}]:[];});
    const dataSource={query:vi.fn(async(sql:string,params:unknown[])=>sql.includes('FROM users')?[{id:params[0],name:'Employee',email:'employee@example.test',role:'EMPLOYEE',employeeId:'e1',branchId:'branch-a',status:'ACTIVE'}]:[]),transaction:vi.fn(async(work:(value:{query:typeof managerQuery})=>Promise<unknown>)=>work({query:managerQuery}))};
    const service=new ModuleAccessService(dataSource as unknown as DataSource);
    await service.update('employee',['hr.attendance'],'DENY',actor('SUPER_ADMIN','root'));
    expect(dataSource.transaction).toHaveBeenCalledOnce();
    expect(auditParams[0]?.slice(1)).toEqual(['root','employee','branch-a','hr.attendance',null,'DENY']);
  });
});
