import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';
describe('analytics same-origin proxy', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  it('forwards the session and exact filters without caching', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ panels: [] })); vi.stubGlobal('fetch', fetch);
    const response = await GET(new NextRequest('http://localhost/api/analytics/data?mode=hr&branchId=a&from=2026-11-01&to=2026-11-20', { headers: { cookie: 'mspaces_session=fixture' } }));
    expect(String(fetch.mock.calls[0][0])).toBe('http://localhost:4000/analytics/data?mode=hr&branchId=a&from=2026-11-01&to=2026-11-20');
    expect(fetch.mock.calls[0][1].headers.Cookie).toBe('mspaces_session=fixture');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });
  it('rejects the removed export endpoint and preserves forbidden responses', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    expect((await GET(new NextRequest('http://localhost/api/analytics/export?mode=reports'))).status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ message: 'Denied' }, { status: 403 })));
    expect((await GET(new NextRequest('http://localhost/api/analytics/data'))).status).toBe(403);
  });
  it('rejects unknown proxy paths and reports upstream failures', async () => {
    const fetch = vi.fn().mockRejectedValue(new Error('offline')); vi.stubGlobal('fetch', fetch);
    expect((await GET(new NextRequest('http://localhost/api/analytics/private'))).status).toBe(404); expect(fetch).not.toHaveBeenCalled();
    expect((await GET(new NextRequest('http://localhost/api/analytics/data'))).status).toBe(503);
  });
});
