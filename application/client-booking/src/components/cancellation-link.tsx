'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function CancellationLink() {
  const pathname = usePathname();
  if (pathname === '/cancel' || pathname === '/cancel/') return null;
  return <Link href="/cancel">Cancel a booking</Link>;
}
