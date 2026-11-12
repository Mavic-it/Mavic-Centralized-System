import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import type { AuthUserContext } from '../auth/auth.context.js';
import { MODULE_PERMISSION_REGISTRY, defaultModuleAccess, registryEntry } from './module-registry.js';

export type ModuleAccessMode = 'VIEW' | 'EDIT' | 'DENY';
export type ModuleAccessChangeEffect = 'INHERIT' | ModuleAccessMode;

export class ModuleAccessService {
  constructor(private readonly dataSource: DataSource) {}

  async listAccounts(actor: AuthUserContext, branchId?: string, search?: string) {
    if (!['SUPER_ADMIN','IT_ADMIN'].includes(actor.role)) throw new ForbiddenException('Module access administration is restricted.');
    const scopedBranches = this.actorBranches(actor);
    if (branchId && scopedBranches && !scopedBranches.includes(branchId)) throw new ForbiddenException('Branch access denied.');
    return this.dataSource.query(`SELECT u.id,COALESCE(e.name,u.name) AS name,u.email,u.role,u.employee_id AS "employeeId",COALESCE(e.branch_id,u.branch_id) AS "branchId",b.name AS "branchName",u.status FROM users u LEFT JOIN employees e ON e.id=u.employee_id LEFT JOIN branches b ON b.id=COALESCE(e.branch_id,u.branch_id) WHERE u.status='ACTIVE' AND ($1::text IS NULL OR e.branch_id=$1 OR u.branch_id=$1 OR (u.role='SUPER_ADMIN' AND $2='SUPER_ADMIN')) AND ($3::text IS NULL OR u.name ILIKE '%'||$3||'%' OR e.name ILIKE '%'||$3||'%' OR u.role ILIKE '%'||$3||'%') AND ($2='SUPER_ADMIN' OR (u.role<>'SUPER_ADMIN' AND ($5::boolean OR COALESCE(e.branch_id,u.branch_id)=ANY($4::varchar[])))) ORDER BY u.role,u.name`, [branchId ?? null, actor.role, search?.trim() || null, scopedBranches ?? [], scopedBranches === undefined]);
  }

  async effective(userId: string, actor: AuthUserContext) {
    const target = await this.target(userId, actor);
    const rows = await this.dataSource.query<{permissionKey:string;effect:'ALLOW'|ModuleAccessMode;updatedAt:Date|string}[]>(`SELECT permission_key AS "permissionKey",effect,updated_at AS "updatedAt" FROM user_module_permissions WHERE user_id=$1`, [userId]);
    const overrides = new Map(rows.map(r => [r.permissionKey,r]));
    const actorRows = actor.role === 'SUPER_ADMIN' || actor.userId === userId
      ? rows
      : await this.dataSource.query<{permissionKey:string;effect:'ALLOW'|ModuleAccessMode;updatedAt:Date|string}[]>(`SELECT permission_key AS "permissionKey",effect,updated_at AS "updatedAt" FROM user_module_permissions WHERE user_id=$1`, [actor.userId]);
    const actorOverrides = new Map(actorRows.map(r => [r.permissionKey,r]));
    const permissions = MODULE_PERMISSION_REGISTRY.map(item => {
      const override = overrides.get(item.key);
      const roleDefaultAccess: ModuleAccessMode = defaultModuleAccess(item, target.role as never);
      // Role ceilings determine inherited defaults. Explicit per-user grants can
      // open ordinary modules; parent denies and critical-module protections remain absolute.
      const effect: ModuleAccessMode | null = target.role === 'SUPER_ADMIN'
        ? null
        : override?.effect === 'ALLOW' ? 'EDIT' : override?.effect ?? null;
      const accessLevel: ModuleAccessMode = target.role === 'SUPER_ADMIN' ? roleDefaultAccess
        : item.critical ? roleDefaultAccess
        : effect ?? roleDefaultAccess;
      return {
        ...item,
        manageable: !item.critical && (actor.role === 'SUPER_ADMIN' || this.accessFor(item, actor.role, actorOverrides) === 'EDIT'),
        roleDefault: roleDefaultAccess !== 'DENY',
        roleDefaultAccess,
        viewAllowed: target.role !== 'SUPER_ADMIN' && !item.critical,
        editAllowed: target.role !== 'SUPER_ADMIN' && !item.critical,
        override: effect,
        accessLevel,
        allowed: accessLevel !== 'DENY',
        source: (effect ? 'OVERRIDE' : 'ROLE') as 'OVERRIDE'|'ROLE'|'INHERITED',
      };
    });
    const byKey = new Map(permissions.map(item => [item.key,item]));
    for (const item of permissions) {
      let parent = item.parentKey ? byKey.get(item.parentKey) : undefined;
      while (parent) {
        if (parent.override === 'DENY') {
          item.accessLevel = 'DENY';
          item.viewAllowed = false;
          item.editAllowed = false;
        }
        item.allowed = item.accessLevel !== 'DENY';
        if (item.accessLevel !== (item.override ?? item.roleDefaultAccess) && item.source === 'ROLE') item.source = 'INHERITED';
        parent = parent.parentKey ? byKey.get(parent.parentKey) : undefined;
      }
    }
    return { user: target, permissions };
  }

  async update(userId: string, permissionKeys: string[], effect: ModuleAccessChangeEffect, actor: AuthUserContext) {
    return this.updateBatch(userId,permissionKeys.map(permissionKey=>({permissionKey,effect})),actor);
  }

  async updateBatch(userId: string, changes: Array<{permissionKey:string;effect:ModuleAccessChangeEffect}>, actor: AuthUserContext) {
    if (!['SUPER_ADMIN','IT_ADMIN'].includes(actor.role)) throw new ForbiddenException('Module access changes are restricted to authorized administrators.');
    if (!changes.length || new Set(changes.map(change=>change.permissionKey)).size!==changes.length || changes.some(change => !registryEntry(change.permissionKey))) throw new BadRequestException('Choose unique registered module permissions.');
    const target = await this.target(userId, actor);
    if (target.role === 'SUPER_ADMIN') throw new ForbiddenException('Super Admin access is protected from module overrides.');
    if (actor.userId === userId) throw new ForbiddenException('You cannot change your own module access.');
    if (changes.some(change=>change.effect!=='INHERIT'&&registryEntry(change.permissionKey)?.critical)) throw new ForbiddenException('Critical account recovery and administrator access must remain inherited.');
    if (actor.role !== 'SUPER_ADMIN') {
      const actorAccess = await this.effective(actor.userId, actor);
      if (changes.some(change => actorAccess.permissions.find(item => item.key === change.permissionKey)?.manageable !== true)) throw new ForbiddenException('You can only manage modules where you have edit access.');
    }
    if (changes.some(change=>change.effect==='VIEW'||change.effect==='EDIT')) {
      const effective = await this.effective(userId, actor);
      for (const change of changes.filter(item=>item.effect==='VIEW'||item.effect==='EDIT')) {
        const targetPermission = effective.permissions.find(permission => permission.key === change.permissionKey);
        if (!targetPermission || (change.effect === 'VIEW' && !targetPermission.viewAllowed) || (change.effect === 'EDIT' && !targetPermission.editAllowed)) throw new ForbiddenException('Access must stay within the target role ceiling.');
      }
    }
    const branchId = target.branchId ?? null;
    await this.dataSource.transaction(async manager => {
      const [locked] = await manager.query<{role:string;status:string}[]>(`SELECT role,status FROM users WHERE id=$1 FOR UPDATE`,[userId]);
      if (!locked || locked.status !== 'ACTIVE') throw new NotFoundException('Active account not found.');
      for (const change of changes) {
        const key=change.permissionKey;
        const [before] = await manager.query<{effect:'ALLOW'|ModuleAccessMode}[]>(`SELECT effect FROM user_module_permissions WHERE user_id=$1 AND permission_key=$2 FOR UPDATE`,[userId,key]);
        if (change.effect === 'INHERIT') await manager.query(`DELETE FROM user_module_permissions WHERE user_id=$1 AND permission_key=$2`,[userId,key]);
        else await manager.query(`INSERT INTO user_module_permissions(user_id,permission_key,effect,updated_by) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,permission_key) DO UPDATE SET effect=EXCLUDED.effect,updated_by=EXCLUDED.updated_by,updated_at=now()`,[userId,key,change.effect,actor.userId]);
        const next = change.effect === 'INHERIT' ? null : change.effect;
        if ((before?.effect ?? null) !== next) await manager.query(`INSERT INTO user_module_permission_audit(id,actor_user_id,target_user_id,branch_id,permission_key,old_value,new_value,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,now())`,[randomUUID(),actor.userId,userId,branchId,key,before?.effect??null,next]);
      }
    });
    return this.effective(userId, actor);
  }

  async bulk(userIds:string[],permissionKey:string,effect:ModuleAccessChangeEffect,actor:AuthUserContext){
    if(!['SUPER_ADMIN','IT_ADMIN'].includes(actor.role))throw new ForbiddenException('Module access changes are restricted to authorized administrators.');
    if(!userIds.length||new Set(userIds).size!==userIds.length||userIds.length>100||!registryEntry(permissionKey))throw new BadRequestException('Choose up to 100 unique accounts and a registered permission.');
    if(actor.role!=='SUPER_ADMIN'&&(await this.effective(actor.userId,actor)).permissions.find(item=>item.key===permissionKey)?.manageable!==true)throw new ForbiddenException('You can only manage modules where you have edit access.');
    const targets=await Promise.all(userIds.map(id=>this.target(id,actor)));
    if(targets.some(target=>target.role==='SUPER_ADMIN'||target.id===actor.userId))throw new ForbiddenException('Super Admin accounts and your own account cannot be changed.');
    if(effect==='VIEW'){
      const targetSnapshots=await Promise.all(targets.map(target=>this.effective(target.id,actor)));
      if(targetSnapshots.some(snapshot=>!snapshot.permissions.find(permission=>permission.key===permissionKey)?.viewAllowed))throw new ForbiddenException('View access must stay within every target role ceiling.');
    }
    if(effect==='EDIT'){
      const targetSnapshots=await Promise.all(targets.map(target=>this.effective(target.id,actor)));
      if(targetSnapshots.some(snapshot=>!snapshot.permissions.find(permission=>permission.key===permissionKey)?.editAllowed))throw new ForbiddenException('Edit access must stay within every target role ceiling.');
    }
    if(effect!=='INHERIT'&&registryEntry(permissionKey)!.critical)throw new ForbiddenException('Critical account recovery and administrator access must remain inherited.');
    await this.dataSource.transaction(async manager=>{
      const locked=await manager.query<{id:string;status:string}[]>(`SELECT id,status FROM users WHERE id=ANY($1::varchar[]) ORDER BY id FOR UPDATE`,[userIds]);
      if(locked.length!==userIds.length||locked.some(target=>target.status!=='ACTIVE'))throw new NotFoundException('Every selected account must remain active.');
      for(const target of targets){
        const [before]=await manager.query<{effect:'ALLOW'|ModuleAccessMode}[]>(`SELECT effect FROM user_module_permissions WHERE user_id=$1 AND permission_key=$2 FOR UPDATE`,[target.id,permissionKey]);
        if(effect==='INHERIT')await manager.query(`DELETE FROM user_module_permissions WHERE user_id=$1 AND permission_key=$2`,[target.id,permissionKey]);
        else await manager.query(`INSERT INTO user_module_permissions(user_id,permission_key,effect,updated_by) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,permission_key) DO UPDATE SET effect=EXCLUDED.effect,updated_by=EXCLUDED.updated_by,updated_at=now()`,[target.id,permissionKey,effect,actor.userId]);
        if((before?.effect??null)!==(effect==='INHERIT'?null:effect))await manager.query(`INSERT INTO user_module_permission_audit(id,actor_user_id,target_user_id,branch_id,permission_key,old_value,new_value,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,now())`,[randomUUID(),actor.userId,target.id,target.branchId,permissionKey,before?.effect??null,effect==='INHERIT'?null:effect]);
      }
    });
    return {updatedUserIds:userIds,permissionKey,effect};
  }

  private async target(userId: string, actor: AuthUserContext) {
    const [target] = await this.dataSource.query<{id:string;name:string;email:string;role:string;employeeId:string|null;branchId:string|null;status:string}[]>(`SELECT u.id,COALESCE(e.name,u.name) AS name,u.email,u.role,u.employee_id AS "employeeId",COALESCE(e.branch_id,u.branch_id) AS "branchId",u.status FROM users u LEFT JOIN employees e ON e.id=u.employee_id WHERE u.id=$1 AND u.status='ACTIVE'`,[userId]);
    if (!target) throw new NotFoundException('Active account not found.');
    if (target.branchId && this.actorBranches(actor) && !this.actorBranches(actor)!.includes(target.branchId)) throw new ForbiddenException('Account branch access denied.');
    if (target.role === 'SUPER_ADMIN' && actor.role !== 'SUPER_ADMIN') throw new ForbiddenException('Super Admin accounts are protected.');
    return target;
  }

  private actorBranches(actor: AuthUserContext): string[] | undefined {
    if (actor.role === 'SUPER_ADMIN') return undefined;
    if (actor.branchIds !== undefined) return actor.branchIds;
    if (actor.allBranches) return undefined;
    return actor.branchId ? [actor.branchId] : [];
  }

  private accessFor(
    item: (typeof MODULE_PERMISSION_REGISTRY)[number],
    role: AuthUserContext['role'],
    overrides: Map<string, { effect: 'ALLOW' | ModuleAccessMode }>,
  ): ModuleAccessMode {
    const ownEffect = item.critical ? undefined : overrides.get(item.key)?.effect;
    const ownMode: ModuleAccessMode = ownEffect === 'ALLOW' ? 'EDIT' : ownEffect ?? defaultModuleAccess(item, role);
    if (ownMode === 'DENY') return 'DENY';
    let parent = item.parentKey ? registryEntry(item.parentKey) : undefined;
    while (parent) {
      const parentEffect = parent.critical ? undefined : overrides.get(parent.key)?.effect;
      const parentMode: ModuleAccessMode = parentEffect === 'ALLOW' ? 'EDIT' : parentEffect ?? defaultModuleAccess(parent, role);
      if (parentMode === 'DENY') return 'DENY';
      parent = parent.parentKey ? registryEntry(parent.parentKey) : undefined;
    }
    return ownMode;
  }

}
