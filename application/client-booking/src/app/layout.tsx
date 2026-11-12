import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { BookingProvider } from '@/components/booking/provider';
import { CancellationLink } from '@/components/cancellation-link';
import './globals.css';
export const metadata: Metadata = { title: { default: 'Find your space | MSPACES', template: '%s | MSPACES' }, description: 'Find a meeting room or coworking space and book directly with MSPACES.' };
export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body><a className="skip" href="#main">Skip to content</a><header className="header"><Link className="brand" href="/" aria-label="MSPACES home"><span className="brand-mark">M</span>MSPACES<span className="brand-caption">ROOM TO DO MORE</span></Link><nav aria-label="Main"><CancellationLink /><Link className="header-action" href="/#spaces">Book a space <ArrowUpRight size={16} aria-hidden="true" /></Link></nav></header><BookingProvider><main id="main">{children}</main></BookingProvider><footer><Link className="footer-brand" href="/">MSPACES<span>Make room for what’s next.</span></Link><div><Link href="/policies">Booking terms & privacy</Link><span>All booking times are Philippine Time (UTC+8).</span></div></footer></body></html>;
}
