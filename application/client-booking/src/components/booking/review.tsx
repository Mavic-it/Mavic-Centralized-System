'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, CheckCircle2 } from 'lucide-react';
import { api } from '@/lib/api';
import { money } from '@/lib/payment-api';
import { customerSchema } from '@/lib/validation';
import { useBooking } from './provider';
import { EmptyDraft, Steps } from '../ui';
import { BookingSummary } from './summary';
import { PolicyModal } from './policy-modal';
export function BookingReview() {
  const { draft, space, keyFor, complete, attempted, markAttempt,ready } = useBooking(), router = useRouter();
  const [accepted, setAccepted] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [showPolicies,setShowPolicies]=useState(false);
  const submitting = useRef(false);
  const [quote,setQuote]=useState<{amount:number;requiredAmount:number}|null>(null);
  const [quoteError,setQuoteError]=useState('');
  useEffect(()=>{if(!draft.startAt||!draft.endAt)return;let active=true;api.quote(draft).then(value=>{if(active)setQuote(value);}).catch(e=>{if(active)setQuoteError(e instanceof Error?e.message:'Unable to calculate total.');});return()=>{active=false;};},[draft]);
  if(!ready)return <section className="section"><p role="status">Restoring your booking details...</p></section>;
  if (!space || !draft.startAt || !draft.endAt) return <section className="section"><EmptyDraft /></section>;
  async function submit() {
    if (submitting.current || !accepted) return;
    submitting.current = true; setBusy(true); setError('');
    try {
      if (!customerSchema.safeParse(draft).success) throw new Error('Please return to booking details and check your contact information.');
      const key = keyFor(draft);
      if (!attempted(key)) {
        const current = await api.availability(draft);
        if (!current.slots.find(s => s.startAt === draft.startAt)?.endTimes.includes(draft.endAt)) throw new Error('This time is no longer available. Please edit your booking and choose another slot.');
      }
      // A lost POST response may already have saved this booking. Retry the same
      // key directly so its own occupancy cannot prevent receipt recovery.
      markAttempt(key);
      const receipt = await api.submit(draft,key);
      complete(receipt); router.replace(receipt.paymentRequired?'/payment':'/confirmation');
    } catch (e) { setError(e instanceof Error ? e.message : 'We couldn’t submit your booking. Please try again.'); }
    finally { submitting.current = false; setBusy(false); }
  }
  return <section className="section booking-page"><Link className="back" href="/book"><ArrowLeft size={16} /> Edit booking details</Link><Steps current={2} /><div className="page-heading"><p className="eyebrow">ONE LAST LOOK</p><h1>Everything look right?</h1><p>Check your details before sending your reservation to the branch.</p></div><div className="booking-grid"><div><section className="panel"><div className="panel-heading"><CheckCircle2 size={24} /><h2>Your visit</h2></div><dl className="review-details">{[['Purpose',draft.purpose],['Full name',draft.customerName],['Email',draft.customerEmail],['Contact number',draft.customerPhone],['Company',draft.companyName || '—'],['Special requests',draft.specialRequests || '—']].map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>{quote?<div className="payment-total">Total <strong>{money(quote.amount)}</strong><p>Required to confirm: {money(quote.requiredAmount)}</p></div>:<p role="status">{quoteError||'Calculating booking amount?'}</p>}</section><section className="panel"><h2>Before you book</h2><p>Your reservation may need branch approval. Please wait for a <strong>Confirmed</strong> status before treating the space as secured.</p><p>Pending bookings hold the selected space or seats. For changes, contact the branch. To cancel, use Cancel a booking with your reference and booking email; cancellation requires admin approval. For paid bookings, follow the official Bank Transfer or GCash instructions after submitting. Your slot is held only until the displayed deadline; payment proof requires staff verification.</p><p>We use your contact details to process your booking and send reservation updates. Read our <button type="button" className="text-link policy-trigger" aria-haspopup="dialog" onClick={()=>setShowPolicies(true)}>booking terms and privacy notice</button>.</p><label className="consent"><input type="checkbox" checked={accepted} disabled={busy} onChange={e => setAccepted(e.target.checked)} required /><span>I have reviewed my details and accept the booking terms and privacy notice.<span className="required"> *</span></span></label></section>{error && <div className="notice" role="alert"><p>{error}</p><Link className="text-link" href="/book">Edit booking</Link></div>}<div className="form-actions"><Link className="back" href="/book">Back to details</Link><button className="button" disabled={!accepted || busy || !quote} onClick={submit}>{busy ? 'Submitting reservation…' : quote&&quote.amount>0?'Continue to payment':'Submit reservation'}<ArrowRight size={18} /></button></div><p className="fine-print" role="status">{busy ? 'Rechecking availability and saving your reservation. Please keep this page open.' : 'Your reservation status will be shown after submission.'}</p></div><BookingSummary draft={draft} space={space} /></div>{showPolicies&&<PolicyModal onClose={()=>setShowPolicies(false)}/>}</section>;
}
