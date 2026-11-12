import { Module } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import { CustomerController } from './customers/customer.controller.js';
import { CustomerService } from './customers/customer.service.js';
import { InquiryController } from './inquiries/inquiry.controller.js';
import { InquiryService } from './inquiries/inquiry.service.js';

@Module({
  controllers: [CustomerController, InquiryController],
  providers: [
    { provide: CustomerService, useFactory: (db: DataSource) => new CustomerService(db), inject: [getDataSourceToken()] },
    { provide: InquiryService, useFactory: (db: DataSource) => new InquiryService(db), inject: [getDataSourceToken()] },
  ],
  exports: [CustomerService, InquiryService],
})
export class CrmModule {}
