import { BadRequestException } from '@nestjs/common';
import type { DataSource } from 'typeorm';

export type InventoryStatus = 'ACTIVE' | 'LOW_STOCK' | 'OUT_OF_STOCK' | 'DISCONTINUED';
export type InventoryItem = {
  id: string;
  branchId: string;
  category: string;
  name: string;
  sku: string;
  stockOnHand: number;
  unit: string;
  status: InventoryStatus;
};
const fields = `id, branch_id AS "branchId", category, name, sku, stock_on_hand AS "stockOnHand", unit, status`;

export class InventoryService {
  private readonly testItems?: Map<string, InventoryItem>;
  constructor(private readonly db?: Pick<DataSource, 'query'>) {
    if (!db) {
      if (process.env.NODE_ENV === 'production') throw new Error('Inventory requires PostgreSQL in production');
      this.testItems = new Map();
    }
  }
  private validQuantity(quantity: number): void {
    if (!Number.isSafeInteger(quantity) || quantity <= 0)
      throw new BadRequestException('Stock quantity must be a positive whole number.');
  }
  async create(input: InventoryItem): Promise<InventoryItem> {
    if (!Number.isSafeInteger(input.stockOnHand) || input.stockOnHand < 0)
      throw new BadRequestException('Opening stock must be a nonnegative whole number.');
    if (!this.db) { this.testItems!.set(input.id, {...input}); return {...input}; }
    const rows = await this.db.query<InventoryItem[]>(
      `INSERT INTO inventory_items(id,branch_id,category,name,sku,stock_on_hand,unit,status)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING ${fields}`,
      [input.id,input.branchId,input.category,input.name,input.sku,input.stockOnHand,input.unit,input.status],
    );
    return rows[0];
  }
  async findById(id: string): Promise<InventoryItem | undefined> {
    if (!this.db) return this.testItems!.get(id);
    const rows = await this.db.query<InventoryItem[]>(`SELECT ${fields} FROM inventory_items WHERE id=$1`,[id]);
    return rows[0];
  }
  async stockIn(id: string, quantity: number): Promise<InventoryItem | undefined> {
    this.validQuantity(quantity);
    if (!this.db) {
      const item = this.testItems!.get(id);
      if (!item) return undefined;
      item.stockOnHand += quantity;
      item.status = item.status === 'DISCONTINUED' ? 'DISCONTINUED' : item.stockOnHand < 10 ? 'LOW_STOCK' : 'ACTIVE';
      return {...item};
    }
    const rows = await this.db.query<InventoryItem[]>(
      `UPDATE inventory_items SET
         stock_on_hand = stock_on_hand + $2,
         status = CASE WHEN status = 'DISCONTINUED' THEN status
                       WHEN stock_on_hand + $2 < 10 THEN 'LOW_STOCK' ELSE 'ACTIVE' END
       WHERE id=$1 AND stock_on_hand <= 2147483647 - $2 RETURNING ${fields}`,[id,quantity]);
    return rows[0];
  }
  async stockOut(id: string, quantity: number): Promise<InventoryItem | undefined> {
    this.validQuantity(quantity);
    if (!this.db) {
      const item = this.testItems!.get(id);
      if (!item) return undefined;
      if (item.stockOnHand < quantity) throw new BadRequestException('Insufficient stock.');
      item.stockOnHand -= quantity;
      item.status = item.status === 'DISCONTINUED' ? 'DISCONTINUED' : item.stockOnHand === 0 ? 'OUT_OF_STOCK' : item.stockOnHand < 10 ? 'LOW_STOCK' : 'ACTIVE';
      return {...item};
    }
    const rows = await this.db.query<InventoryItem[]>(
      `UPDATE inventory_items SET stock_on_hand = stock_on_hand - $2,
       status = CASE WHEN status = 'DISCONTINUED' THEN status
                     WHEN stock_on_hand - $2 = 0 THEN 'OUT_OF_STOCK'
                     WHEN stock_on_hand - $2 < 10 THEN 'LOW_STOCK' ELSE 'ACTIVE' END
       WHERE id=$1 AND stock_on_hand >= $2 RETURNING ${fields}`,[id,quantity]);
    if (rows[0]) return rows[0];
    const existing = await this.findById(id);
    if (existing) throw new BadRequestException('Insufficient stock.');
    return undefined;
  }
  async list(branchId?: string): Promise<InventoryItem[]> {
    if (!this.db) {
      const items = [...this.testItems!.values()];
      return branchId ? items.filter(x=>x.branchId===branchId) : items;
    }
    return this.db.query<InventoryItem[]>(
      `SELECT ${fields} FROM inventory_items ${branchId ? 'WHERE branch_id=$1' : ''} ORDER BY name, id`,
      branchId ? [branchId] : [],
    );
  }
}
