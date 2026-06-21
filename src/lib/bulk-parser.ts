import type { BulkDraft, EntryKind, PaymentStatus } from "@/src/types";
import { expectedDigits, kindLabel, normalizeNumber, validateNumberForKind } from "@/src/lib/calculation";

function makeDraftId(index: number) {
  return `draft-${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`;
}

function normalizeThaiDigits(value: string) {
  return value.replace(/[๐-๙]/g, (digit) => String("๐๑๒๓๔๕๖๗๘๙".indexOf(digit)));
}

function detectKind(line: string): EntryKind {
  const value = line.toLowerCase();
  if (/วิ่ง\s*ล่าง|วิ่งล่าง/.test(value)) return "run_bottom";
  if (/วิ่ง\s*บน|วิ่งบน/.test(value)) return "run_top";
  if (/โต๊ด|โตด/.test(value)) return "three_tod";
  if (/ตรง|3\s*ตัว/.test(value)) return "three_direct";
  if (/ล่าง|ล/.test(value)) return "two_bottom";
  return "two_top";
}

function detectPaymentStatus(line: string): PaymentStatus {
  if (/ค้าง|ยังไม่จ่าย|ติดไว้/.test(line)) return "unpaid";
  return "paid";
}

function cleanName(value: string) {
  return value
    .replace(/ชื่อ[:：]?/g, "")
    .replace(/เลข[:：]?/g, "")
    .replace(/บน|ล่าง|ตรง|โต๊ด|โตด|วิ่งบน|วิ่งล่าง|บาท|จ่ายแล้ว|ค้างจ่าย|ค้าง/g, " ")
    .replace(/[=:+|/\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectAmount(line: string, number: string): string {
  const normalized = normalizeThaiDigits(line);
  const candidates = Array.from(normalized.matchAll(/\d+(?:\.\d+)?/g)).map((match) => match[0]);
  const withoutNumber = candidates.filter((candidate) => candidate !== number);
  return withoutNumber.at(-1) ?? "";
}

function detectNumber(line: string, kind: EntryKind): string {
  const digits = expectedDigits(kind);
  const normalized = normalizeThaiDigits(line);
  const matches = Array.from(normalized.matchAll(/\d{1,3}/g)).map((match) => match[0]);
  return matches.find((item) => item.length === digits) ?? matches[0] ?? "";
}

export function parseBulkText(text: string, defaultCustomerName: string): BulkDraft[] {
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const drafts: BulkDraft[] = [];
  let activeCustomerName = defaultCustomerName.trim();

  for (const [lineIndex, rawLine] of lines.entries()) {
    const line = rawLine.replace(/[，、]/g, " ").replace(/\s+/g, " ").trim();
    const kind = detectKind(line);
    const number = detectNumber(line, kind);
    const amount = detectAmount(line, number);
    const numberIndex = normalizeThaiDigits(line).indexOf(number);
    const holderFromLine = numberIndex > 0 ? cleanName(line.slice(0, numberIndex)) : "";

    if (!number && !amount) {
      activeCustomerName = cleanName(line) || activeCustomerName;
      continue;
    }

    const customerName = holderFromLine || activeCustomerName || defaultCustomerName.trim();
    const error = validateNumberForKind(number, kind)
      || (!customerName ? "ไม่พบชื่อ" : null)
      || (!Number(amount) || Number(amount) <= 0 ? "ยอดไม่ถูกต้อง" : null);

    drafts.push({
      id: makeDraftId(lineIndex),
      customerName,
      number,
      kind,
      amount,
      paymentStatus: detectPaymentStatus(line),
      note: rawLine,
      sourceLine: rawLine,
      error: error ?? undefined
    });
  }

  return drafts;
}

export function draftStatus(draft: BulkDraft): string {
  return draft.error ? draft.error : `พร้อมบันทึก: ${draft.number} ${kindLabel[draft.kind]} ${draft.amount} บาท`;
}
