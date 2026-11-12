import { forwardApiResponse } from "../../proxy-response";

export async function POST(request: Request): Promise<Response> {
  let url: URL;
  try {
    url = new URL(
      "/auth/password-reset-requests",
      process.env.AUTH_API_URL ?? "http://localhost:4000",
    );
  } catch {
    return Response.json(
      { message: "Password recovery is temporarily unavailable." },
      { status: 503 },
    );
  }
  try {
    const upstream = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: await request.text(),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    return forwardApiResponse(upstream);
  } catch {
    return Response.json(
      { message: "Password recovery is temporarily unavailable." },
      { status: 503 },
    );
  }
}
