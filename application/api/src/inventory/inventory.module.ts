import { Module } from '@nestjs/common';
import { AssetController } from './assets/asset.controller.js';
import { AssetService } from './assets/asset.service.js';
import { InventoryController } from './inventory/inventory.controller.js';
import { InventoryService } from './inventory/inventory.service.js';

@Module({
  controllers: [InventoryController, AssetController],
  providers: [InventoryService, AssetService],
  exports: [InventoryService, AssetService],
})
export class InventoryModule {}
