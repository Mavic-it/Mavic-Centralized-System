import { CancellationForm } from '@/components/booking/cancellation';
export default function CancelPage() {
  return <section className="section booking-page"><div className="page-heading"><p className="eyebrow">MANAGE YOUR BOOKING</p><h1>Request a cancellation</h1><p>Enter or paste your reservation reference. Your booking stays active until an admin approves cancellation.</p></div><CancellationForm /></section>;
}
