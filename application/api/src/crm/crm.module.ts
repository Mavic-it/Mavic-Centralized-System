import { Module } from '@nestjs/common';
import { CustomerController } from './customers/customer.controller.js';
import { CustomerService } from './customers/customer.service.js';
import { InquiryController } from './inquiries/inquiry.controller.js';
import { InquiryService } from './inquiries/inquiry.service.js';

@Module({
  controllers: [CustomerController, InquiryController],
  providers: [CustomerService, InquiryService],
  exports: [CustomerService, InquiryService],
})
export class CrmModule {}
