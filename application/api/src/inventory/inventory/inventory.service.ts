import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { DataSource, EntityManager } from 'typeorm';
import type {
  CreateInventoryCategoryDto,
  CreateInventoryItemDto,
  InventoryListQueryDto,
  RegisterInventoryBranchDto,
  UpdateInventoryCategoryDto,
  UpdateInventoryItemDto,
} from './inventory.dto.js';

export type InventoryCategory = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  itemCount: number;
};

export type InventoryItem = {
  id: string;
  name: string;
  sku: string;
  description: string | null;
  categoryId: string;
  category: string;
  itemType: string;
  trackingMethod: string;
  unit: string;
  reorderThreshold: number;
  maximumStockThreshold: number | null;
  purchasePrice: number | null;
  status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  onHand: number;
  reserved: number;
  quarantined: number;
  available: number;
  inTransit: number;
  registered: boolean;
};

export type InventoryMovement = {
  id: string;
  idempotencyKey: string;
  itemId: string;
  itemName: string;
  sku: string;
  branchId: string;
  branchName: string;
  movementType: string;
  quantity: number;
  quantityDelta: number;
  onHandBefore: number;
  onHandAfter: number;
  reason: string;
  performedBy: string | null;
  performedByName: string | null;
  createdAt: Date | string;
};

type BranchBalance = {
  itemId: string;
  branchId: string;
  storageLocation: string;
  onHand: number;
  reserved: number;
  quarantined: number;
  inTransit: number;
};

type MovementInput = {
  itemId: string;
  branchId: string;
  storageLocation?: string;
  quantity: number;
  reason: string;
  idempotencyKey: string;
  performedBy: string;
  movementType: 'RECEIPT' | 'ISSUE' | 'OPENING';
};

const itemFields = `ci.id,ci.name,ci.sku,ci.description,ci.category_id AS "categoryId",
  c.name AS category,ci.item_type AS "itemType",ci.tracking_method AS "trackingMethod",
  ci.unit,ci.reorder_threshold AS "reorderThreshold",
  ci.maximum_stock_threshold AS "maximumStockThreshold",ci.purchase_price AS "purchasePrice",
  ci.status,COALESCE(SUM(b.on_hand),0)::int AS "onHand",
  COALESCE(SUM(b.reserved),0)::int AS reserved,
  COALESCE(SUM(b.quarantined),0)::int AS quarantined,
  COALESCE(SUM(b.on_hand-b.reserved-b.quarantined),0)::int AS available,
  COALESCE(SUM(b.in_transit),0)::int AS "inTransit",
  count(b.item_id)>0 AS registered`;

@Injectable()
export class InventoryService {
  constructor(private readonly db: DataSource) {}

  async listAuthorizedBranches(branchIds: string[] | undefined) {
    return this.db.query<Array<{ id: string; name: string }>>(`
      SELECT id,name FROM branches
      WHERE is_active=true AND ($1::varchar[] IS NULL OR id=ANY($1::varchar[]))
      ORDER BY name,id
    `, [branchIds ?? null]);
  }

  async listCategories(branchIds?: string[]): Promise<InventoryCategory[]> {
    return this.db.query<InventoryCategory[]>(`
      SELECT c.id,c.name,c.description,c.is_active AS "isActive",count(ci.id)::int AS "itemCount"
      FROM inventory_categories c
      LEFT JOIN inventory_catalog_items ci ON ci.category_id=c.id
        AND ($1::varchar[] IS NULL OR EXISTS (
          SELECT 1 FROM inventory_balances cb WHERE cb.item_id=ci.id AND cb.branch_id=ANY($1::varchar[])
        ))
      WHERE c.is_active=true
      GROUP BY c.id,c.name,c.description,c.is_active
      ORDER BY lower(c.name),c.id
    `, [branchIds ?? null]);
  }

  async createCategory(input: CreateInventoryCategoryDto, actorId: string): Promise<InventoryCategory> {
    const name = input.name.trim();
    if (!name) throw new BadRequestException('Category name is required.');
    try {
      return await this.db.transaction(async manager => {
        const rows = await manager.query<InventoryCategory[]>(`
          INSERT INTO inventory_categories(id,name,description,created_by)
          VALUES($1,$2,$3,$4)
          RETURNING id,name,description,is_active AS "isActive",
            (SELECT count(*)::int FROM inventory_catalog_items ci WHERE ci.category_id=inventory_categories.id) AS "itemCount"
        `, [randomUUID(), name, input.description?.trim() || null, actorId]);
        await this.audit(manager, actorId, null, 'CATEGORY_CREATED', rows[0].id, { name: rows[0].name });
        return rows[0];
      });
    } catch (error) {
      if (this.pgCode(error) === '23505') throw new ConflictException('A category with this name already exists.');
      throw error;
    }
  }

  async updateCategory(id: string, input: UpdateInventoryCategoryDto, actorId: string): Promise<InventoryCategory> {
    const hasDescription = Object.prototype.hasOwnProperty.call(input, 'description');
    const name = input.name?.trim();
    if (input.name !== undefined && !name) throw new BadRequestException('Category name is required.');
    if (input.name === undefined && !hasDescription) throw new BadRequestException('At least one category field must be provided.');
    try {
      return await this.db.transaction(async manager => {
        const rows = await manager.query<InventoryCategory[]>(`
          UPDATE inventory_categories
          SET name=COALESCE($2,name),
              description=CASE WHEN $3::boolean THEN $4::text ELSE description END,
              updated_at=now()
          WHERE id=$1 AND is_active=true
          RETURNING id,name,description,is_active AS "isActive",
            (SELECT count(*)::int FROM inventory_catalog_items ci WHERE ci.category_id=inventory_categories.id) AS "itemCount"
        `, [id,name ?? null,hasDescription,input.description?.trim() || null]);
        if (!rows[0]) throw new NotFoundException('Inventory category not found.');
        await this.audit(manager, actorId, null, 'CATEGORY_UPDATED', id, {
          name: rows[0].name,
          description: rows[0].description,
        });
        return rows[0];
      });
    } catch (error) {
      if (this.pgCode(error) === '23505') throw new ConflictException('A category with this name already exists.');
      throw error;
    }
  }

  async deleteCategory(id: string, actorId: string): Promise<void> {
    try {
      await this.db.transaction(async manager => {
        const category = await manager.query<{ id: string; name: string }[]>(
          `SELECT id,name FROM inventory_categories WHERE id=$1 AND is_active=true FOR UPDATE`, [id],
        );
        if (!category[0]) throw new NotFoundException('Inventory category not found.');
        const references = await manager.query<{ itemCount: number }[]>(`
          SELECT count(*)::int AS "itemCount"
          FROM inventory_catalog_items WHERE category_id=$1
        `, [id]);
        if (Number(references[0]?.itemCount ?? 0) > 0) {
          throw new ConflictException('This category is assigned to inventory items. Reassign those items before deleting it.');
        }
        await manager.query(`DELETE FROM inventory_categories WHERE id=$1`, [id]);
        await this.audit(manager, actorId, null, 'CATEGORY_DELETED', id, { name: category[0].name });
      });
    } catch (error) {
      if (this.pgCode(error) === '23503') {
        throw new ConflictException('This category is in use and cannot be deleted.');
      }
      throw error;
    }
  }

  async listItems(query: InventoryListQueryDto, branchIds: string[] | undefined, registeredOnly = false) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const values: unknown[] = [];
    const conditions: string[] = [];
    if (registeredOnly) {
      const ids = query.branchId ? [query.branchId] : branchIds;
      if (ids !== undefined) {
        values.push(ids);
        conditions.push(`EXISTS (SELECT 1 FROM inventory_balances visible WHERE visible.item_id=ci.id AND visible.branch_id=ANY($${values.length}::varchar[]))`);
      }
    }
    if (query.status && query.status !== 'ALL') {
      values.push(query.status);
      conditions.push(`ci.status=$${values.length}`);
    } else if (!query.status) conditions.push(`ci.status<>'ARCHIVED'`);
    if (query.categoryId) {
      values.push(query.categoryId);
      conditions.push(`ci.category_id=$${values.length}`);
    }
    if (query.itemType) {
      values.push(query.itemType);
      conditions.push(`ci.item_type=$${values.length}`);
    }
    if (query.search?.trim()) {
      values.push(query.search.trim());
      conditions.push(`(ci.name ILIKE '%'||$${values.length}||'%' OR ci.sku ILIKE '%'||$${values.length}||'%' OR c.name ILIKE '%'||$${values.length}||'%')`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const countRows = await this.db.query<{ total: number | string }[]>(`
      SELECT count(*)::int AS total FROM inventory_catalog_items ci
      JOIN inventory_categories c ON c.id=ci.category_id ${where}
    `, values);

    const pageValues = [...values];
    let pageBranchCondition = '';
    if (query.branchId) { pageValues.push(query.branchId); pageBranchCondition = `b.branch_id=$${pageValues.length}`; }
    else if (branchIds !== undefined) { pageValues.push(branchIds); pageBranchCondition = `b.branch_id=ANY($${pageValues.length}::varchar[])`; }
    const pageJoin = pageBranchCondition ? `LEFT JOIN inventory_balances b ON b.item_id=ci.id AND ${pageBranchCondition}` : 'LEFT JOIN inventory_balances b ON b.item_id=ci.id';
    pageValues.push(pageSize, (page - 1) * pageSize);
    const items = await this.db.query<InventoryItem[]>(`
      SELECT ${itemFields}
      FROM inventory_catalog_items ci JOIN inventory_categories c ON c.id=ci.category_id
      ${pageJoin} ${where}
      GROUP BY ci.id,c.name
      ORDER BY ci.name,ci.id LIMIT $${pageValues.length - 1} OFFSET $${pageValues.length}
    `, pageValues);
    return { items, total: Number(countRows[0]?.total ?? 0), page, pageSize };
  }

  async createItem(input: CreateInventoryItemDto, actorId: string): Promise<InventoryItem> {
    const name = input.name.trim(), sku = input.sku.trim(), unit = input.unit.trim();
    if (!name || !sku || !unit) throw new BadRequestException('Name, SKU, and unit are required.');
    try {
      return await this.db.transaction(async manager => {
        await this.assertActiveBranch(manager, input.branchId);
        const category = await manager.query<{ id: string }[]>(`SELECT id FROM inventory_categories WHERE id=$1 AND is_active=true FOR UPDATE`, [input.categoryId]);
        if (!category[0]) throw new NotFoundException('Inventory category not found.');
        const id = randomUUID();
        await manager.query(`
          INSERT INTO inventory_catalog_items(
            id,name,sku,description,category_id,item_type,tracking_method,unit,
            reorder_threshold,maximum_stock_threshold,purchase_price,created_by,updated_by
          ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12)
        `, [id,name,sku,input.description?.trim() || null,input.categoryId,input.itemType,input.trackingMethod,unit,
          input.reorderThreshold,input.maximumStockThreshold ?? null,input.purchasePrice ?? null,actorId]);
        await manager.query(`INSERT INTO inventory_balances(item_id,branch_id,on_hand) VALUES($1,$2,0)`, [id,input.branchId]);
        if (input.openingStock > 0) {
          await this.postMovement(manager, {
            itemId:id,branchId:input.branchId,quantity:input.openingStock,
            reason:'Opening stock at item registration',idempotencyKey:`opening:${id}`,
            performedBy:actorId,movementType:'OPENING',
          });
        }
        await this.audit(manager, actorId, input.branchId, 'ITEM_CREATED', id, { sku, name });
        return this.findItem(manager, id, [input.branchId]);
      });
    } catch (error) {
      if (this.pgCode(error) === '23505') throw new ConflictException('An inventory item with this SKU already exists.');
      throw error;
    }
  }

  async updateItem(id: string, input: UpdateInventoryItemDto, actorId: string): Promise<InventoryItem> {
    const hasDescription = Object.prototype.hasOwnProperty.call(input, 'description');
    const hasMaximum = Object.prototype.hasOwnProperty.call(input, 'maximumStockThreshold');
    const hasPrice = Object.prototype.hasOwnProperty.call(input, 'purchasePrice');
    try {
      return await this.db.transaction(async manager => {
        if (input.categoryId) {
          const category = await manager.query<{ id:string }[]>(`SELECT id FROM inventory_categories WHERE id=$1 AND is_active=true FOR UPDATE`, [input.categoryId]);
          if (!category[0]) throw new NotFoundException('Inventory category not found.');
        }
        const rows = await manager.query<{ id:string }[]>(`
          UPDATE inventory_catalog_items SET
            name=COALESCE($2,name),sku=COALESCE($3,sku),
            description=CASE WHEN $4::boolean THEN $5::text ELSE description END,
            category_id=COALESCE($6,category_id),item_type=COALESCE($7,item_type),
            tracking_method=COALESCE($8,tracking_method),unit=COALESCE($9,unit),
            reorder_threshold=COALESCE($10,reorder_threshold),
            maximum_stock_threshold=CASE WHEN $11::boolean THEN $12::integer ELSE maximum_stock_threshold END,
            purchase_price=CASE WHEN $13::boolean THEN $14::numeric ELSE purchase_price END,
            status=COALESCE($15,status),updated_by=$16,updated_at=now()
          WHERE id=$1 RETURNING id
        `, [id,input.name?.trim() || null,input.sku?.trim() || null,hasDescription,input.description?.trim() || null,
          input.categoryId ?? null,input.itemType ?? null,input.trackingMethod ?? null,input.unit?.trim() || null,
          input.reorderThreshold ?? null,hasMaximum,input.maximumStockThreshold ?? null,hasPrice,input.purchasePrice ?? null,
          input.status ?? null,actorId]);
        if (!rows[0]) throw new NotFoundException('Inventory item not found.');
        await this.audit(manager, actorId, null, input.status === 'ARCHIVED' ? 'ITEM_ARCHIVED' : 'ITEM_UPDATED', id, input);
        return this.findItem(manager, id);
      });
    } catch (error) {
      if (this.pgCode(error) === '23505') throw new ConflictException('An inventory item with this SKU already exists.');
      throw error;
    }
  }

  async registerBranch(itemId: string, input: RegisterInventoryBranchDto, actorId: string) {
    return this.db.transaction(async manager => {
      await this.assertActiveBranch(manager, input.branchId);
      const item = await manager.query<{ id:string; status:string }[]>(`SELECT id,status FROM inventory_catalog_items WHERE id=$1`,[itemId]);
      if (!item[0]) throw new NotFoundException('Inventory item not found.');
      if (item[0].status !== 'ACTIVE') throw new BadRequestException('Only active items can be registered at a branch.');
      const location = input.storageLocation?.trim() ?? '';
      const created = await manager.query<{ itemId:string }[]>(`
        INSERT INTO inventory_balances(item_id,branch_id,storage_location,on_hand)
        VALUES($1,$2,$3,0) ON CONFLICT DO NOTHING RETURNING item_id AS "itemId"
      `,[itemId,input.branchId,location]);
      if (!created[0]) throw new ConflictException('This item is already registered at the selected branch and location.');
      if (input.openingStock > 0) {
        await this.postMovement(manager, {
          itemId,branchId:input.branchId,storageLocation:location,quantity:input.openingStock,
          reason:'Opening stock at branch registration',idempotencyKey:`branch-opening:${randomUUID()}`,
          performedBy:actorId,movementType:'OPENING',
        });
      }
      await this.audit(manager, actorId, input.branchId, 'ITEM_REGISTERED_AT_BRANCH', itemId, { storageLocation:location, openingStock:input.openingStock });
      return this.getBalance(manager,itemId,input.branchId,location);
    });
  }

  async receive(itemId: string, input: {
    branchId: string; storageLocation?: string; quantity: number; reason: string; idempotencyKey: string;
  }, actorId: string) {
    this.validateMovement(input);
    return this.db.transaction(manager => this.postMovement(manager, {
      ...input,itemId,performedBy:actorId,movementType:'RECEIPT',
    }));
  }

  async issue(itemId: string, input: {
    branchId: string; storageLocation?: string; quantity: number; reason: string; idempotencyKey: string;
  }, actorId: string) {
    this.validateMovement(input);
    return this.db.transaction(manager => this.postMovement(manager, {
      ...input,itemId,performedBy:actorId,movementType:'ISSUE',
    }));
  }

  async listMovements(
    query: { branchId?: string; itemId?: string; page?: number; pageSize?: number },
    branchIds: string[] | undefined,
  ) {
    const conditions: string[] = [];
    const values: unknown[] = [];
    if (query.branchId) { values.push(query.branchId); conditions.push(`m.branch_id=$${values.length}`); }
    else if (branchIds !== undefined) { values.push(branchIds); conditions.push(`m.branch_id=ANY($${values.length}::varchar[])`); }
    if (query.itemId) { values.push(query.itemId); conditions.push(`m.item_id=$${values.length}`); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const count = await this.db.query<{ total:number|string }[]>(`SELECT count(*)::int AS total FROM inventory_movements m ${where}`,values);
    const page = query.page ?? 1, pageSize = query.pageSize ?? 50;
    const listValues = [...values,pageSize,(page-1)*pageSize];
    const items = await this.db.query<InventoryMovement[]>(`
      SELECT m.id,m.idempotency_key AS "idempotencyKey",m.item_id AS "itemId",ci.name AS "itemName",ci.sku,
        m.branch_id AS "branchId",b.name AS "branchName",m.movement_type AS "movementType",
        m.quantity,m.quantity_delta AS "quantityDelta",m.on_hand_before AS "onHandBefore",
        m.on_hand_after AS "onHandAfter",m.reason,m.performed_by AS "performedBy",u.name AS "performedByName",
        m.created_at AS "createdAt"
      FROM inventory_movements m JOIN inventory_catalog_items ci ON ci.id=m.item_id
      JOIN branches b ON b.id=m.branch_id LEFT JOIN users u ON u.id=m.performed_by
      ${where} ORDER BY m.created_at DESC,m.id DESC LIMIT $${listValues.length-1} OFFSET $${listValues.length}
    `,listValues);
    return { items,total:Number(count[0]?.total ?? 0),page,pageSize };
  }

  async overview(branchId: string | undefined, branchIds: string[] | undefined, includeInventoryValue = false) {
    const filter = branchId ? `b.branch_id=$1` : branchIds !== undefined ? `b.branch_id=ANY($1::varchar[])` : 'true';
    const values = branchId ? [branchId] : branchIds !== undefined ? [branchIds] : [];
    const statsRows = await this.db.query<Record<string,number|string>[]>(`
      SELECT count(DISTINCT b.item_id)::int AS "catalogItems",
        COALESCE(sum(b.on_hand),0)::int AS "onHandQuantity",
        COALESCE(sum(b.on_hand-b.reserved-b.quarantined),0)::int AS "availableQuantity",
        count(*) FILTER (WHERE b.item_id IS NOT NULL AND ci.status='ACTIVE' AND b.on_hand-b.reserved-b.quarantined>0 AND b.on_hand-b.reserved-b.quarantined<=ci.reorder_threshold)::int AS "lowStockItems",
        count(*) FILTER (WHERE b.item_id IS NOT NULL AND ci.status='ACTIVE' AND b.on_hand-b.reserved-b.quarantined=0)::int AS "outOfStockItems"
      FROM inventory_catalog_items ci
      LEFT JOIN inventory_balances b ON b.item_id=ci.id AND ${filter}
      WHERE ci.status<>'ARCHIVED'
    `,values);
    const [assets] = await this.db.query<{ count:number|string }[]>(`
      SELECT count(*)::int AS count FROM assets a
      WHERE ${branchId ? 'a.branch_id=$1' : branchIds !== undefined ? 'a.branch_id=ANY($1::varchar[])' : 'true'}
    `,values);
    const branchRows = await this.db.query<Array<{id:string;name:string;itemCount:number|string;onHand:number|string}>>(`
      SELECT br.id,br.name,count(DISTINCT bal.item_id)::int AS "itemCount",COALESCE(sum(bal.on_hand),0)::int AS "onHand"
      FROM branches br LEFT JOIN inventory_balances bal ON bal.branch_id=br.id
      WHERE br.is_active=true AND ${branchId ? 'br.id=$1' : branchIds !== undefined ? 'br.id=ANY($1::varchar[])' : 'true'}
      GROUP BY br.id,br.name ORDER BY br.name
    `,values);
    const categories = await this.db.query<Array<{category:string;quantity:number|string}>>(`
      SELECT c.name AS category,COALESCE(sum(b.on_hand),0)::int AS quantity
      FROM inventory_categories c JOIN inventory_catalog_items ci ON ci.category_id=c.id AND ci.status<>'ARCHIVED'
      JOIN inventory_balances b ON b.item_id=ci.id
      WHERE ${branchId ? 'b.branch_id=$1' : branchIds !== undefined ? 'b.branch_id=ANY($1::varchar[])' : 'true'}
      GROUP BY c.id,c.name ORDER BY quantity DESC,c.name
    `,values);
    const recent = await this.listMovements({ branchId,page:1,pageSize:8 },branchIds);
    const lowStock = await this.db.query<Array<{id:string;name:string;sku:string;branchId:string;branchName:string;available:number;reorderThreshold:number}>>(`
      SELECT ci.id,ci.name,ci.sku,b.branch_id AS "branchId",br.name AS "branchName",
        (b.on_hand-b.reserved-b.quarantined)::int AS available,ci.reorder_threshold AS "reorderThreshold"
      FROM inventory_balances b JOIN inventory_catalog_items ci ON ci.id=b.item_id JOIN branches br ON br.id=b.branch_id
      WHERE ci.status='ACTIVE' AND (b.on_hand-b.reserved-b.quarantined)<=ci.reorder_threshold
        AND ${branchId ? 'b.branch_id=$1' : branchIds !== undefined ? 'b.branch_id=ANY($1::varchar[])' : 'true'}
      ORDER BY available,ci.name LIMIT 10
    `,values);
    const valueRows = includeInventoryValue ? await this.db.query<{ total:number|string|null }[]>(`
      SELECT COALESCE(sum(b.on_hand*ci.purchase_price),0)::numeric(18,2) AS total
      FROM inventory_balances b JOIN inventory_catalog_items ci ON ci.id=b.item_id
      WHERE ci.status<>'ARCHIVED' AND ${branchId ? 'b.branch_id=$1' : branchIds !== undefined ? 'b.branch_id=ANY($1::varchar[])' : 'true'}
    `,values) : [];
    const stats = statsRows[0] ?? {};
    return {
      stats:{
        catalogItems:Number(stats.catalogItems ?? 0),onHandQuantity:Number(stats.onHandQuantity ?? 0),
        availableQuantity:Number(stats.availableQuantity ?? 0),lowStockItems:Number(stats.lowStockItems ?? 0),
        outOfStockItems:Number(stats.outOfStockItems ?? 0),registeredAssets:Number(assets?.count ?? 0),
      },
      ...(includeInventoryValue ? { inventoryValue:Number(valueRows[0]?.total ?? 0) } : {}),
      branchDistribution:branchRows.map(row=>({...row,itemCount:Number(row.itemCount),onHand:Number(row.onHand)})),
      categoryDistribution:categories.map(row=>({...row,quantity:Number(row.quantity)})),
      recentMovements:recent.items,
      lowStockItems:lowStock.map(row=>({...row,available:Number(row.available),reorderThreshold:Number(row.reorderThreshold)})),
    };
  }

  private validateMovement(input: { quantity:number; reason:string; idempotencyKey:string }) {
    if (!Number.isSafeInteger(input.quantity) || input.quantity <= 0 || input.quantity > 2147483647)
      throw new BadRequestException('Movement quantity must be a positive whole number.');
    if (!input.reason.trim()) throw new BadRequestException('A reason is required for every stock movement.');
    if (input.idempotencyKey.length < 1 || input.idempotencyKey.length > 200)
      throw new BadRequestException('A valid Idempotency-Key header is required.');
  }

  private async postMovement(manager: EntityManager, input: MovementInput) {
    await manager.query(`SELECT pg_advisory_xact_lock(hashtext($1))`,[input.idempotencyKey]);
    const [duplicate] = await manager.query<Array<Record<string,unknown>>>(`
      SELECT id,item_id AS "itemId",branch_id AS "branchId",storage_location AS "storageLocation",
        movement_type AS "movementType",quantity,reason FROM inventory_movements WHERE idempotency_key=$1
    `,[input.idempotencyKey]);
    if (duplicate) {
      const matches = duplicate.itemId===input.itemId && duplicate.branchId===input.branchId &&
        duplicate.storageLocation===(input.storageLocation?.trim() ?? '') && duplicate.movementType===input.movementType &&
        Number(duplicate.quantity)===input.quantity && duplicate.reason===input.reason.trim();
      if (!matches) throw new ConflictException('This Idempotency-Key was already used for a different stock movement.');
      const [balance] = await manager.query<BranchBalance[]>(`
        SELECT item_id AS "itemId",branch_id AS "branchId",storage_location AS "storageLocation",
          on_hand AS "onHand",reserved,quarantined,"in_transit" AS "inTransit"
        FROM inventory_balances WHERE item_id=$1 AND branch_id=$2 AND storage_location=$3
      `,[input.itemId,input.branchId,input.storageLocation?.trim() ?? '']);
      const [movement] = await manager.query<InventoryMovement[]>(`
        SELECT m.id,m.idempotency_key AS "idempotencyKey",m.item_id AS "itemId",ci.name AS "itemName",ci.sku,
          m.branch_id AS "branchId",br.name AS "branchName",m.movement_type AS "movementType",
          m.quantity,m.quantity_delta AS "quantityDelta",m.on_hand_before AS "onHandBefore",
          m.on_hand_after AS "onHandAfter",m.reason,m.performed_by AS "performedBy",u.name AS "performedByName",
          m.created_at AS "createdAt" FROM inventory_movements m
          JOIN inventory_catalog_items ci ON ci.id=m.item_id JOIN branches br ON br.id=m.branch_id
          LEFT JOIN users u ON u.id=m.performed_by WHERE m.id=$1
      `,[duplicate.id]);
      return { movement,balance,duplicate:true };
    }

    const [row] = await manager.query<Array<{status:string;branchActive:boolean}>>(`
      SELECT ci.status,b.is_active AS "branchActive" FROM inventory_catalog_items ci
      JOIN branches b ON b.id=$2 WHERE ci.id=$1
    `,[input.itemId,input.branchId]);
    if (!row) throw new NotFoundException('Inventory item or branch not found.');
    if (!row.branchActive) throw new BadRequestException('Stock cannot be changed at an inactive branch.');
    if (row.status !== 'ACTIVE') throw new BadRequestException('Stock cannot be changed for an inactive or archived item.');
    const location = input.storageLocation?.trim() ?? '';
    const [balance] = await manager.query<BranchBalance[]>(`
      SELECT item_id AS "itemId",branch_id AS "branchId",storage_location AS "storageLocation",
        on_hand AS "onHand",reserved,quarantined,in_transit AS "inTransit"
      FROM inventory_balances WHERE item_id=$1 AND branch_id=$2 AND storage_location=$3 FOR UPDATE
    `,[input.itemId,input.branchId,location]);
    if (!balance) throw new NotFoundException('Item is not registered at the selected branch and location.');
    const before = Number(balance.onHand);
    const delta = input.movementType === 'ISSUE' ? -input.quantity : input.quantity;
    const after = before + delta;
    if (input.movementType === 'ISSUE' && input.quantity > before - Number(balance.reserved) - Number(balance.quarantined))
      throw new BadRequestException('Insufficient available stock.');
    if (after < 0 || after > 2147483647) throw new BadRequestException('The requested stock change exceeds the supported quantity.');

    await manager.query(`UPDATE inventory_balances SET on_hand=$4,updated_at=now() WHERE item_id=$1 AND branch_id=$2 AND storage_location=$3`,
      [input.itemId,input.branchId,location,after]);
    const [movement] = await manager.query<InventoryMovement[]>(`
      INSERT INTO inventory_movements(
        id,idempotency_key,item_id,branch_id,storage_location,movement_type,quantity,quantity_delta,
        on_hand_before,on_hand_after,reason,performed_by
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING id,idempotency_key AS "idempotencyKey",item_id AS "itemId",branch_id AS "branchId",
        movement_type AS "movementType",quantity,quantity_delta AS "quantityDelta",
        on_hand_before AS "onHandBefore",on_hand_after AS "onHandAfter",reason,performed_by AS "performedBy",created_at AS "createdAt"
    `,[randomUUID(),input.idempotencyKey,input.itemId,input.branchId,location,input.movementType,input.quantity,delta,before,after,input.reason.trim(),input.performedBy]);
    await this.audit(manager,input.performedBy,input.branchId,`STOCK_${input.movementType}`,input.itemId,
      { movementId:movement.id,quantity:input.quantity,quantityDelta:delta,onHandBefore:before,onHandAfter:after,reason:input.reason.trim() });
    const [updatedBalance] = await manager.query<BranchBalance[]>(`
      SELECT item_id AS "itemId",branch_id AS "branchId",storage_location AS "storageLocation",
        on_hand AS "onHand",reserved,quarantined,in_transit AS "inTransit"
      FROM inventory_balances WHERE item_id=$1 AND branch_id=$2 AND storage_location=$3
    `,[input.itemId,input.branchId,location]);
    const [fullMovement] = await manager.query<InventoryMovement[]>(`
      SELECT m.id,m.idempotency_key AS "idempotencyKey",m.item_id AS "itemId",ci.name AS "itemName",ci.sku,
        m.branch_id AS "branchId",br.name AS "branchName",m.movement_type AS "movementType",
        m.quantity,m.quantity_delta AS "quantityDelta",m.on_hand_before AS "onHandBefore",
        m.on_hand_after AS "onHandAfter",m.reason,m.performed_by AS "performedBy",u.name AS "performedByName",
        m.created_at AS "createdAt" FROM inventory_movements m
        JOIN inventory_catalog_items ci ON ci.id=m.item_id JOIN branches br ON br.id=m.branch_id
        LEFT JOIN users u ON u.id=m.performed_by WHERE m.id=$1
    `,[movement.id]);
    return { movement:fullMovement,balance:updatedBalance,duplicate:false };
  }

  private async findItem(manager: EntityManager, id: string, branchIds?: string[]) {
    const [item] = await manager.query<InventoryItem[]>(`
      SELECT ${itemFields} FROM inventory_catalog_items ci
      JOIN inventory_categories c ON c.id=ci.category_id
      LEFT JOIN inventory_balances b ON b.item_id=ci.id AND ($2::varchar[] IS NULL OR b.branch_id=ANY($2::varchar[]))
      WHERE ci.id=$1 GROUP BY ci.id,c.name
    `,[id,branchIds ?? null]);
    if (!item) throw new NotFoundException('Inventory item not found.');
    return item;
  }

  private async getBalance(manager: EntityManager, itemId: string, branchId: string, location: string) {
    const [balance] = await manager.query<BranchBalance[]>(`
      SELECT item_id AS "itemId",branch_id AS "branchId",storage_location AS "storageLocation",
        on_hand AS "onHand",reserved,quarantined,in_transit AS "inTransit"
      FROM inventory_balances WHERE item_id=$1 AND branch_id=$2 AND storage_location=$3
    `,[itemId,branchId,location]);
    return balance;
  }

  private async assertActiveBranch(manager: EntityManager, branchId: string) {
    const [branch] = await manager.query<{ id:string }[]>(`SELECT id FROM branches WHERE id=$1 AND is_active=true`,[branchId]);
    if (!branch) throw new NotFoundException('Active branch not found.');
  }

  private async audit(manager: EntityManager, userId: string, branchId: string | null, action: string, resourceId: string, details: unknown) {
    await manager.query(`
      INSERT INTO inventory_audit_logs(id,user_id,branch_id,action,resource_id,details)
      VALUES($1,$2,$3,$4,$5,$6::jsonb)
    `,[randomUUID(),userId,branchId,action,resourceId,JSON.stringify(details)]);
  }

  private pgCode(error: unknown): string | undefined {
    if (typeof error === 'object' && error && 'driverError' in error) {
      const driverError = (error as { driverError?: { code?: string } }).driverError;
      return driverError?.code;
    }
    if (typeof error === 'object' && error && 'code' in error) return (error as { code?:string }).code;
    return undefined;
  }
}
