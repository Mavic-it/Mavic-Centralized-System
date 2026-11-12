export type CustomerSource =
  'WEBSITE' | 'WALK_IN' | 'REFERENCE' | 'SOCIAL_MEDIA';
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

export class CustomerService {
  private customers = new Map<string, Customer>();

  create(input: Customer): Customer {
    this.customers.set(input.id, input);
    return input;
  }

  list(branchId?: string): Customer[] {
    const customers = Array.from(this.customers.values());
    return branchId
      ? customers.filter((customer) => customer.branchId === branchId)
      : customers;
  }

  findById(id: string): Customer | undefined {
    return this.customers.get(id);
  }
}
