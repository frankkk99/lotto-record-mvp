import type { BulkDraft } from "@/src/types";
import { normalizeNumber, validateLotteryNumber } from "@/src/lib/calculation";

function makeDraftId(index: number) {
  return `draft-${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`;
}

function cleanName(value: string) {
  return value
    .replace(/ชื่อ[:：]?/g, "")
    .replace(/เลข[:：]?/g, "")
    .replace(/สลาก[:：]?/g, "")
    .replace(/บาท/g, "")
    .replace(/[=:+|/\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectQuantity(line: string): string {
  const thaiLine = line.replace(/[๐-๙]/g, (digit) => String("๐๑๒๓๔๕๖๗๘๙".indexOf(digit)));
  const explicit = thaiLine.match(/([0-9]+)\s*(?:ใบ|ชุด)/);
  if (explicit) return explicit[1];
  return "1";
}

function detectPrice(line: string): string {
  const thaiLine = line.replace(/[๐-๙]/g, (digit) => String("๐๑๒๓๔๕๖๗๘๙".indexOf(digit)));
  const explicit = thaiLine.match(/(?:ใบละ|ราคา|บาทละ)\s*([0-9]+(?:\.[0-9]+)?)/);
  if (explicit) return explicit[1];
  return "80";
}

function buildDraft(args: { lineIndex: number; holderName: string; lotteryNumber: string; rawLine: string }): BulkDraft {
  const quantity = detectQuantity(args.rawLine);
  const pricePerTicket = detectPrice(args.rawLine);
  const error = validateLotteryNumber(args.lotteryNumber)
    || (!args.holderName ? "ไม่พบชื่อ" : null)
    || (!Number(quantity) || Number(quantity) <= 0 ? "จำนวนใบไม่ถูกต้อง" : null)
    || (!Number(pricePerTicket) || Number(pricePerTicket) <= 0 ? "ราคา/ใบไม่ถูกต้อง" : null);

  return {
    id: makeDraftId(args.lineIndex),
    holderName: args.holderName,
    lotteryNumber: args.lotteryNumber,
    quantity,
    pricePerTicket,
    note: args.rawLine,
    sourceLine: args.rawLine,
    error: error ?? undefined
  };
}

export function parseBulkText(text: string, defaultHolderName: string): BulkDraft[] {
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const drafts: BulkDraft[] = [];
  let activeHolderName = defaultHolderName.trim();

  for (const [lineIndex, rawLine] of lines.entries()) {
    const line = rawLine.replace(/[，、]/g, " ").replace(/\s+/g, " ").trim();
    const ticketMatch = line.match(/[0-9๐-๙]{6}/);

    if (!ticketMatch) {
      activeHolderName = cleanName(line) || activeHolderName;
      continue;
    }

    const lotteryNumber = normalizeNumber(ticketMatch[0]).slice(0, 6);
    const holderFromLine = cleanName(line.slice(0, ticketMatch.index ?? 0));
    const holderName = holderFromLine || activeHolderName || defaultHolderName.trim();
    drafts.push(buildDraft({ lineIndex, holderName, lotteryNumber, rawLine }));
  }

  return drafts.map((draft) => {
    const error = draft.error
      || validateLotteryNumber(draft.lotteryNumber)
      || (!draft.holderName ? "ไม่พบชื่อ" : null)
      || (!Number(draft.quantity) || Number(draft.quantity) <= 0 ? "จำนวนใบไม่ถูกต้อง" : null)
      || (!Number(draft.pricePerTicket) || Number(draft.pricePerTicket) <= 0 ? "ราคา/ใบไม่ถูกต้อง" : null);
    return { ...draft, error: error ?? undefined };
  });
}

export function draftStatus(draft: BulkDraft): string {
  return draft.error ? draft.error : "พร้อมบันทึก";
}
