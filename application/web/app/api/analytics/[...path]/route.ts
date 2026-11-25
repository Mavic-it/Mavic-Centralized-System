import { NextRequest } from 'next/server';
import { forwardApiResponse } from '../../proxy-response';

export async function GET(request: NextRequest): Promise<Response> {
  const path = request.nextUrl.pathname.replace(/^\/api\/analytics\//, '');
  if (!['context', 'data'].includes(path)) return Response.json({ message: 'Dashboard endpoint not found.' }, { status: 404 });
  try {
    const target = new URL(`/analytics/${path}`, process.env.AUTH_API_URL ?? 'http://localhost:4000');
    if (!['http:', 'https:'].includes(target.protocol)) throw new Error('Unsupported API protocol');
    target.search = request.nextUrl.search;
    const upstream = await fetch(target, { headers: { Cookie: request.headers.get('cookie') ?? '' }, cache: 'no-store', signal: AbortSignal.timeout(60_000) });
    const response = forwardApiResponse(upstream);
    response.headers.set('Cache-Control', 'private, no-store');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    return response;
  } catch { return Response.json({ message: 'The report service is temporarily unavailable.' }, { status: 503, headers: { 'Cache-Control': 'private, no-store' } }); }
}
