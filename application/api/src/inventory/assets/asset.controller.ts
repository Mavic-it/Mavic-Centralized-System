import { Controller } from '@nestjs/common';
import { Asset, AssetService } from './asset.service.js';

@Controller('assets')
export class AssetController {
  constructor(private readonly service: AssetService) {}

  create(input: Asset): Asset {
    return this.service.create(input);
  }

  list(branchId?: string): Asset[] {
    return this.service.list(branchId);
  }

  get(id: string): Asset | undefined {
    return this.service.findById(id);
  }
}
