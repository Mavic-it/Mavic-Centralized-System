import { z } from 'zod';
export const customerSchema = z.object({
  customerName: z.string().trim().min(2, 'Enter your full name.').max(200),
  customerEmail: z.email('Enter a valid email address.').max(320),
  customerPhone: z.string().refine(v => /^\+?\d{8,15}$/.test(v.replace(/[\s().-]/g, '')), 'Enter a valid contact number (8–15 digits).'),
  purpose: z.string().trim().min(2, 'Tell us the purpose of your booking.').max(1000),
  companyName: z.string().max(200), specialRequests: z.string().max(2000),
});
