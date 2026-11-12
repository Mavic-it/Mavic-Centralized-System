import type { NextRequest } from "next/server";
import { proxyBranchContext } from "../branch-proxy";

export function GET(request: NextRequest) {
  return proxyBranchContext(request, "branches");
}
