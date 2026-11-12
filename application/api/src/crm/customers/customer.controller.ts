import { Controller } from '@nestjs/common';
import { Customer, CustomerService } from './customer.service.js';

@Controller('customers')
export class CustomerController {
  constructor(private readonly service: CustomerService) {}

  create(input: Customer): Promise<Customer> {
    return this.service.create(input);
  }

  list(branchId?: string): Promise<Customer[]> {
    return this.service.list(branchId);
  }

  get(id: string): Promise<Customer | undefined> {
    return this.service.findById(id);
  }
}
