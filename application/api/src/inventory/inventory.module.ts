import { Module } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import { AssetController } from './assets/asset.controller.js';
import { AssetService } from './assets/asset.service.js';
import { InventoryController } from './inventory/inventory.controller.js';
import { InventoryService } from './inventory/inventory.service.js';

@Module({
  controllers: [InventoryController, AssetController],
  providers: [
    { provide: InventoryService, useFactory: (db: DataSource) => new InventoryService(db), inject: [getDataSourceToken()] },
    { provide: AssetService, useFactory: (db: DataSource) => new AssetService(db), inject: [getDataSourceToken()] },
  ],
  exports: [InventoryService, AssetService],
})
export class InventoryModule {}
