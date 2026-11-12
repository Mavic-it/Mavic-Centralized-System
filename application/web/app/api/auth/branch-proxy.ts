import type { NextRequest } from "next/server";
import { forwardApiResponse } from "../proxy-response";

export async function proxyBranchContext(
  request: NextRequest,
  path: "branch" | "branches",
) {
  let body: string | undefined;
  if (request.method === "POST") {
    const origin = request.headers.get("origin");
    if (origin && origin !== request.nextUrl.origin) {
      return Response.json(
        { message: "Branch changes must come from this workspace." },
        { status: 403 },
      );
    }
    try {
      const raw = await request.text();
      if (raw.length > 131072)
        return Response.json(
          { message: "Request is too large." },
          { status: 413 },
        );
      const input = JSON.parse(raw) as {
        branchId?: unknown;
        branchIds?: unknown;
        allBranches?: unknown;
      };
      if (input.allBranches === true)
        body = JSON.stringify({ allBranches: true });
      else if (
        Array.isArray(input.branchIds) &&
        input.branchIds.length > 0 &&
        input.branchIds.length <= 1000 &&
        new Set(input.branchIds).size === input.branchIds.length &&
        input.branchIds.every(
          (id) => typeof id === "string" && id.trim() && id.length <= 100,
        )
      )
        body = JSON.stringify({ branchIds: input.branchIds });
      else if (
        typeof input.branchId === "string" &&
        input.branchId.trim() &&
        input.branchId.length <= 100
      )
        body = JSON.stringify({ branchId: input.branchId });
      else
        return Response.json(
          { message: "Choose at least one valid branch." },
          { status: 400 },
        );
    } catch {
      return Response.json(
        { message: "Choose a valid branch." },
        { status: 400 },
      );
    }
  }
  try {
    const target = new URL(
      `/auth/${path}`,
      process.env.AUTH_API_URL ?? "http://localhost:4000",
    );
    if (target.protocol !== "http:" && target.protocol !== "https:")
      throw new Error();
    const cookie = request.headers.get("cookie");
    const upstream = await fetch(target, {
      method: request.method,
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    const response = forwardApiResponse(upstream);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch {
    return Response.json(
      { message: "Branch access is temporarily unavailable." },
      { status: 503 },
    );
  }
}
