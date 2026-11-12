import { describe, expect, it } from 'vitest';
import { AssetController } from './assets/asset.controller.js';
import { AssetService } from './assets/asset.service.js';
import { InventoryController } from './inventory/inventory.controller.js';
import { InventoryService } from './inventory/inventory.service.js';

describe('MSPACES inventory module', () => {
  it('tracks stock movement and asset assignment', () => {
    const inventory = new InventoryService();
    const inventoryController = new InventoryController(inventory);

    const item = inventoryController.create({
      id: 'inv-1',
      branchId: 'branch-1',
      category: 'OFFICE_SUPPLIES',
      name: 'Printer Paper',
      sku: 'PP-100',
      stockOnHand: 50,
      unit: 'PACK',
      status: 'ACTIVE',
    });

    expect(item.stockOnHand).toBe(50);
    expect(inventoryController.stockIn('inv-1', 10)).toMatchObject({
      stockOnHand: 60,
    });

    const assets = new AssetService();
    const assetController = new AssetController(assets);

    const asset = assetController.create({
      id: 'asset-1',
      branchId: 'branch-1',
      assetType: 'LAPTOP',
      name: 'Dell Latitude 7440',
      serialNumber: 'DL-7440-001',
      status: 'ASSIGNED',
      assignedToEmployeeId: 'emp-1',
    });

    expect(asset.status).toBe('ASSIGNED');
  });
});
