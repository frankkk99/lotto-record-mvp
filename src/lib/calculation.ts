import type { CustomerReport, EntryKind, NumberEntry, PaymentStatus } from "@/src/types";

export const kindLabel: Record<EntryKind, string> = {
  two_top: "2 ตัวบน",
  two_bottom: "2 ตัวล่าง",
  three_direct: "3 ตัวตรง",
  three_tod: "3 ตัวโต๊ด",
  run_top: "วิ่งบน",
  run_bottom: "วิ่งล่าง"
};

export const kindShortLabel: Record<EntryKind, string> = {
  two_top: "บน",
  two_bottom: "ล่าง",
  three_direct: "ตรง",
  three_tod: "โต๊ด",
  run_top: "วิ่งบน",
  run_bottom: "วิ่งล่าง"
};

export const paymentLabel: Record<PaymentStatus, string> = {
  paid: "จ่ายแล้ว",
  unpaid: "ค้างจ่าย"
};

export function normalizeNumber(value: string): string {
  return value
    .replace(/[๐-๙]/g, (digit) => String("๐๑๒๓๔๕๖๗๘๙".indexOf(digit)))
    .replace(/\D/g, "")
    .trim();
}

export function expectedDigits(kind: EntryKind): number {
  if (kind === "run_top" || kind === "run_bottom") return 1;
  if (kind === "three_direct" || kind === "three_tod") return 3;
  return 2;
}

export function validateNumberForKind(number: string, kind: EntryKind): string | null {
  const digits = expectedDigits(kind);
  if (!number) return "กรุณากดเลข";
  if (number.length !== digits) return `ประเภทนี้ต้องใช้เลข ${digits} หลัก`;
  return null;
}

export function sanitizeAmount(value: string): string {
  const clean = value.replace(/[^0-9.]/g, "");
  const parts = clean.split(".");
  return parts.length > 1 ? `${parts[0]}.${parts.slice(1).join("").slice(0, 2)}` : clean;
}

export function formatMoney(value: number): string {
  return new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", maximumFractionDigits: 0 }).format(value || 0);
}

export function sameCustomer(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function reverseNumbers(number: string, kind: EntryKind): string[] {
  const clean = normalizeNumber(number);
  if (kind === "run_top" || kind === "run_bottom") return [clean];
  if (clean.length <= 1) return [clean];

  const result = new Set<string>();
  function permute(prefix: string, rest: string) {
    if (!rest) {
      result.add(prefix);
      return;
    }
    for (let index = 0; index < rest.length; index += 1) {
      permute(prefix + rest[index], rest.slice(0, index) + rest.slice(index + 1));
    }
  }

  permute("", clean);
  return Array.from(result).sort();
}

export function buildCustomerReport(entries: NumberEntry[]): CustomerReport[] {
  const map = new Map<string, CustomerReport>();

  for (const entry of entries) {
    const key = entry.customerName.trim() || "ไม่ระบุชื่อ";
    const current = map.get(key) ?? {
      customerName: key,
      totalEntries: 0,
      totalAmount: 0,
      paidAmount: 0,
      unpaidAmount: 0,
      latestAt: entry.createdAt
    };

    current.totalEntries += 1;
    current.totalAmount += entry.amount;
    if (entry.paymentStatus === "paid") current.paidAmount += entry.amount;
    if (entry.paymentStatus === "unpaid") current.unpaidAmount += entry.amount;
    if (entry.createdAt > current.latestAt) current.latestAt = entry.createdAt;
    map.set(key, current);
  }

  return Array.from(map.values()).sort((a, b) => b.totalAmount - a.totalAmount);
}

export function buildLineSummary(drawDate: string, report: CustomerReport[], entries: NumberEntry[]): string {
  const totalAmount = entries.reduce((sum, entry) => sum + entry.amount, 0);
  const paidAmount = entries.filter((entry) => entry.paymentStatus === "paid").reduce((sum, entry) => sum + entry.amount, 0);
  const unpaidAmount = totalAmount - paidAmount;
  const lines = report
    .slice(0, 50)
    .map((item, index) => `${index + 1}. ${item.customerName} | ${item.totalEntries} รายการ | รวม ${formatMoney(item.totalAmount)} | ค้าง ${formatMoney(item.unpaidAmount)}`)
    .join("\n");

  return `สรุปงวด ${drawDate}\n\nรายการทั้งหมด: ${entries.length} รายการ\nยอดรวม: ${formatMoney(totalAmount)}\nจ่ายแล้ว: ${formatMoney(paidAmount)}\nค้างจ่าย: ${formatMoney(unpaidAmount)}\n\n${lines || "ยังไม่มีข้อมูล"}\n\nหมายเหตุ: ระบบนี้เป็นเครื่องมือบันทึกข้อมูลส่วนตัว ไม่มีระบบฝากถอน รับเงินออนไลน์ หรือจ่ายเงินในระบบ`;
}
