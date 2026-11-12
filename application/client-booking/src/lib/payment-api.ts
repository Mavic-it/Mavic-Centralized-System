import { z } from "zod";
export const money = (amount: number) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(
    amount,
  );
const accountSchema = z.object({
  id: z.string(),
  branchId: z.string().nullable(),
  paymentMethod: z.enum(["BANK_TRANSFER", "GCASH"]),
  bankName: z.string().nullable(),
  accountName: z.string(),
  accountNumber: z.string(),
  qrCodeData: z.string().nullable(),
  instructions: z.string().nullable(),
  isDefault: z.boolean(),
  isActive: z.boolean(),
});
export const paymentSchema = z.object({
  reference: z.string(),
  customerName: z.string(),
  branchName: z.string(),
  spaceName: z.string(),
  startAt: z.string(),
  endAt: z.string(),
  amount: z.number(),
  paidAmount: z.number(),
  requiredAmount: z.number(),
  paymentStatus: z.string(),
  reservationStatus: z.string(),
  holdUntil: z.string().nullable(),
  paymentDeadline: z.string().nullable(),
  expired: z.boolean(),
  required: z.boolean(),
  maxProofBytes: z.number(),
  accounts: z.array(accountSchema),
  submissions: z.array(
    z.object({
      id: z.string(),
      paymentMethod: z.string(),
      transactionReference: z.string(),
      submittedAmount: z.number(),
      status: z.string(),
      rejectionReason: z.string().nullable(),
      verifiedAmount: z.number().nullable(),
      submittedAt: z.string(),
      verifiedAt: z.string().nullable(),
    }),
  ),
});
export type PaymentInfo = z.infer<typeof paymentSchema>;
export type PaymentAccount = z.infer<typeof accountSchema>;
export type PaymentAccess = { reference: string; token: string };
async function request<T>(
  access: PaymentAccess,
  path: string,
  schema: z.ZodType<T>,
  body?: unknown,
): Promise<T> {
  const response = await fetch(
    `/api/public/booking/reservations/${encodeURIComponent(access.reference)}/${path}`,
    {
      method: body ? "POST" : "GET",
      cache: "no-store",
      credentials: "omit",
      headers: {
        "x-booking-token": access.token,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(45000),
    },
  );
  const result: unknown = await response.json();
  if (!response.ok) {
    const parsed = z
      .object({ message: z.union([z.string(), z.array(z.string())]) })
      .safeParse(result);
    throw new Error(
      parsed.success
        ? Array.isArray(parsed.data.message)
          ? parsed.data.message.join(" ")
          : parsed.data.message
        : "Payment service unavailable. Please retry.",
    );
  }
  return schema.parse(result);
}
export const paymentApi = {
  load: (access: PaymentAccess) => request(access, "payment", paymentSchema),
  submit: (access: PaymentAccess, body: unknown) =>
    request(
      access,
      "payment-proof",
      z.object({ id: z.string(), status: z.string() }),
      body,
    ),
};
export async function fileBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(new Error("Unable to read the file."));
    reader.readAsDataURL(file);
  });
}
