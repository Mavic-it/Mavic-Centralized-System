'use client';
import { useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
export function CancellationForm() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await api.requestCancellation({ reference: String(data.get('reference')).trim().toUpperCase(), customerEmail: String(data.get('email')).trim().toLowerCase(), reason: String(data.get('reason')).trim() });
      setMessage(result.message); form.reset();
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to send your request. Please try again.'); }
    finally { setBusy(false); }
  }
  return <form className="panel cancellation-form" onSubmit={submit}>
    <label htmlFor="cancel-reference">Booking reference <span className="required" aria-hidden="true">*</span></label><input id="cancel-reference" name="reference" placeholder="RSV-XXXXXXXX-XXXXXXXX" required maxLength={100} pattern="[Rr][Ss][Vv]-[A-Za-z0-9]+-[A-Za-z0-9]+" disabled={busy} />
    <label htmlFor="cancel-email">Email used for the booking <span className="required" aria-hidden="true">*</span></label><input id="cancel-email" name="email" type="email" autoComplete="email" required maxLength={320} disabled={busy} />
    <label htmlFor="cancel-reason">Reason for cancellation <span className="required" aria-hidden="true">*</span></label><textarea id="cancel-reason" name="reason" required minLength={3} maxLength={1000} rows={4} disabled={busy} />
    {error && <p className="notice" role="alert">{error}</p>}{message && <p className="notice" role="status">{message}</p>}
    <button className="button" disabled={busy}>{busy ? 'Sending request…' : 'Request cancellation'}</button>
  </form>;
}
