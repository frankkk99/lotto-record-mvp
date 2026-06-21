export type EntryKind = "two_top" | "two_bottom" | "three_direct" | "three_tod" | "run_top" | "run_bottom";

export type PaymentStatus = "paid" | "unpaid";

export type NumberEntry = {
  id: string;
  drawDate: string;
  customerName: string;
  number: string;
  kind: EntryKind;
  amount: number;
  paymentStatus: PaymentStatus;
  note: string;
  createdAt: string;
  updatedAt?: string;
};

export type CustomerReport = {
  customerName: string;
  totalEntries: number;
  totalAmount: number;
  paidAmount: number;
  unpaidAmount: number;
  latestAt: string;
};

export type BulkDraft = {
  id: string;
  customerName: string;
  number: string;
  kind: EntryKind;
  amount: string;
  paymentStatus: PaymentStatus;
  note: string;
  sourceLine: string;
  error?: string;
};
