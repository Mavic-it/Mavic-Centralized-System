import { Controller } from '@nestjs/common';
import { InventoryItem, InventoryService } from './inventory.service.js';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly service: InventoryService) {}

  create(input: InventoryItem): InventoryItem {
    return this.service.create(input);
  }

  stockIn(id: string, quantity: number): InventoryItem | undefined {
    return this.service.stockIn(id, quantity);
  }

  stockOut(id: string, quantity: number): InventoryItem | undefined {
    return this.service.stockOut(id, quantity);
  }

  list(branchId?: string): InventoryItem[] {
    return this.service.list(branchId);
  }
}
