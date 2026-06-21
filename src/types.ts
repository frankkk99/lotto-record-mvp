export type NumberType = "2_digit" | "3_digit" | "6_digit";

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
  result2Digit: string;
  result3Digit: string;
  result6Digit: string;
};

export type CustomerReport = {
  customerName: string;
  totalEntries: number;
  totalAmount: number;
  totalPrize: number;
  netAmount: number;
  wins: number;
};
