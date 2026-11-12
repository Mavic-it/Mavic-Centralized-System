import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';

export type InquiryStatus = 'NEW' | 'FOLLOW_UP' | 'NEGOTIATION' | 'CONVERTED' | 'LOST';
export type InquiryFollowUp = { id: string; note: string; createdAt: string };
export type Inquiry = {
  id: string; branchId: string; customerId: string; assignedStaffId: string;
  spaceInterest: string; budget: number; status: InquiryStatus; notes: string;
  followUps: InquiryFollowUp[];
};
const fields = `id, branch_id AS "branchId", customer_id AS "customerId",
  assigned_staff_id AS "assignedStaffId", space_interest AS "spaceInterest",
  budget, status, notes, follow_ups AS "followUps"`;
function normalize(item: Inquiry): Inquiry {
  return { ...item, budget: Number(item.budget), followUps: item.followUps ?? [] };
}

export class InquiryService {
  private readonly testInquiries?: Map<string, Inquiry>;
  constructor(private readonly db?: Pick<DataSource, 'query'>) {
    if (!db) {
      if (process.env.NODE_ENV === 'production') throw new Error('CRM inquiries require PostgreSQL in production');
      this.testInquiries = new Map();
    }
  }
  async create(input: Inquiry): Promise<Inquiry> {
    if (!Number.isFinite(input.budget) || input.budget < 0) throw new BadRequestException('Invalid inquiry budget');
    if (!this.db) {
      this.testInquiries!.set(input.id, structuredClone(input));
      return structuredClone(input);
    }
    const rows = await this.db.query<Inquiry[]>(
      `INSERT INTO inquiries(id,branch_id,customer_id,assigned_staff_id,space_interest,budget,status,notes,follow_ups)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb) RETURNING ${fields}`,
      [input.id,input.branchId,input.customerId,input.assignedStaffId,input.spaceInterest,input.budget,input.status,input.notes,JSON.stringify(input.followUps ?? [])],
    );
    return normalize(rows[0]);
  }
  async findById(id: string): Promise<Inquiry | undefined> {
    if (!this.db) {
      const item = this.testInquiries!.get(id);
      return item && structuredClone(item);
    }
    const rows = await this.db.query<Inquiry[]>(`SELECT ${fields} FROM inquiries WHERE id=$1`,[id]);
    return rows[0] && normalize(rows[0]);
  }
  async followUp(id: string, note: string): Promise<Inquiry | undefined> {
    if (typeof note !== 'string' || !note.trim() || note.length > 5000)
      throw new BadRequestException('Enter a valid follow-up note');
    if (!this.db) {
      const item = this.testInquiries!.get(id);
      if (!item) return undefined;
      item.followUps.push({id:randomUUID(),note:note.trim(),createdAt:new Date().toISOString()});
      item.status = 'FOLLOW_UP';
      return structuredClone(item);
    }
    // Single SQL update avoids lost follow-ups on concurrent workers.
    const rows = await this.db.query<Inquiry[]>(
      `UPDATE inquiries SET
        follow_ups=COALESCE(follow_ups,'[]'::jsonb) ||
          jsonb_build_array(jsonb_build_object('id',$2::text,'note',$3::text,'createdAt',now()::text)),
        status='FOLLOW_UP'
       WHERE id=$1 RETURNING ${fields}`,
      [id,randomUUID(),note.trim()],
    );
    return rows[0] && normalize(rows[0]);
  }
  async list(): Promise<Inquiry[]> {
    if (!this.db) return [...this.testInquiries!.values()].map(x=>structuredClone(x));
    const rows = await this.db.query<Inquiry[]>(`SELECT ${fields} FROM inquiries ORDER BY id`,[]);
    return rows.map(normalize);
  }
}
