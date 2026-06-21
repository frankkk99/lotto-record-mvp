import type { Entry, HolderReport, PrizeMatch, PrizeType, ResultInput } from "@/src/types";

export const officialPrizeAmount: Record<PrizeType, number> = {
  first_prize: 6000000,
  front_3: 4000,
  back_3: 4000,
  bottom_2: 2000
};

export const prizeTypeLabel: Record<PrizeType, string> = {
  first_prize: "รางวัลที่ 1",
  front_3: "เลขหน้า 3 ตัว",
  back_3: "เลขท้าย 3 ตัว",
  bottom_2: "เลขท้าย 2 ตัว"
};

export const emptyResultInput: ResultInput = {
  firstPrize: "",
  front3: "",
  back3: "",
  bottom2: ""
};

export function normalizeNumber(value: string): string {
  return value
    .replace(/[๐-๙]/g, (digit) => String("๐๑๒๓๔๕๖๗๘๙".indexOf(digit)))
    .replace(/\D/g, "")
    .trim();
}

export function splitNumberList(value: string, length: number): string[] {
  return value
    .split(/[\s,，、/|]+/)
    .map(normalizeNumber)
    .filter((item) => item.length === length);
}

export function validateLotteryNumber(number: string): string | null {
  if (!number) return "กรุณาใส่เลขสลาก";
  if (number.length !== 6) return "เลขสลากต้องมี 6 หลัก";
  return null;
}

export function normalizeResultInput(result: ResultInput): ResultInput {
  return {
    firstPrize: normalizeNumber(result.firstPrize).slice(0, 6),
    front3: splitNumberList(result.front3, 3).join(" "),
    back3: splitNumberList(result.back3, 3).join(" "),
    bottom2: normalizeNumber(result.bottom2).slice(0, 2)
  };
}

export function calculateEntryCost(entry: Pick<Entry, "quantity" | "pricePerTicket">): number {
  return entry.quantity * entry.pricePerTicket;
}

export function calculateMatches(lotteryNumber: string, result: ResultInput): PrizeMatch[] {
  const clean = normalizeResultInput(result);
  const front3 = lotteryNumber.slice(0, 3);
  const back3 = lotteryNumber.slice(-3);
  const bottom2 = lotteryNumber.slice(-2);
  const matches: PrizeMatch[] = [];

  if (clean.firstPrize && lotteryNumber === clean.firstPrize) {
    matches.push({ type: "first_prize", label: prizeTypeLabel.first_prize, amountPerTicket: officialPrizeAmount.first_prize });
  }

  if (clean.front3 && splitNumberList(clean.front3, 3).includes(front3)) {
    matches.push({ type: "front_3", label: prizeTypeLabel.front_3, amountPerTicket: officialPrizeAmount.front_3 });
  }

  if (clean.back3 && splitNumberList(clean.back3, 3).includes(back3)) {
    matches.push({ type: "back_3", label: prizeTypeLabel.back_3, amountPerTicket: officialPrizeAmount.back_3 });
  }

  if (clean.bottom2 && bottom2 === clean.bottom2) {
    matches.push({ type: "bottom_2", label: prizeTypeLabel.bottom_2, amountPerTicket: officialPrizeAmount.bottom_2 });
  }

  return matches;
}

export function calculateEntries(entries: Entry[], result: ResultInput): Entry[] {
  return entries.map((entry) => {
    const matchedPrizes = calculateMatches(entry.lotteryNumber, result);
    const rewardAmount = matchedPrizes.reduce((sum, prize) => sum + prize.amountPerTicket * entry.quantity, 0);
    const netAmount = rewardAmount - calculateEntryCost(entry);
    return { ...entry, matchedPrizes, rewardAmount, netAmount };
  });
}

export function buildHolderReport(entries: Entry[]): HolderReport[] {
  const map = new Map<string, HolderReport>();

  for (const entry of entries) {
    const key = entry.holderName.trim() || "ไม่ระบุชื่อ";
    const current = map.get(key) ?? {
      holderName: key,
      totalEntries: 0,
      totalTickets: 0,
      totalCost: 0,
      totalReward: 0,
      netAmount: 0,
      wins: 0
    };

    current.totalEntries += 1;
    current.totalTickets += entry.quantity;
    current.totalCost += calculateEntryCost(entry);
    current.totalReward += entry.rewardAmount;
    current.netAmount = current.totalReward - current.totalCost;
    current.wins += entry.matchedPrizes.length > 0 ? 1 : 0;
    map.set(key, current);
  }

  return Array.from(map.values()).sort((a, b) => b.totalCost - a.totalCost);
}

export function formatMoney(value: number): string {
  return new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", maximumFractionDigits: 0 }).format(value);
}

export function buildLineSummary(drawDate: string, report: HolderReport[], entries: Entry[]): string {
  const totalTickets = entries.reduce((sum, entry) => sum + entry.quantity, 0);
  const totalCost = entries.reduce((sum, entry) => sum + calculateEntryCost(entry), 0);
  const totalReward = entries.reduce((sum, entry) => sum + entry.rewardAmount, 0);
  const net = totalReward - totalCost;
  const lines = report
    .slice(0, 30)
    .map((item, index) => `${index + 1}. ${item.holderName} | ${item.totalTickets} ใบ | ยอด ${formatMoney(item.totalCost)} | รางวัล ${formatMoney(item.totalReward)} | สุทธิ ${item.netAmount >= 0 ? "+" : ""}${formatMoney(item.netAmount)}`)
    .join("\n");

  return `สรุปงวด ${drawDate}\n\nจำนวนรายการ: ${entries.length} รายการ\nจำนวนสลาก: ${totalTickets} ใบ\nยอดรวม: ${formatMoney(totalCost)}\nรางวัลรวม: ${formatMoney(totalReward)}\nสุทธิรวม: ${net >= 0 ? "+" : ""}${formatMoney(net)}\n\n${lines || "ยังไม่มีข้อมูล"}\n\nหมายเหตุ: ระบบนี้เป็นเครื่องมือบันทึกและตรวจคำนวณข้อมูลสลากส่วนตัวเท่านั้น ไม่ใช่ระบบจำหน่ายสลาก รับแทง หรือจ่ายเงิน`;
}
