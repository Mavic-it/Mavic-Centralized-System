import { Controller } from '@nestjs/common';
import { Inquiry, InquiryService } from './inquiry.service.js';

@Controller('inquiries')
export class InquiryController {
  constructor(private readonly service: InquiryService) {}

  create(input: Inquiry): Inquiry {
    return this.service.create(input);
  }

  followUp(id: string, note: string): Inquiry | undefined {
    return this.service.followUp(id, note);
  }

  list(): Inquiry[] {
    return this.service.list();
  }
}
