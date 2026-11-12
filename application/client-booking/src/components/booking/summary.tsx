import { CalendarDays, Clock3, MapPin, Users } from 'lucide-react';
import { dateLabel, duration, time } from '@/lib/date-time';
import type { Draft, Space } from '@/types/booking';
import { Assurance } from '../ui';
export function BookingSummary({ draft, space }: { draft: Draft; space: Space }) {
  return <aside className="summary"><div className="panel"><p className="eyebrow">YOUR SPACE, YOUR TIME</p><h2>{space.name}</h2><p className="summary-type">{space.type === 'COWORKING_DESK' ? 'Shared coworking space' : 'Exclusive meeting room'}</p><dl className="summary-list"><div><dt><MapPin size={18} />Branch</dt><dd>{space.branchName}</dd></div><div><dt><CalendarDays size={18} />Date</dt><dd>{draft.date ? dateLabel(draft.date) : 'Choose a date'}</dd></div><div><dt><Clock3 size={18} />Time</dt><dd>{draft.startAt && draft.endAt ? `${time(draft.startAt)} – ${time(draft.endAt)}` : 'Choose your time'}<small>Philippine Time · UTC+8</small></dd></div><div><dt><Users size={18} />Guests</dt><dd>{draft.guestCount} {draft.guestCount === 1 ? 'guest' : 'guests'}</dd></div></dl><div className="duration"><span>Total duration</span><strong>{duration(draft.startAt,draft.endAt)} hours</strong></div><p className="fine-print">Review the calculated amount before submitting. Paid bookings use official Bank Transfer or GCash instructions and require staff verification.</p></div><Assurance /></aside>;
}
