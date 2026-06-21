import type { BulkDraft, NumberType } from "@/src/types";
import { defaultPayoutRate, normalizeNumber, numberTypeLabel, validateNumber } from "@/src/lib/calculation";

const typeKeywords: Array<{ keywords: string[]; type: NumberType }> = [
  { keywords: ["หน้า", "เลขหน้า", "น่า"], type: "front_3" },
  { keywords: ["ท้าย3", "ท้าย 3", "เลขท้าย3", "หลัง", "เลขหลัง"], type: "back_3" },
  { keywords: ["ล่าง", "ล่าง2", "เลขล่าง", "ท้าย2", "ท้าย 2", "เลขท้าย2"], type: "bottom_2" },
  { keywords: ["บน3", "บน 3", "สามตัวบน", "3บน"], type: "top_3" },
  { keywords: ["บน", "เลขบน", "2บน", "บน2"], type: "top_2" },
  { keywords: ["6หลัก", "6 หลัก", "รางวัลที่1", "รางวัลที่ 1"], type: "full_6" }
];

type NumberToken = { value: string; index: number; raw: string };

function makeDraftId(index: number) {
  return `draft-${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`;
}

function detectType(text: string, number: string, fallback: NumberType): NumberType {
  const cleanText = text.replace(/\s+/g, "");
  const found = typeKeywords.find((item) => item.keywords.some((keyword) => cleanText.includes(keyword.replace(/\s+/g, ""))));
  if (found) {
    if (number.length === 2 && ["front_3", "back_3", "top_3", "full_6"].includes(found.type)) return fallback;
    if (number.length === 3 && ["top_2", "bottom_2"].includes(found.type)) return fallback;
    return found.type;
  }
  if (number.length === 6) return "full_6";
  if (number.length === 3) return "top_3";
  if (number.length === 2) return fallback;
  return fallback;
}

function cleanName(value: string) {
  return value
    .replace(/ชื่อ[:：]?/g, "")
    .replace(/เลข[:：]?/g, "")
    .replace(/บาท/g, "")
    .replace(/[=:+|\/\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function numberTokens(line: string): NumberToken[] {
  return [...line.matchAll(/[0-9๐-๙]{2,6}/g)].map((match) => ({ value: normalizeNumber(match[0]), index: match.index ?? 0, raw: match[0] }));
}

function buildDraft(args: { lineIndex: number; customerName: string; number: string; amount: string; rawLine: string; typeContext: string; fallbackType: NumberType }): BulkDraft {
  const numberType = detectType(args.typeContext, args.number, args.fallbackType);
  const error = validateNumber(args.number, numberType) || (!args.customerName ? "ไม่พบชื่อ" : null) || (!args.amount ? "ไม่พบจำนวนเงิน" : null);
  return {
    id: makeDraftId(args.lineIndex),
    customerName: args.customerName,
    number: args.number,
    numberType,
    amount: args.amount,
    payoutRate: String(defaultPayoutRate[numberType]),
    note: args.rawLine,
    sourceLine: args.rawLine,
    error: error ?? undefined
  };
}

export function parseBulkText(text: string, defaultName: string, fallbackType: NumberType): BulkDraft[] {
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  let activeName = defaultName.trim();
  const drafts: BulkDraft[] = [];

  for (const [lineIndex, rawLine] of lines.entries()) {
    const line = rawLine.replace(/[，、]/g, " ").replace(/\s+/g, " ").trim();
    const tokens = numberTokens(line);
    if (tokens.length === 0) {
      activeName = cleanName(line) || activeName;
      continue;
    }

    const namePart = cleanName(line.slice(0, tokens[0].index));
    const customerName = namePart || activeName || defaultName.trim();
    const explicitPairs = [...line.matchAll(/([0-9๐-๙]{2,6})\s*(?:บน\s*3|บน3|บน|ล่าง|หน้า|ท้าย\s*3|ท้าย3|หลัง|6\s*หลัก|รางวัลที่\s*1)?\s*(?:=|:|\+|\/)\s*([0-9]+(?:\.[0-9]+)?)/g)];

    if (explicitPairs.length > 0) {
      for (const [pairIndex, match] of explicitPairs.entries()) {
        drafts.push(buildDraft({ lineIndex: lineIndex + pairIndex, customerName, number: normalizeNumber(match[1]), amount: match[2], rawLine, typeContext: line, fallbackType }));
      }
      continue;
    }

    if (tokens.length >= 2) {
      const amountToken = tokens[tokens.length - 1];
      const numberList = tokens.slice(0, -1);
      for (const [tokenIndex, token] of numberList.entries()) {
        drafts.push(buildDraft({ lineIndex: lineIndex + tokenIndex, customerName, number: token.value, amount: amountToken.value, rawLine, typeContext: line, fallbackType }));
      }
      continue;
    }

    drafts.push(buildDraft({ lineIndex, customerName, number: tokens[0].value, amount: "", rawLine, typeContext: line, fallbackType }));
  }

  return drafts.map((draft) => {
    const amountNumber = Number(draft.amount);
    const payoutNumber = Number(draft.payoutRate);
    const error = draft.error || (!amountNumber || amountNumber <= 0 ? "จำนวนเงินไม่ถูกต้อง" : null) || (!payoutNumber || payoutNumber <= 0 ? "อัตราจ่ายไม่ถูกต้อง" : null);
    return { ...draft, error: error ?? undefined };
  });
}

export function draftStatus(draft: BulkDraft): string {
  return draft.error ? draft.error : `พร้อมบันทึก · ${numberTypeLabel[draft.numberType]}`;
}
