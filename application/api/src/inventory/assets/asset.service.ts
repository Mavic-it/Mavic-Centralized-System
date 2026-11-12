export type AssetType = 'LAPTOP' | 'MONITOR' | 'PRINTER' | 'ROUTER' | 'CCTV';
export type AssetStatus = 'AVAILABLE' | 'ASSIGNED' | 'MAINTENANCE' | 'RETIRED';

export type Asset = {
  id: string;
  branchId: string;
  assetType: AssetType;
  name: string;
  serialNumber: string;
  status: AssetStatus;
  assignedToEmployeeId?: string;
};

export class AssetService {
  private assets = new Map<string, Asset>();

  create(input: Asset): Asset {
    this.assets.set(input.id, input);
    return input;
  }

  findById(id: string): Asset | undefined {
    return this.assets.get(id);
  }

  list(branchId?: string): Asset[] {
    const assets = Array.from(this.assets.values());
    return branchId
      ? assets.filter((asset) => asset.branchId === branchId)
      : assets;
  }
}
