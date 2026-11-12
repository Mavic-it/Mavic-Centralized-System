import type { NextRequest } from "next/server";
import { proxyBranchContext } from "../branch-proxy";

export function POST(request: NextRequest) {
  return proxyBranchContext(request, "branch");
}
