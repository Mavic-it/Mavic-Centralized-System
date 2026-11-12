export type PaymentAccount = {
  id: string;
  branchId: string | null;
  paymentMethod: string;
  bankName: string | null;
  accountName: string;
  accountNumber: string;
  qrCodeData: string | null;
  instructions: string | null;
  isActive: boolean;
  isDefault: boolean;
};
export type PaymentPolicy = {
  holdMinutes: number;
  reviewMinutes: number;
  reminderMinutes: number;
  depositPercent: number;
};
export type PaymentCapabilities = { canEdit: boolean; canGlobal: boolean };
export type PaymentQueueRow = {
  id: string;
  reservationId: string;
  reference: string;
  customerName: string;
  branchName: string;
  spaceName: string;
  startAt: string;
  totalAmount: number;
  paymentMethod: string;
  submittedAmount: number;
  transactionReference: string;
  submittedAt: string;
  status: string;
  needsReconciliation: boolean;
  total: number;
};
export type PaymentDetail = PaymentQueueRow & {
  account: PaymentAccount;
  customerEmail: string;
  customerPhone: string;
  endAt: string;
  holdUntil: string | null;
  expiredAt: string | null;
  paymentDateTime: string;
  notes: string | null;
  verificationNotes: string | null;
  rejectionReason: string | null;
  verifiedAmount: number | null;
  verifiedBy: string | null;
  verifiedAt: string | null;
  reservationStatus: string;
  history: {
    action: string;
    notes: string | null;
    createdAt: string;
    performedBy: string | null;
  }[];
};
export const paymentMoney = (amount: number) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(
    amount,
  );
export const paymentDate = (value: string) =>
  new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(new Date(value));
