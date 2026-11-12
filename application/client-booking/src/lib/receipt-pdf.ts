import type { Receipt } from '@/types/booking';
import { dateLabel, time } from './date-time';

// A single-page PDF with byte-accurate offsets; no remote service receives booking details.
export function downloadReceipt(receipt: Receipt) {
  const escape = (value: string) => value.replace(/[^\x20-\x7e]/g, '-').replace(/([\\()])/g, '\\$1');
  const lines = [
    'MSPACES - Reservation receipt',
    `Booking reference: ${receipt.reference}`,
    `Status: ${receipt.status.replaceAll('_', ' ')}`,
    `Space: ${receipt.spaceName}`,
    `Branch: ${receipt.branchName}`,
    `Date: ${dateLabel(receipt.startAt)}`,
    `Time: ${time(receipt.startAt)} - ${time(receipt.endAt)} (Philippine Time)`,
    `Guests: ${receipt.guestCount}`,
    ...(receipt.status === 'PENDING' ? ['Your request is pending approval. Your booking is not yet confirmed.'] : []),
    'Keep this reference for questions or cancellation requests.',
    `Downloaded: ${new Date().toISOString()}. Status reflects the receipt at submission.`,
  ];
  // Wrap long branch and space names to the page width.
  const wrapped = lines.flatMap(line => line.match(/.{1,76}(?:\s|$)|.{1,76}/g)?.map(s => s.trim()) ?? ['']);
  const stream = `BT /F1 12 Tf 50 790 Td 22 TL\n${wrapped.map((line, i) => `${i ? 'T* ' : ''}(${escape(line)}) Tj`).join('\n')}\nET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const url = URL.createObjectURL(new Blob([pdf], { type: 'application/pdf' }));
  const link = document.createElement('a');
  link.href = url; link.download = `${receipt.reference}.pdf`;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
