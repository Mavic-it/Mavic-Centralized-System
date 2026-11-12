import { Controller } from '@nestjs/common';
import { Customer, CustomerService } from './customer.service.js';

@Controller('customers')
export class CustomerController {
  constructor(private readonly service: CustomerService) {}

  create(input: Customer): Customer {
    return this.service.create(input);
  }

  list(branchId?: string): Customer[] {
    return this.service.list(branchId);
  }

  get(id: string): Customer | undefined {
    return this.service.findById(id);
  }
}
