import { describe, expect, it, vi } from 'vitest';
import type { DataSource } from 'typeorm';
import { InventoryService } from '../inventory/inventory/inventory.service.js';
import { AssetService } from '../inventory/assets/asset.service.js';
import { CustomerService } from '../crm/customers/customer.service.js';
import { InquiryService } from '../crm/inquiries/inquiry.service.js';
import { ReportService } from '../reporting/reports/report.service.js';

describe('business data is stored via PostgreSQL rather than process memory', () => {
  it('uses parameterized SQL for all five persistent services', async () => {
    const query = vi.fn(async (sql: string, _args: unknown[] = []) => {
      if (sql.includes('RETURNING') || sql.includes('SELECT')) return [];
      return [];
    });
    const db = {query} as unknown as DataSource;
    const inventory = new InventoryService(db);
    const assets = new AssetService(db);
    const customers = new CustomerService(db);
    const inquiries = new InquiryService(db);
    const reporting = new ReportService(db);

    await inventory.list('branch-one');
    await assets.list('branch-one');
    await customers.list('branch-one');
    await inquiries.list();
    await reporting.summary('branch-one');
    await reporting.record('inventory',{branchId:'branch-one',amount:4,label:'Units'});
    const sqlCalls = query.mock.calls.map(call => call[0]);
    expect(sqlCalls.join('\n')).toContain('FROM inventory_items');
    expect(sqlCalls.join('\n')).toContain('FROM assets');
    expect(sqlCalls.join('\n')).toContain('FROM customers');
    expect(sqlCalls.join('\n')).toContain('FROM inquiries');
    expect(sqlCalls.join('\n')).toContain('FROM report_metrics');
    expect(sqlCalls.join('\n')).toContain('INSERT INTO report_metrics');
    expect(query.mock.calls.filter(call => call[0].includes('branch_id=$1')).every(call => call[1]?.[0] === 'branch-one')).toBe(true);
  });

  it('uses one conditional atomic SQL stock decrement to block overselling', async () => {
    const query = vi.fn().mockResolvedValue([{id:'inventory-1',stockOnHand:3,status:'LOW_STOCK'}]);
    const stock = new InventoryService({query} as unknown as DataSource);
    await stock.stockOut('inventory-1',2);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE id=$1 AND stock_on_hand >= $2'),
      ['inventory-1',2],
    );
    await expect(stock.stockOut('inventory-1',0)).rejects.toThrow();
    await expect(stock.stockOut('inventory-1',-2)).rejects.toThrow();
  });

  it('updates inquiry follow-ups atomically without read-modify-write races', async () => {
    const query = vi.fn().mockResolvedValue([{id:'inquiry-1',budget:'15.00',followUps:[]}]);
    const inquiries = new InquiryService({query} as unknown as DataSource);
    const result = await inquiries.followUp('inquiry-1','Called the client');
    expect(result?.budget).toBe(15);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("COALESCE(follow_ups,'[]'::jsonb) ||"),
      ['inquiry-1',expect.any(String),'Called the client'],
    );
  });
});
