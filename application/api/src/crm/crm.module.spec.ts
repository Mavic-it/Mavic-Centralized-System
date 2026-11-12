import { describe, expect, it } from 'vitest';
import { CustomerController } from './customers/customer.controller.js';
import { CustomerService } from './customers/customer.service.js';
import { InquiryController } from './inquiries/inquiry.controller.js';
import { InquiryService } from './inquiries/inquiry.service.js';

describe('MSPACES CRM module', () => {
  it('tracks inquiry follow-up from new lead to conversion', async () => {
    const customers = new CustomerService();
    const customerController = new CustomerController(customers);

    const customer = await customerController.create({
      id: 'cust-1',
      branchId: 'branch-1',
      name: 'Carmen Reyes',
      email: 'carmen@example.com',
      phone: '+639171234567',
      source: 'WEBSITE',
      status: 'ACTIVE',
    });

    expect(customer.branchId).toBe('branch-1');

    const inquiries = new InquiryService();
    const inquiryController = new InquiryController(inquiries);

    const inquiry = await inquiryController.create({
      id: 'inq-1',
      branchId: 'branch-1',
      customerId: 'cust-1',
      assignedStaffId: 'staff-1',
      spaceInterest: 'Private Office',
      budget: 120000,
      status: 'NEW',
      notes: 'Interested in a private office near Makati',
      followUps: [],
    });

    expect(inquiry.status).toBe('NEW');
    expect(
      await inquiryController.followUp('inq-1', 'Site visit scheduled'),
    ).toMatchObject({
      status: 'FOLLOW_UP',
    });
  });
});
