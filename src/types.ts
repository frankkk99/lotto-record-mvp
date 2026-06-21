export type PrizeType = "first_prize" | "front_3" | "back_3" | "bottom_2";

export type PrizeMatch = {
  type: PrizeType;
  label: string;
  amountPerTicket: number;
};

export type Entry = {
  id: string;
  drawDate: string;
  holderName: string;
  lotteryNumber: string;
  quantity: number;
  pricePerTicket: number;
  note: string;
  matchedPrizes: PrizeMatch[];
  rewardAmount: number;
  netAmount: number;
  createdAt: string;
};

export type ResultInput = {
  firstPrize: string;
  front3: string;
  back3: string;
  bottom2: string;
};

export type HolderReport = {
  holderName: string;
  totalEntries: number;
  totalTickets: number;
  totalCost: number;
  totalReward: number;
  netAmount: number;
  wins: number;
};

export type BulkDraft = {
  id: string;
  holderName: string;
  lotteryNumber: string;
  quantity: string;
  pricePerTicket: string;
  note: string;
  sourceLine: string;
  error?: string;
};
