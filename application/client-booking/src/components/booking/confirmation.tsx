'use client';
import Link from 'next/link';
import { useState } from 'react';
import { downloadReceipt } from '@/lib/receipt-pdf';
import { CheckCircle2, Clock3, ArrowRight, Copy, Download } from 'lucide-react';
import { dateLabel, time } from '@/lib/date-time';
import { useBooking } from './provider';
import { EmptyDraft, Steps } from '../ui';
export function BookingConfirmation() {
  const { receipt, reset } = useBooking();
  const [copyMessage, setCopyMessage] = useState('');
  async function copyReference() {
    if (!receipt) return;
    try {
      if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(receipt.reference);
      else {
        const field = document.createElement('textarea');
        field.value = receipt.reference;
        field.style.position = 'fixed'; field.style.opacity = '0';
        document.body.appendChild(field); field.select();
        let copied = false;
        try { copied = document.execCommand('copy'); } finally { field.remove(); }
        if (!copied) throw new Error('Clipboard unavailable');
      }
      setCopyMessage('Reference copied.');
    }
    catch { setCopyMessage('Unable to copy automatically. Select and copy the reference above.'); }
  }
  if (!receipt) return <section className="section"><div className="notice"><p>No booking receipt is available in this tab. If you already submitted a booking, check your email or contact the branch before booking again.</p></div><EmptyDraft /></section>;
  const pending = receipt.status === 'PENDING';
  return <section className="section confirmation"><Steps current={3} /><div className="panel"><div className={`confirmation-icon ${pending ? 'pending' : ''}`}>{pending ? <Clock3 size={36} /> : <CheckCircle2 size={36} />}</div><p className="eyebrow">THANK YOU FOR CHOOSING MSPACES</p><h1>{pending ? 'Your request is in.' : receipt.status === 'CONFIRMED' ? 'Your space is reserved.' : 'Your booking status'}</h1><span className={`status ${pending ? 'pending' : ''}`}>{pending ? 'Pending approval' : receipt.status.replaceAll('_',' ')}</span><p>{pending ? 'The branch team will review your request. Your booking is not yet confirmed.' : 'Keep your reference below for any questions about your visit.'}</p><div className="reference"><span>BOOKING REFERENCE</span><div className="reference-row"><strong>{receipt.reference}</strong><button type="button" className="copy-reference" onClick={copyReference} aria-label="Copy booking reference" title="Copy booking reference"><Copy size={20} /></button></div><p className="fine-print" role="status">{copyMessage}</p></div><dl className="review-details"><div><dt>Space</dt><dd>{receipt.spaceName} · {receipt.branchName}</dd></div><div><dt>Date</dt><dd>{dateLabel(receipt.startAt)}</dd></div><div><dt>Time</dt><dd>{time(receipt.startAt)} – {time(receipt.endAt)} (Philippine Time)</dd></div><div><dt>Guests</dt><dd>{receipt.guestCount}</dd></div></dl><p className="fine-print">Save this reference before leaving or refreshing the page. Reservation emails are sent when the branch’s email service is configured; delivery may take a few minutes.</p><div className="receipt-actions">{receipt.paymentRequired&&<Link className="button" href="/payment">Payment & status</Link>}<button type="button" className="button" onClick={() => downloadReceipt(receipt)}><Download size={18} /> Download PDF</button><Link className="text-link" href="/cancel">Request cancellation</Link></div><Link className="button" href="/" onClick={reset}>Explore more spaces <ArrowRight size={18} /></Link></div></section>;
}
