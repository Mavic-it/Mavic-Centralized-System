import { NextResponse, type NextRequest } from "next/server";
import { buildLoginRedirectUrl } from "./app/lib/route-access";

export function proxy(request: NextRequest) {
  if (request.cookies.get("mspaces_session")?.value) {
    return NextResponse.next();
  }

  const returnPath = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  const loginUrl = new URL(buildLoginRedirectUrl(returnPath), request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/",
    "/attendance/:path*",
    "/branches/:path*",
    "/employees/:path*",
    "/hr/:path*",
    "/leave/:path*",
    "/my-leave/:path*",
    "/my-profile/:path*",
    "/me/:path*",
    "/system/users/:path*",
    "/system/password-reset-requests/:path*",
  ],
};
