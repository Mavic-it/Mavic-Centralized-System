import { z } from "zod";

export type BranchFormValues = {
  code: string;
  name: string;
  description: string;
  address: string;
  city: string;
  province: string;
  postalCode: string;
  phone: string;
  email: string;
  managerUserId: string;
  managerName: string;
  latitude: number | null;
  longitude: number | null;
};

export const LEGACY_BRANCH_MANAGER = "__legacy__";

export const branchFormSchema = z.object({
  code: z.string().trim().min(2, "Enter a branch code").max(50, "Branch code must be 50 characters or fewer").regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, "Use letters, numbers, hyphens, or underscores"),
  name: z.string().trim().min(1, "Enter a branch name").max(200, "Branch name must be 200 characters or fewer"),
  description: z.string().trim().max(2000, "Description must be 2,000 characters or fewer"),
  address: z.string().trim().min(1, "Enter an address").max(500, "Address must be 500 characters or fewer"),
  city: z.string().trim().min(1, "Enter a city").max(120, "City must be 120 characters or fewer"),
  province: z.string().trim().max(120, "Province must be 120 characters or fewer"),
  postalCode: z.string().trim().max(20, "Postal code must be 20 characters or fewer").regex(/^[A-Za-z0-9 -]*$/, "Use letters, numbers, spaces, or hyphens"),
  phone: z.string().trim().refine((value) => !value || /^\+?[0-9(). -]{7,30}$/.test(value), "Enter a valid phone number"),
  email: z.string().trim().refine((value) => !value || z.email().safeParse(value).success, "Enter a valid email address"),
  managerUserId: z.string().max(100, "Select a valid manager account"),
  managerName: z.string().trim().max(200, "Manager name must be 200 characters or fewer"),
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
}).superRefine((values, context) => {
  if ((values.latitude === null) !== (values.longitude === null)) {
    context.addIssue({ code: "custom", message: "Select a complete location from Google Maps", path: [values.latitude === null ? "latitude" : "longitude"] });
  }
});

export function buildBranchPayload(
  values: BranchFormValues,
  isEditing: boolean,
) {
  const { code, ...details } = values;
  const isLegacyManager = details.managerUserId === LEGACY_BRANCH_MANAGER;
  const normalizedDetails = {
    ...details,
    description: details.description || null,
    province: details.province || null,
    postalCode: details.postalCode || null,
    phone: details.phone || null,
    email: details.email || null,
    managerUserId:
      details.managerUserId && !isLegacyManager
        ? details.managerUserId
        : null,
    managerName: isLegacyManager ? details.managerName || null : null,
    latitude: details.latitude,
    longitude: details.longitude,
  };

  return isEditing
    ? normalizedDetails
    : { ...normalizedDetails, code: code.trim().toUpperCase() };
}
