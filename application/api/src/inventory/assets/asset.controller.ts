import { Controller } from '@nestjs/common';
import { Asset, AssetService } from './asset.service.js';

@Controller('assets')
export class AssetController {
  constructor(private readonly service: AssetService) {}

  create(input: Asset): Promise<Asset> {
    return this.service.create(input);
  }

  list(branchId?: string): Promise<Asset[]> {
    return this.service.list(branchId);
  }

  get(id: string): Promise<Asset | undefined> {
    return this.service.findById(id);
  }
}
