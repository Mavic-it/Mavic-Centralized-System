export function forwardApiResponse(upstream: Response): Response {
  const headers = new Headers({
    "Content-Type": upstream.headers.get("content-type") ?? "application/json",
  });

  for (const cookie of upstream.headers.getSetCookie()) {
    headers.append("Set-Cookie", cookie);
  }
  for (const name of [
    "Content-Disposition",
    "Content-Length",
    "Cache-Control",
    "X-Content-Type-Options",
    "Content-Security-Policy",
  ]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers,
  });
}
