import { z } from "zod";
const id = z.string().min(1).max(200);
const nullable = z.string().nullable();
export const inquirySchema = z.object({
  id,
  reference: id,
  branchId: id,
  branchName: z.string(),
  customerId: nullable,
  clientName: z
    .string()
    .nullable()
    .transform((v) => v ?? "Historical client"),
  client: z.object({
    companyName: z.string().optional(),
    contactPerson: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
  }),
  inquiryDate: nullable,
  assignedStaffId: id,
  assignedStaffName: nullable,
  status: id,
  priority: id,
  description: z.string(),
  requirements: z.string(),
  notes: z.string(),
  budget: z.number().nullable(),
  pax: z.number().nullable(),
  preferredStart: nullable,
  preferredEnd: nullable,
  channelId: nullable,
  sourceId: nullable,
  nextAction: nullable,
  legacyOutcome: nullable,
  archivedAt: nullable,
  version: z.number().int().positive(),
  preferredBranchIds: z.array(id),
  serviceIds: z.array(id),
});
const task = z.object({
  version: z.number().optional(),
  actionType: z.string().optional(),
  priority: z.string().optional(),
  id,
  inquiryId: id.optional(),
  reference: z.string().optional(),
  clientName: z.string().nullable().optional(),
  description: z.string(),
  dueAt: z.string(),
  status: id,
  result: nullable,
  assignedStaffId: id,
  assignedStaffName: nullable.optional(),
});
const metadata = z.object({
  branches: z.array(z.object({ id, name: z.string() })),
  staff: z.array(z.object({ id, name: z.string(), branchId: nullable })),
  lookups: z.array(
    z.object({
      id,
      kind: id,
      label: z.string(),
      position: z.number(),
      active: z.boolean(),
      reservable: z.boolean(),
    }),
  ),
  permissions: z.record(z.string(), z.boolean()),
  userId: id,
});
const detail = z.object({
  record: inquirySchema,
  events: z.array(
    z.object({
      id,
      type: id,
      description: z.string(),
      previousStatus: nullable,
      newStatus: nullable,
      occurredAt: nullable,
      createdAt: z.string(),
      actorName: nullable,
    }),
  ),
  tasks: z.array(task),
  importSource: z
    .object({
      batchId: id,
      worksheet: z.string(),
      rowNumber: z.number(),
      importedAt: z.string(),
      normalized: z.object({
        warnings: z.array(z.string()).optional(),
        raw: z.array(z.unknown()).optional(),
        reservationDate: nullable.optional(),
        followUpDate: nullable.optional(),
      }),
    })
    .nullable()
    .optional(),
  reservations: z
    .array(
      z.object({
        id,
        reference: z.string(),
        status: id,
        startAt: z.string(),
        endAt: z.string(),
      }),
    )
    .optional(),
});
const collection = z.object({
  items: z.array(inquirySchema),
  total: z.number().nonnegative(),
  page: z.number().positive(),
  pageSize: z.number().positive(),
});
const analytics = z.object({
  totals: z.record(z.string(), z.number()),
  groups: z.record(
    z.string(),
    z.array(
      z.object({
        label: z.string(),
        count: z.number(),
        converted: z.number(),
        staffId: z.string().nullable().optional(),
        branchId: z.string().optional(),
      }),
    ),
  ),
  followups: z.object({
    today: z.number(),
    overdue: z.number(),
    completed: z.number(),
  }),
});
const importPreview = z.object({
  checksum: z.string(),
  total: z.number(),
  skipped: z.number(),
  sheets: z.array(
    z.object({
      name: z.string(),
      headerRow: z.number(),
      headers: z.array(z.string()),
      columns: z.record(z.string(), z.number()),
    }),
  ),
  rows: z.array(
    z.object({
      sheet: z.string(),
      row: z.number(),
      clientName: z.string(),
      date: nullable,
      status: z.string(),
      warnings: z.array(z.string()),
      duplicate: z.boolean(),
      serviceIds: z.array(z.string()),
      channelId: z.string().optional(),
      sourceId: z.string().optional(),
      skip: z.boolean(),
    }),
  ),
});
export function validateInquiryResponse(
  path: string,
  data: unknown,
  write: boolean,
): unknown {
  const route = path.split("?")[0];
  const schema =
    route === "/import/preview"
      ? importPreview
      : route === "/import/confirm"
        ? z.object({
            imported: z.number(),
            duplicates: z.number(),
            review: z.number(),
            skipped: z.number(),
            checksum: z.string(),
          })
        : route === "/settings/reminders"
          ? z.object({
              enabled: z.boolean(),
              overdueEnabled: z.boolean(),
              leadMinutes: z.number(),
              escalationHours: z.number(),
            })
          : route === "/metadata"
            ? metadata
            : route === "/dashboard" || route === "/reports"
              ? analytics
              : route === "/followups"
                ? z.object({
                    items: z.array(task),
                    total: z.number(),
                    page: z.number(),
                    pageSize: z.number(),
                  })
                : route === "/customers"
                  ? z.array(
                      z.object({
                        id,
                        name: z.string(),
                        email: nullable,
                        phone: nullable,
                      }),
                    )
                  : route === "" && !write
                    ? collection
                    : !route.startsWith("/import") &&
                        !route.startsWith("/settings") &&
                        route !== "/bulk"
                      ? detail
                      : undefined;
  if (!schema) return data;
  const result = schema.safeParse(data);
  if (!result.success)
    throw new Error(
      "Inquiry service returned an invalid response. Please retry.",
    );
  return result.data;
}
