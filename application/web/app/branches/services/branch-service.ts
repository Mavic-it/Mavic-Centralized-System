import { buildBranchPayload, type BranchFormValues } from "../branch-payload";
import type { Branch, BranchListResponse, BranchManagerOption, BranchStatus, Department } from "../branch-types";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/branches${path}`, {
    ...init,
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const payload = (await response.json().catch(() => ({}))) as {
    data?: T;
    message?: string | string[];
  };

  if (!response.ok) {
    throw new Error(
      Array.isArray(payload.message)
        ? payload.message.join(". ")
        : (payload.message ?? "The request could not be completed."),
    );
  }

  return payload.data as T;
}

export async function fetchBranches({
  search,
  status,
  page,
}: {
  search: string;
  status: string;
  page: number;
}): Promise<BranchListResponse> {
  const params = new URLSearchParams({
    search,
    status,
    page: String(page),
    pageSize: "10",
  });

  const response = await fetch(`/api/branches?${params}`, {
    credentials: "same-origin",
    cache: "no-store",
  });

  const body = (await response.json()) as {
    data?: Branch[];
    meta?: { total?: number; permissions?: { canDelete?: boolean } };
    message?: string | string[];
  };

  if (!response.ok) {
    throw new Error(
      Array.isArray(body.message)
        ? body.message.join(". ")
        : (body.message ?? "Unable to load branches."),
    );
  }

  return {
    items: body.data ?? [],
    total: body.meta?.total ?? 0,
    canDelete: body.meta?.permissions?.canDelete ?? false,
  };
}

export async function fetchBranchManagerOptions(
  branchId?: string,
): Promise<BranchManagerOption[]> {
  const params = new URLSearchParams();
  if (branchId) params.set("branchId", branchId);
  const query = branchId ? `?${params.toString()}` : "";
  return api<BranchManagerOption[]>(`/manager-options${query}`);
}

export function fetchBranch(id: string): Promise<Branch> {
  return api<Branch>(`/${encodeURIComponent(id)}`);
}

export async function fetchBranchDepartments(
  branchId: string,
): Promise<Department[]> {
  return api<Department[]>(`/${encodeURIComponent(branchId)}/departments`);
}

export async function createBranchDepartment(
  branchId: string,
  name: string,
): Promise<Department> {
  return api<Department>(`/${encodeURIComponent(branchId)}/departments`, {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function updateBranchDepartment(
  branchId: string,
  departmentId: string,
  name: string,
): Promise<Department> {
  return api<Department>(
    `/${encodeURIComponent(branchId)}/departments/${encodeURIComponent(departmentId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ name }),
    },
  );
}

export async function deleteBranchDepartment(
  branchId: string,
  departmentId: string,
): Promise<Department> {
  return api<Department>(
    `/${encodeURIComponent(branchId)}/departments/${encodeURIComponent(departmentId)}`,
    { method: "DELETE" },
  );
}

export async function createBranch(values: BranchFormValues): Promise<Branch> {
  return api<Branch>("", {
    method: "POST",
    body: JSON.stringify(buildBranchPayload(values, false)),
  });
}

export async function updateBranch(
  branchId: string,
  values: BranchFormValues,
): Promise<Branch> {
  return api<Branch>(`/${branchId}`, {
    method: "PATCH",
    body: JSON.stringify(buildBranchPayload(values, true)),
  });
}

export async function updateBranchStatus(
  branchId: string,
  nextStatus: BranchStatus,
): Promise<Branch> {
  return api<Branch>(`/${branchId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status: nextStatus }),
  });
}

export async function deleteBranch(
  branchId: string,
  password: string,
): Promise<Branch> {
  return api<Branch>(`/${branchId}`, {
    method: "DELETE",
    body: JSON.stringify({ currentPassword: password }),
  });
}
