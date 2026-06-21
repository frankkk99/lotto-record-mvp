export type NumberType =
  | "top_2"
  | "bottom_2"
  | "top_3"
  | "front_3"
  | "back_3"
  | "full_6"
  | "2_digit"
  | "3_digit"
  | "6_digit";

export type Entry = {
  id: string;
  roundDate: string;
  customerName: string;
  number: string;
  numberType: NumberType;
  amount: number;
  payoutRate: number;
  note: string;
  isWin: boolean;
  prizeAmount: number;
  netAmount: number;
  createdAt: string;
};

export type ResultInput = {
  firstPrize: string;
  top2: string;
  bottom2: string;
  top3: string;
  front3: string;
  back3: string;
};

export type CustomerReport = {
  customerName: string;
  totalEntries: number;
  totalAmount: number;
  totalPrize: number;
  netAmount: number;
  wins: number;
};

export type BulkDraft = {
  id: string;
  customerName: string;
  number: string;
  numberType: NumberType;
  amount: string;
  payoutRate: string;
  note: string;
  sourceLine: string;
  error?: string;
};
