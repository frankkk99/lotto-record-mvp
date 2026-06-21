import type { CustomerReport, Entry, NumberType, ResultInput } from "@/src/types";

export const defaultPayoutRate: Record<NumberType, number> = {
  "2_digit": 70,
  "3_digit": 500,
  "6_digit": 1000000
};

export const numberTypeLabel: Record<NumberType, string> = {
  "2_digit": "2 ตัว",
  "3_digit": "3 ตัว",
  "6_digit": "6 หลัก"
};

export function normalizeNumber(value: string): string {
  return value.replace(/\D/g, "").trim();
}

export function validateNumber(number: string, type: NumberType): string | null {
  const lengthMap: Record<NumberType, number> = {
    "2_digit": 2,
    "3_digit": 3,
    "6_digit": 6
  };

  if (!number) return "กรุณาใส่เลข";
  if (number.length !== lengthMap[type]) {
    return `เลขประเภท ${numberTypeLabel[type]} ต้องมี ${lengthMap[type]} หลัก`;
  }
  return null;
}

export function calculateEntries(entries: Entry[], result: ResultInput): Entry[] {
  return entries.map((entry) => {
    const matched =
      (entry.numberType === "2_digit" && entry.number === result.result2Digit) ||
      (entry.numberType === "3_digit" && entry.number === result.result3Digit) ||
      (entry.numberType === "6_digit" && entry.number === result.result6Digit);

    const prizeAmount = matched ? entry.amount * entry.payoutRate : 0;
    const netAmount = prizeAmount - entry.amount;

    return {
      ...entry,
      isWin: matched,
      prizeAmount,
      netAmount
    };
  });
}

export function buildCustomerReport(entries: Entry[]): CustomerReport[] {
  const map = new Map<string, CustomerReport>();

  for (const entry of entries) {
    const key = entry.customerName.trim() || "ไม่ระบุชื่อ";
    const current = map.get(key) ?? {
      customerName: key,
      totalEntries: 0,
      totalAmount: 0,
      totalPrize: 0,
      netAmount: 0,
      wins: 0
    };

    current.totalEntries += 1;
    current.totalAmount += entry.amount;
    current.totalPrize += entry.prizeAmount;
    current.netAmount = current.totalPrize - current.totalAmount;
    current.wins += entry.isWin ? 1 : 0;

    map.set(key, current);
  }

  return Array.from(map.values()).sort((a, b) => b.totalAmount - a.totalAmount);
}

export function formatMoney(value: number): string {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 0
  }).format(value);
}

export function buildLineSummary(roundDate: string, report: CustomerReport[], entries: Entry[]): string {
  const totalAmount = entries.reduce((sum, item) => sum + item.amount, 0);
  const totalPrize = entries.reduce((sum, item) => sum + item.prizeAmount, 0);
  const net = totalPrize - totalAmount;

  const lines = report
    .slice(0, 20)
    .map((item, index) => {
      const sign = item.netAmount >= 0 ? "+" : "";
      return `${index + 1}. ${item.customerName} | ยอด ${formatMoney(item.totalAmount)} | ถูก ${formatMoney(item.totalPrize)} | สุทธิ ${sign}${formatMoney(item.netAmount)}`;
    })
    .join("\n");

  return `สรุปงวด ${roundDate}\n\nยอดรวม: ${formatMoney(totalAmount)}\nยอดถูกรวม: ${formatMoney(totalPrize)}\nสุทธิรวม: ${net >= 0 ? "+" : ""}${formatMoney(net)}\nจำนวนรายการ: ${entries.length} รายการ\nจำนวนชื่อ: ${report.length} คน\n\n${lines || "ยังไม่มีข้อมูล"}\n\nหมายเหตุ: ระบบนี้เป็นเครื่องมือบันทึกและคำนวณข้อมูลเท่านั้น`;
}
