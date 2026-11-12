import { NextRequest } from "next/server";
import { forwardApiResponse } from "../../../proxy-response";

type Context = { params: Promise<{ path?: string[] }> };
async function proxy(
  request: NextRequest,
  context: Context,
): Promise<Response> {
  const { path = [] } = await context.params;
  let url: URL;
  try {
    url = new URL(
      `/admin/password-reset-requests${path.length ? `/${path.map(encodeURIComponent).join("/")}` : ""}${request.nextUrl.search}`,
      process.env.AUTH_API_URL ?? "http://localhost:4000",
    );
  } catch {
    return Response.json(
      { message: "Password service is temporarily unavailable." },
      { status: 503 },
    );
  }
  try {
    const cookie = request.headers.get("cookie");
    const upstream = await fetch(url, {
      method: request.method,
      headers: {
        ...(request.headers.get("content-type")
          ? { "Content-Type": request.headers.get("content-type")! }
          : {}),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      ...(request.method === "GET" ? {} : { body: await request.text() }),
      cache: "no-store",
      signal: AbortSignal.timeout(60_000),
    });
    return forwardApiResponse(upstream);
  } catch {
    return Response.json(
      { message: "Password service is temporarily unavailable." },
      { status: 503 },
    );
  }
}
export const GET = proxy;
export const POST = proxy;
