import type { DataSource } from 'typeorm';
export type CustomerSource = 'WEBSITE' | 'WALK_IN' | 'REFERENCE' | 'SOCIAL_MEDIA';
export type CustomerStatus = 'ACTIVE' | 'INACTIVE' | 'LOST';
export type Customer = {
  id: string;
  branchId: string;
  name: string;
  email: string;
  phone: string;
  source: CustomerSource;
  status: CustomerStatus;
};
const fields = `id, branch_id AS "branchId", name, email, phone, source, status`;
export class CustomerService {
  private readonly testCustomers?: Map<string, Customer>;
  constructor(private readonly db?: Pick<DataSource, 'query'>) {
    if (!db) {
      if (process.env.NODE_ENV === 'production') throw new Error('CRM customers require PostgreSQL in production');
      this.testCustomers = new Map();
    }
  }
  async create(input: Customer): Promise<Customer> {
    if (!this.db) { this.testCustomers!.set(input.id, {...input}); return {...input}; }
    const rows = await this.db.query<Customer[]>(
      `INSERT INTO customers(id,branch_id,name,email,phone,source,status)
       VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING ${fields}`,
      [input.id,input.branchId,input.name,input.email,input.phone,input.source,input.status],
    );
    return rows[0];
  }
  async list(branchId?: string): Promise<Customer[]> {
    if (!this.db) {
      const records = [...this.testCustomers!.values()];
      return branchId ? records.filter(x=>x.branchId===branchId) : records;
    }
    return this.db.query<Customer[]>(
      `SELECT ${fields} FROM customers ${branchId?'WHERE branch_id=$1':''} ORDER BY name,id`,
      branchId?[branchId]:[],
    );
  }
  async findById(id: string): Promise<Customer | undefined> {
    if (!this.db) return this.testCustomers!.get(id);
    const rows = await this.db.query<Customer[]>(`SELECT ${fields} FROM customers WHERE id=$1`,[id]);
    return rows[0];
  }
}
