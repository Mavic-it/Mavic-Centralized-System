import { handleApiUnauthorized } from "./handle-api-unauthorized";

export type WorkspaceBranchAccess = {
  canSwitch: boolean;
  branches: { id: string; name: string }[];
  selectedBranchIds?: string[];
  activeBranchId?: string | null;
  allBranches?: boolean;
};

async function branchRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: "same-origin",
    cache: "no-store",
  });
  handleApiUnauthorized(response.status);
  const body = await response.json();
  if (!response.ok)
    throw new Error(
      typeof body.message === "string"
        ? body.message
        : "Unable to load branch access.",
    );
  return body as T;
}

export const loadWorkspaceBranchAccess = () =>
  branchRequest<WorkspaceBranchAccess>("/api/auth/branches");

// Collection selectors load the database-authorized branches, without truncating at
// the branch endpoint's default page size.
export async function loadActiveBranches(): Promise<
  { id: string; name: string }[]
> {
  const branches: { id: string; name: string }[] = [];
  for (let page = 1; ; page++) {
    const result = await branchRequest<{
      data: { id: string; name: string }[];
      meta: { total: number; pageSize: number };
    }>(`/api/branches?status=ACTIVE&page=${page}&pageSize=100`);
    branches.push(...result.data);
    if (page * result.meta.pageSize >= result.meta.total || !result.data.length)
      return branches;
  }
}
