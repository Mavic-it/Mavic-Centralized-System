import type { BranchFormValues } from "./branch-payload";

export type BranchStatus = "ACTIVE" | "INACTIVE";

export type Department = {
  id: string;
  branchId: string;
  name: string;
  createdAt: string;
};

export type Branch = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  address: string;
  city: string;
  province: string | null;
  postalCode: string | null;
  phone: string | null;
  email: string | null;
  managerName: string | null;
  managerUserId: string | null;
  status: BranchStatus;
  createdAt: string;
  updatedAt: string;
  latitude: number | null;
  longitude: number | null;
  employeeCount: number;
  roomCount: number;
  reservationCount: number;
  inquiryCount: number;
  inventoryItemCount: number;
};

export type BranchManagerOption = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  status: string;
  branchId?: string | null;
  branchName?: string | null;
  isAssignable: boolean;
  unavailableReason: string | null;
  managedBranches: Array<{ id: string; name: string }>;
};

export type BranchForm = BranchFormValues;

export type BranchListResponse = {
  items: Branch[];
  total: number;
  canDelete: boolean;
};

export const emptyBranchForm: BranchForm = {
  code: "",
  name: "",
  description: "",
  address: "",
  city: "",
  province: "",
  postalCode: "",
  phone: "",
  email: "",
  managerUserId: "",
  managerName: "",
  latitude: null,
  longitude: null,
};
