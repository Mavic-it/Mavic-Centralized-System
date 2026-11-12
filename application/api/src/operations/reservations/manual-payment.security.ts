import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';

export function bookingPaymentToken(
  reference: string,
  keyHash: string,
): string {
  const secret = process.env.PAYMENT_ACCESS_SECRET;
  if (!secret || secret.length < 32)
    throw new ServiceUnavailableException(
      'Secure payment access is not configured. Contact the branch.',
    );
  return createHmac('sha256', secret)
    .update(`${reference}:${keyHash}`)
    .digest('hex');
}
export function matchesPaymentToken(
  token: string,
  reference: string,
  keyHash: string,
): boolean {
  if (!/^[a-f0-9]{64}$/.test(token)) return false;
  return timingSafeEqual(
    Buffer.from(token),
    Buffer.from(bookingPaymentToken(reference, keyHash)),
  );
}
export const proofLimit = () =>
  Math.min(10, Math.max(1, Number(process.env.PAYMENT_PROOF_MAX_MB) || 5)) *
  1024 *
  1024;
export function validatePaymentFile(base64: string, mime: string): Buffer {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64) || base64.length % 4)
    throw new BadRequestException('Invalid proof file.');
  const bytes = Buffer.from(base64, 'base64');
  if (!bytes.length || bytes.length > proofLimit())
    throw new BadRequestException(
      `Proof must be at most ${proofLimit() / 1024 / 1024} MB.`,
    );
  const valid =
    mime === 'image/jpeg'
      ? bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
      : mime === 'image/png'
        ? bytes
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : mime === 'application/pdf' &&
          bytes.subarray(0, 5).toString() === '%PDF-' &&
          bytes.subarray(-1024).toString().includes('%%EOF');
  if (!valid)
    throw new BadRequestException(
      'The file content does not match a supported JPG, PNG or PDF.',
    );
  return bytes;
}
