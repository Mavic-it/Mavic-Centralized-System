'use client';
import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, CalendarDays } from 'lucide-react';
import { api } from '@/lib/api';
import { today, time, duration } from '@/lib/date-time';
import { customerSchema } from '@/lib/validation';
import type { Availability } from '@/types/booking';
import { useBooking } from './provider';
import { EmptyDraft, Field, Steps } from '../ui';
import { BookingSummary } from './summary';
export function BookingForm() {
  const { draft, update, space,ready,draftNotice } = useBooking(), router = useRouter();
  const [availability, setAvailability] = useState<Availability | null>(null), [error, setError] = useState('');
  const [loadedKey, setLoadedKey] = useState(''), [retry, setRetry] = useState(0), [validation, setValidation] = useState('');
  const key = JSON.stringify([draft.branchId,draft.roomId,draft.date,draft.guestCount,retry]);
  const busy = key !== loadedKey;
  useEffect(() => { if (!draft.roomId || !draft.date || !Number.isInteger(draft.guestCount) || draft.guestCount < 1) return;
    let active = true;
    api.availability({ branchId: draft.branchId,roomId: draft.roomId,date: draft.date,guestCount: draft.guestCount })
      .then(data => { if (active) { setAvailability(data); setError(''); setLoadedKey(key); } })
      .catch(e => { if (active) { setError(e.message); setAvailability(null); setLoadedKey(key); } });
    return () => { active = false; };
  }, [draft.branchId,draft.roomId,draft.date,draft.guestCount,key]);
  if(!ready)return <section className="section"><p role="status">Restoring your booking details...</p></section>;
  if (!space) return <div className="section"><EmptyDraft /></div>;
  const slots = !busy && !error ? availability?.slots ?? [] : [];
  const ends = slots.find(s => s.startAt === draft.startAt)?.endTimes ?? [];
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = customerSchema.safeParse(draft);
    if (!parsed.success) { setValidation(parsed.error.issues.map(i => i.message).join(' ')); return; }
    if (busy || !ends.includes(draft.endAt)) { setValidation('Select an available start and end time.'); return; }
    setValidation(''); router.push('/review');
  }
  return <section className="section booking-page"><Link className="back" href="/"><ArrowLeft size={16} /> Explore spaces</Link><Steps current={1} /><div className="page-heading"><p className="eyebrow">MAKE ROOM FOR WHAT’S NEXT</p><h1>Let’s plan your visit.</h1><p>Choose your time and tell us a little about your booking.</p><p className="fine-print" role="status">{draftNotice||'Your inputs are saved temporarily in this tab for up to two hours. Leaving the booking flow clears the draft after confirmation.'}</p></div><div className="booking-grid"><form onSubmit={submit}><section className="panel"><div className="panel-heading"><span className="section-number">01</span><div><h2>Booking details</h2><p>All times are in Philippine Time (UTC+8).</p></div></div><div className="form-grid"><Field label="Branch" required><input value={space.branchName} readOnly required /></Field><Field label="Space" required><input value={space.name} readOnly required /></Field><Field label="Date" required><input type="date" required value={draft.date} min={today()} onChange={e => update({date:e.target.value,startAt:'',endAt:''})} /></Field><Field label="Guests" required><input type="number" required min={1} max={space.capacity} step={1} value={draft.guestCount || ''} onChange={e => update({ guestCount: Number(e.target.value),startAt:'',endAt:'' })} /><small>Up to {space.capacity} guests</small></Field><div className="availability-panel wide"><div className="availability-heading"><CalendarDays size={18} /><strong>Available start times</strong><span className="required" aria-hidden="true">*</span></div>{busy ? <p role="status">Checking live availability…</p> : error ? <div role="alert"><p>{error}</p><button type="button" onClick={() => setRetry(v => v+1)}>Try again</button></div> : !slots.length ? <p role="status">No times available for this date and guest count. Try another date or fewer guests.</p> : <div className="slots" role="group" aria-label="Start time">{slots.map(slot => <button type="button" key={slot.startAt} aria-pressed={draft.startAt === slot.startAt} onClick={() => update({startAt:slot.startAt,endAt:''})}>{time(slot.startAt)}</button>)}</div>}{availability && <p className="fine-print">Hours: {availability.policy.openTime}–{availability.policy.closeTime} · {space.minMinutes}–{Math.min(space.maxMinutes,1440)} minutes per booking · {availability.policy.minAdvanceMinutes} minutes’ advance notice · Up to {availability.policy.maxAdvanceDays} days ahead</p>}</div><Field label="Start time" required><select required value={busy ? '' : draft.startAt} disabled={busy || !slots.length} onChange={e => update({startAt:e.target.value,endAt:''})}><option value="">Choose start time</option>{slots.map(s => <option key={s.startAt} value={s.startAt}>{time(s.startAt)}</option>)}</select></Field><Field label="End time" required><select required value={ends.includes(draft.endAt) ? draft.endAt : ''} disabled={!ends.length || busy} onChange={e => update({endAt:e.target.value})}><option value="">Choose end time</option>{ends.map(end => <option key={end} value={end}>{time(end)} · {duration(draft.startAt,end)} hrs</option>)}</select></Field><Field label="Purpose" required wide><input required minLength={2} maxLength={1000} value={draft.purpose} placeholder="e.g. Team planning, client meeting, focused work" onChange={e => update({purpose:e.target.value})} /></Field></div></section><section className="panel"><div className="panel-heading"><span className="section-number">02</span><div><h2>Customer details</h2><p>So our team can take care of your visit.</p></div></div><div className="form-grid"><Field label="Full name" required><input required autoComplete="name" minLength={2} maxLength={200} value={draft.customerName} onChange={e => update({customerName:e.target.value})} /></Field><Field label="Email" required><input required type="email" autoComplete="email" maxLength={320} value={draft.customerEmail} onChange={e => update({customerEmail:e.target.value})} /></Field><Field label="Contact number" required><input required type="tel" autoComplete="tel" maxLength={50} placeholder="0917 123 4567" value={draft.customerPhone} onChange={e => update({customerPhone:e.target.value})} /></Field><Field label="Company"><input autoComplete="organization" maxLength={200} value={draft.companyName} onChange={e => update({companyName:e.target.value})} /></Field><Field label="Special requests" wide><textarea rows={3} maxLength={2000} placeholder="Anything we should know before you arrive?" value={draft.specialRequests} onChange={e => update({specialRequests:e.target.value})} /></Field></div><div className="honeypot" aria-hidden="true"><label>Website<input tabIndex={-1} autoComplete="off" value={draft.website} onChange={e => update({website:e.target.value})} /></label></div></section>{validation && <p className="notice" role="alert">{validation}</p>}<div className="form-actions"><button className="button" disabled={busy || !ends.includes(draft.endAt)}>Review reservation <ArrowRight size={18} /></button></div></form><BookingSummary draft={draft} space={space} /></div></section>;
}
