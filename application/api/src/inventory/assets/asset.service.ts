import type { DataSource } from 'typeorm';
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
const fields = `id, branch_id AS "branchId", asset_type AS "assetType", name,
   serial_number AS "serialNumber", status, assigned_to_employee_id AS "assignedToEmployeeId"`;
export class AssetService {
  private readonly testAssets?: Map<string, Asset>;
  constructor(private readonly db?: Pick<DataSource, 'query'>) {
    if (!db) {
      if (process.env.NODE_ENV === 'production') throw new Error('Assets require PostgreSQL in production');
      this.testAssets = new Map();
    }
  }
  async create(input: Asset): Promise<Asset> {
    if (!this.db) { this.testAssets!.set(input.id, {...input}); return {...input}; }
    const rows = await this.db.query<Asset[]>(
      `INSERT INTO assets(id,branch_id,asset_type,name,serial_number,status,assigned_to_employee_id)
       VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING ${fields}`,
      [input.id,input.branchId,input.assetType,input.name,input.serialNumber,input.status,input.assignedToEmployeeId??null],
    );
    return rows[0];
  }
  async findById(id: string): Promise<Asset | undefined> {
    if (!this.db) return this.testAssets!.get(id);
    const rows = await this.db.query<Asset[]>(`SELECT ${fields} FROM assets WHERE id=$1`,[id]);
    return rows[0];
  }
  async list(branchId?: string): Promise<Asset[]> {
    if (!this.db) {
      const records = [...this.testAssets!.values()];
      return branchId ? records.filter(x=>x.branchId===branchId) : records;
    }
    return this.db.query<Asset[]>(`SELECT ${fields} FROM assets ${branchId?'WHERE branch_id=$1':''} ORDER BY name,id`,branchId?[branchId]:[]);
  }
}
