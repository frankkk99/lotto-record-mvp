import type { CustomerReport, Entry, NumberType, ResultInput } from "@/src/types";

export const numberTypeOptions: NumberType[] = ["top_2", "bottom_2", "top_3", "front_3", "back_3", "full_6"];

export const defaultPayoutRate: Record<NumberType, number> = {
  top_2: 70,
  bottom_2: 70,
  top_3: 500,
  front_3: 500,
  back_3: 500,
  full_6: 1000000,
  "2_digit": 70,
  "3_digit": 500,
  "6_digit": 1000000
};

export const numberTypeLabel: Record<NumberType, string> = {
  top_2: "2 ตัวบน",
  bottom_2: "2 ตัวล่าง",
  top_3: "3 ตัวบน",
  front_3: "เลขหน้า 3 ตัว",
  back_3: "เลขท้าย 3 ตัว",
  full_6: "6 หลัก",
  "2_digit": "2 ตัว",
  "3_digit": "3 ตัว",
  "6_digit": "6 หลัก"
};

export const numberTypeHints: Record<NumberType, string> = {
  top_2: "เทียบกับช่อง 2 ตัวบน",
  bottom_2: "เทียบกับช่อง 2 ตัวล่าง",
  top_3: "เทียบกับช่อง 3 ตัวบน",
  front_3: "เทียบกับช่องเลขหน้า 3 ตัว",
  back_3: "เทียบกับช่องเลขท้าย 3 ตัว",
  full_6: "เทียบกับเลข 6 หลัก",
  "2_digit": "เลข 2 หลักแบบเดิม",
  "3_digit": "เลข 3 หลักแบบเดิม",
  "6_digit": "เลข 6 หลักแบบเดิม"
};

export const emptyResultInput: ResultInput = {
  firstPrize: "",
  top2: "",
  bottom2: "",
  top3: "",
  front3: "",
  back3: ""
};

export function normalizeNumber(value: string): string {
  return value.replace(/[๐-๙]/g, (digit) => String("๐๑๒๓๔๕๖๗๘๙".indexOf(digit))).replace(/\D/g, "").trim();
}

export function splitNumberList(value: string): string[] {
  return value.split(/[\s,，、/|]+/).map(normalizeNumber).filter(Boolean);
}

export function numberLength(type: NumberType): number {
  if (type === "full_6" || type === "6_digit") return 6;
  if (type === "top_3" || type === "front_3" || type === "back_3" || type === "3_digit") return 3;
  return 2;
}

export function validateNumber(number: string, type: NumberType): string | null {
  const length = numberLength(type);
  if (!number) return "กรุณาใส่เลข";
  if (number.length !== length) return `เลขประเภท ${numberTypeLabel[type]} ต้องมี ${length} หลัก`;
  return null;
}

export function normalizeResultInput(result: ResultInput): ResultInput {
  const firstPrize = normalizeNumber(result.firstPrize).slice(0, 6);
  return {
    firstPrize,
    top2: normalizeNumber(result.top2 || firstPrize.slice(-2)).slice(0, 2),
    bottom2: normalizeNumber(result.bottom2).slice(0, 2),
    top3: normalizeNumber(result.top3 || firstPrize.slice(-3)).slice(0, 3),
    front3: splitNumberList(result.front3).map((item) => item.slice(0, 3)).join(" "),
    back3: splitNumberList(result.back3).map((item) => item.slice(0, 3)).join(" ")
  };
}

function resultNumbersForType(type: NumberType, result: ResultInput): string[] {
  const clean = normalizeResultInput(result);
  const front3 = splitNumberList(clean.front3);
  const back3 = splitNumberList(clean.back3);
  if (type === "top_2") return [clean.top2].filter(Boolean);
  if (type === "bottom_2") return [clean.bottom2].filter(Boolean);
  if (type === "top_3") return [clean.top3].filter(Boolean);
  if (type === "front_3") return front3;
  if (type === "back_3") return back3;
  if (type === "full_6") return [clean.firstPrize].filter(Boolean);
  if (type === "2_digit") return [clean.bottom2, clean.top2].filter(Boolean);
  if (type === "3_digit") return [clean.top3, ...front3, ...back3].filter(Boolean);
  if (type === "6_digit") return [clean.firstPrize].filter(Boolean);
  return [];
}

export function calculateEntries(entries: Entry[], result: ResultInput): Entry[] {
  return entries.map((entry) => {
    const matched = resultNumbersForType(entry.numberType, result).includes(entry.number);
    const prizeAmount = matched ? entry.amount * entry.payoutRate : 0;
    const netAmount = prizeAmount - entry.amount;
    return { ...entry, isWin: matched, prizeAmount, netAmount };
  });
}

export function buildCustomerReport(entries: Entry[]): CustomerReport[] {
  const map = new Map<string, CustomerReport>();
  for (const entry of entries) {
    const key = entry.customerName.trim() || "ไม่ระบุชื่อ";
    const current = map.get(key) ?? { customerName: key, totalEntries: 0, totalAmount: 0, totalPrize: 0, netAmount: 0, wins: 0 };
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
  return new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", maximumFractionDigits: 0 }).format(value);
}

export function buildLineSummary(roundDate: string, report: CustomerReport[], entries: Entry[]): string {
  const totalAmount = entries.reduce((sum, item) => sum + item.amount, 0);
  const totalPrize = entries.reduce((sum, item) => sum + item.prizeAmount, 0);
  const net = totalPrize - totalAmount;
  const lines = report.slice(0, 30).map((item, index) => `${index + 1}. ${item.customerName} | ยอด ${formatMoney(item.totalAmount)} | ถูก ${formatMoney(item.totalPrize)} | สุทธิ ${item.netAmount >= 0 ? "+" : ""}${formatMoney(item.netAmount)}`).join("\n");
  return `สรุปงวด ${roundDate}\n\nยอดรวม: ${formatMoney(totalAmount)}\nยอดถูกรวม: ${formatMoney(totalPrize)}\nสุทธิรวม: ${net >= 0 ? "+" : ""}${formatMoney(net)}\nจำนวนรายการ: ${entries.length} รายการ\nจำนวนชื่อ: ${report.length} คน\n\n${lines || "ยังไม่มีข้อมูล"}\n\nหมายเหตุ: ระบบนี้เป็นเครื่องมือบันทึกและคำนวณข้อมูลเท่านั้น`;
}
