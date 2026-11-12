export type InquiryStatus =
  'NEW' | 'FOLLOW_UP' | 'NEGOTIATION' | 'CONVERTED' | 'LOST';

export type InquiryFollowUp = {
  id: string;
  note: string;
  createdAt: string;
};

export type Inquiry = {
  id: string;
  branchId: string;
  customerId: string;
  assignedStaffId: string;
  spaceInterest: string;
  budget: number;
  status: InquiryStatus;
  notes: string;
  followUps: InquiryFollowUp[];
};

export class InquiryService {
  private inquiries = new Map<string, Inquiry>();

  create(input: Inquiry): Inquiry {
    this.inquiries.set(input.id, input);
    return input;
  }

  findById(id: string): Inquiry | undefined {
    return this.inquiries.get(id);
  }

  followUp(id: string, note: string): Inquiry | undefined {
    const inquiry = this.inquiries.get(id);
    if (!inquiry) {
      return undefined;
    }

    inquiry.followUps.push({
      id: `followup-${inquiry.followUps.length + 1}`,
      note,
      createdAt: new Date().toISOString(),
    });
    inquiry.status = 'FOLLOW_UP';
    return inquiry;
  }

  list(): Inquiry[] {
    return Array.from(this.inquiries.values());
  }
}
