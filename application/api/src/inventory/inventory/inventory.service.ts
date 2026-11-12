export type InventoryStatus =
  'ACTIVE' | 'LOW_STOCK' | 'OUT_OF_STOCK' | 'DISCONTINUED';

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

export class InventoryService {
  private items = new Map<string, InventoryItem>();

  create(input: InventoryItem): InventoryItem {
    this.items.set(input.id, input);
    return input;
  }

  findById(id: string): InventoryItem | undefined {
    return this.items.get(id);
  }

  stockIn(id: string, quantity: number): InventoryItem | undefined {
    const item = this.items.get(id);
    if (!item) {
      return undefined;
    }

    item.stockOnHand += quantity;
    item.status =
      item.stockOnHand <= 0
        ? 'OUT_OF_STOCK'
        : item.stockOnHand < 10
          ? 'LOW_STOCK'
          : 'ACTIVE';
    return item;
  }

  stockOut(id: string, quantity: number): InventoryItem | undefined {
    const item = this.items.get(id);
    if (!item) {
      return undefined;
    }

    item.stockOnHand = Math.max(0, item.stockOnHand - quantity);
    item.status =
      item.stockOnHand === 0
        ? 'OUT_OF_STOCK'
        : item.stockOnHand < 10
          ? 'LOW_STOCK'
          : 'ACTIVE';
    return item;
  }

  list(branchId?: string): InventoryItem[] {
    const items = Array.from(this.items.values());
    return branchId
      ? items.filter((item) => item.branchId === branchId)
      : items;
  }
}
