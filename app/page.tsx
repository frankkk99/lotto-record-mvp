"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { BulkDraft, Entry, ResultInput } from "@/src/types";
import { draftStatus, parseBulkText } from "@/src/lib/bulk-parser";
import {
  buildHolderReport,
  buildLineSummary,
  calculateEntries,
  calculateEntryCost,
  emptyResultInput,
  formatMoney,
  normalizeNumber,
  normalizeResultInput,
  validateLotteryNumber
} from "@/src/lib/calculation";
import { loadFromStorage, saveToStorage } from "@/src/lib/storage";

type Tab = "add" | "bulk" | "report" | "calculate" | "entries";

type FormState = {
  holderName: string;
  lotteryNumber: string;
  quantity: string;
  pricePerTicket: string;
  note: string;
};

const entriesKey = "lotto-record:v2:entries";
const userKey = "lotto-record:v2:user";
const officialResultUrl = "https://www.glo.or.th/home-page";

function getBangkokDate() {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const initialForm: FormState = {
  holderName: "",
  lotteryNumber: "",
  quantity: "1",
  pricePerTicket: "80",
  note: ""
};

export default function HomePage() {
  const [userName, setUserName] = useState("");
  const [loginName, setLoginName] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("add");
  const [drawDate, setDrawDate] = useState(getBangkokDate());
  const [entries, setEntries] = useState<Entry[]>([]);
  const [form, setForm] = useState<FormState>(initialForm);
  const [bulkText, setBulkText] = useState("");
  const [bulkDefaultName, setBulkDefaultName] = useState("");
  const [bulkDrafts, setBulkDrafts] = useState<BulkDraft[]>([]);
  const [result, setResult] = useState<ResultInput>(emptyResultInput);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setEntries(loadFromStorage<Entry[]>(entriesKey, []));
    setUserName(loadFromStorage<string>(userKey, ""));
  }, []);

  useEffect(() => saveToStorage(entriesKey, entries), [entries]);

  const drawEntries = useMemo(() => entries.filter((entry) => entry.drawDate === drawDate), [entries, drawDate]);
  const report = useMemo(() => buildHolderReport(drawEntries), [drawEntries]);
  const totals = useMemo(() => {
    const totalCost = drawEntries.reduce((sum, entry) => sum + calculateEntryCost(entry), 0);
    const totalReward = drawEntries.reduce((sum, entry) => sum + entry.rewardAmount, 0);
    const totalTickets = drawEntries.reduce((sum, entry) => sum + entry.quantity, 0);
    return {
      totalCost,
      totalReward,
      totalNet: totalReward - totalCost,
      entries: drawEntries.length,
      tickets: totalTickets,
      holders: report.length
    };
  }, [drawEntries, report.length]);

  function login() {
    const name = loginName.trim();
    if (!name) return setMessage("กรุณาใส่ชื่อผู้ใช้งาน");
    setUserName(name);
    saveToStorage(userKey, name);
  }

  function logout() {
    setUserName("");
    saveToStorage(userKey, "");
  }

  function createEntryFromForm(): Entry | null {
    const lotteryNumber = normalizeNumber(form.lotteryNumber).slice(0, 6);
    const quantity = Number(form.quantity);
    const pricePerTicket = Number(form.pricePerTicket);

    if (!form.holderName.trim()) {
      setMessage("กรุณาใส่ชื่อเจ้าของรายการ");
      return null;
    }

    const numberError = validateLotteryNumber(lotteryNumber);
    if (numberError) {
      setMessage(numberError);
      return null;
    }

    if (!quantity || quantity <= 0) {
      setMessage("จำนวนใบต้องมากกว่า 0");
      return null;
    }

    if (!pricePerTicket || pricePerTicket <= 0) {
      setMessage("ราคา/ใบต้องมากกว่า 0");
      return null;
    }

    return {
      id: makeId(),
      drawDate,
      holderName: form.holderName.trim(),
      lotteryNumber,
      quantity,
      pricePerTicket,
      note: form.note.trim(),
      matchedPrizes: [],
      rewardAmount: 0,
      netAmount: -(quantity * pricePerTicket),
      createdAt: new Date().toISOString()
    };
  }

  function addEntry() {
    const entry = createEntryFromForm();
    if (!entry) return;
    setEntries((current) => [entry, ...current]);
    setForm((current) => ({ ...current, lotteryNumber: "", quantity: "1", note: "" }));
    setMessage(`บันทึก ${entry.holderName} เลข ${entry.lotteryNumber} แล้ว`);
  }

  function draftToEntry(draft: BulkDraft): Entry | null {
    const lotteryNumber = normalizeNumber(draft.lotteryNumber).slice(0, 6);
    const quantity = Number(draft.quantity);
    const pricePerTicket = Number(draft.pricePerTicket);
    if (!draft.holderName.trim() || validateLotteryNumber(lotteryNumber) || !quantity || quantity <= 0 || !pricePerTicket || pricePerTicket <= 0) return null;
    return {
      id: makeId(),
      drawDate,
      holderName: draft.holderName.trim(),
      lotteryNumber,
      quantity,
      pricePerTicket,
      note: draft.note.trim(),
      matchedPrizes: [],
      rewardAmount: 0,
      netAmount: -(quantity * pricePerTicket),
      createdAt: new Date().toISOString()
    };
  }

  function prepareBulkData() {
    const drafts = parseBulkText(bulkText, bulkDefaultName);
    setBulkDrafts(drafts);
    setMessage(drafts.length ? `เตรียมข้อมูลแล้ว ${drafts.length} รายการ กรุณาตรวจสอบก่อนยืนยัน` : "ยังแยกข้อมูลไม่ได้ ลองใส่ชื่อและเลขสลาก 6 หลักให้ชัดขึ้น");
  }

  function updateDraft(id: string, patch: Partial<BulkDraft>) {
    setBulkDrafts((current) => current.map((draft) => {
      if (draft.id !== id) return draft;
      const updated = { ...draft, ...patch };
      const error = validateLotteryNumber(normalizeNumber(updated.lotteryNumber).slice(0, 6))
        || (!updated.holderName.trim() ? "ไม่พบชื่อ" : null)
        || (!Number(updated.quantity) || Number(updated.quantity) <= 0 ? "จำนวนใบไม่ถูกต้อง" : null)
        || (!Number(updated.pricePerTicket) || Number(updated.pricePerTicket) <= 0 ? "ราคา/ใบไม่ถูกต้อง" : null);
      return { ...updated, error: error || undefined };
    }));
  }

  function confirmBulkData() {
    const validEntries = bulkDrafts.map(draftToEntry).filter((entry): entry is Entry => Boolean(entry));
    if (!validEntries.length) return setMessage("ยังไม่มีรายการที่พร้อมบันทึก");
    setEntries((current) => [...validEntries.reverse(), ...current]);
    setBulkDrafts([]);
    setBulkText("");
    setMessage(`ยืนยันบันทึกแล้ว ${validEntries.length} รายการ`);
  }

  function calculateRound() {
    const cleanResult = normalizeResultInput(result);
    const calculated = calculateEntries(drawEntries, cleanResult);
    const calculatedMap = new Map(calculated.map((entry) => [entry.id, entry]));
    setEntries((current) => current.map((entry) => calculatedMap.get(entry.id) ?? entry));
    setResult(cleanResult);
    setMessage("คำนวณผลเรียบร้อย ตรวจ Report ได้ทันที");
  }

  async function copySummary() {
    const text = buildLineSummary(drawDate, report, drawEntries);
    try {
      await navigator.clipboard.writeText(text);
      setMessage("คัดลอกข้อความสรุปแล้ว");
    } catch {
      setMessage("คัดลอกไม่สำเร็จ กรุณาลองใหม่");
    }
  }

  async function shareSummary() {
    const text = buildLineSummary(drawDate, report, drawEntries);
    if (navigator.share) {
      await navigator.share({ title: `สรุปงวด ${drawDate}`, text });
      return;
    }
    await copySummary();
  }

  function exportCsv() {
    const rows = [
      ["งวด", "ชื่อ", "เลขสลาก", "จำนวนใบ", "ราคา/ใบ", "ยอดรวม", "รางวัล", "สุทธิ", "สถานะ", "หมายเหตุ"],
      ...drawEntries.map((entry) => [
        entry.drawDate,
        entry.holderName,
        entry.lotteryNumber,
        entry.quantity,
        entry.pricePerTicket,
        calculateEntryCost(entry),
        entry.rewardAmount,
        entry.netAmount,
        entry.matchedPrizes.map((prize) => prize.label).join(" + ") || "ไม่ถูกรางวัล",
        entry.note
      ])
    ];
    const csv = `\uFEFF${rows.map((row) => row.map(csvEscape).join(",")).join("\n")}`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `lotto-record-${drawDate}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (!userName) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,#eef4ff_0,#f6f8fb_45%,#eef2f7_100%)] px-5 py-8 text-slate-900">
        <section className="mx-auto flex min-h-[82vh] max-w-md flex-col justify-center">
          <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl shadow-slate-950/10">
            <div className="bg-[linear-gradient(135deg,#0b2e59,#164a86_55%,#d7a84e)] px-6 py-7 text-white">
              <p className="text-sm font-semibold tracking-[0.28em] text-white/75">LOTTO RECORD</p>
              <h1 className="mt-4 text-3xl font-bold leading-tight">ระบบบันทึกและตรวจคำนวณสลาก</h1>
              <p className="mt-3 text-sm leading-6 text-blue-50/90">เว็บแอพส่วนตัวสำหรับบันทึกเลขสลาก 6 หลัก ตรวจผล และสรุปรายงานแบบแชร์ต่อได้</p>
            </div>
            <div className="p-6">
              <Field label="ชื่อผู้ใช้งาน">
                <input value={loginName} onChange={(event) => setLoginName(event.target.value)} placeholder="เช่น แอดมิน" className="field" />
              </Field>
              <button onClick={login} className="primary-button mt-4 w-full px-4 py-4 text-base">เข้าใช้งาน</button>
              <p className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900">ระบบนี้เป็นเครื่องมือบันทึกและตรวจคำนวณข้อมูลสลากส่วนตัวเท่านั้น ไม่ใช่ระบบจำหน่ายสลาก รับแทง ฝากถอน หรือจ่ายเงิน</p>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f4f7fb] px-4 py-5 text-slate-900">
      <section className="mx-auto max-w-7xl">
        <header className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-xl shadow-slate-950/5">
          <div className="bg-[linear-gradient(135deg,#08264a,#0b3c72_58%,#c9973d)] p-5 text-white md:p-7">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm text-blue-50/80">เข้าสู่ระบบโดย {userName}</p>
                <h1 className="text-2xl font-bold md:text-4xl">Lotto Record MVP</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-blue-50/90">บันทึกสลาก 6 หลักตามงวด ตรวจผลจากรางวัลทางการ และสรุปรายงานแยกตามชื่อ</p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input type="date" value={drawDate} onChange={(event) => setDrawDate(event.target.value)} className="rounded-2xl border border-white/30 bg-white px-4 py-3 text-sm text-slate-900" />
                <button onClick={logout} className="rounded-2xl border border-white/30 bg-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/20">ออก</button>
              </div>
            </div>
          </div>
          <div className="grid gap-3 border-t border-slate-200 bg-white p-4 md:grid-cols-3">
            <InfoCard title="ปลอดภัยกว่า" text="ใช้คำและฟีเจอร์แนวเครื่องมือบันทึกส่วนตัว ไม่ใส่ระบบฝากถอนหรือรับแทง" />
            <InfoCard title="ตรวจตามผลทางการ" text="รองรับรางวัลที่ 1 เลขหน้า 3 ตัว เลขท้าย 3 ตัว และเลขท้าย 2 ตัว" />
            <InfoCard title="แชร์ง่าย" text="คัดลอก/แชร์สรุปรายงานไป LINE ได้ทันทีหลังตรวจผล" />
          </div>
        </header>

        {message ? <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">{message}</div> : null}

        <section className="mt-5 grid gap-3 md:grid-cols-5">
          <StatCard title="ยอดรวม" value={formatMoney(totals.totalCost)} />
          <StatCard title="รางวัลรวม" value={formatMoney(totals.totalReward)} />
          <StatCard title="สุทธิ" value={`${totals.totalNet >= 0 ? "+" : ""}${formatMoney(totals.totalNet)}`} highlight={totals.totalNet >= 0} />
          <StatCard title="จำนวนสลาก" value={`${totals.tickets} ใบ`} />
          <StatCard title="รายชื่อ" value={`${totals.holders} คน`} />
        </section>

        <nav className="mt-5 grid grid-cols-2 gap-2 md:grid-cols-5">
          <TabButton active={activeTab === "add"} onClick={() => setActiveTab("add")}>+ เพิ่มรายการ</TabButton>
          <TabButton active={activeTab === "bulk"} onClick={() => setActiveTab("bulk")}>วางจาก LINE</TabButton>
          <TabButton active={activeTab === "calculate"} onClick={() => setActiveTab("calculate")}>ตรวจผล</TabButton>
          <TabButton active={activeTab === "report"} onClick={() => setActiveTab("report")}>Report</TabButton>
          <TabButton active={activeTab === "entries"} onClick={() => setActiveTab("entries")}>รายการทั้งหมด</TabButton>
        </nav>

        {activeTab === "add" ? <AddPanel form={form} setForm={setForm} addEntry={addEntry} /> : null}
        {activeTab === "bulk" ? <BulkPanel bulkText={bulkText} setBulkText={setBulkText} bulkDefaultName={bulkDefaultName} setBulkDefaultName={setBulkDefaultName} prepareBulkData={prepareBulkData} drafts={bulkDrafts} updateDraft={updateDraft} confirmBulkData={confirmBulkData} /> : null}
        {activeTab === "calculate" ? <CalculatePanel result={result} setResult={setResult} calculateRound={calculateRound} /> : null}
        {activeTab === "report" ? <ReportPanel report={report} copySummary={copySummary} shareSummary={shareSummary} exportCsv={exportCsv} /> : null}
        {activeTab === "entries" ? <section className="panel"><SectionTitle title="รายการทั้งหมดในงวดนี้" description="ตรวจดูรายการ แก้ผิดให้ลบแล้วเพิ่มใหม่ เพื่อกันข้อมูลเพี้ยน" /><EntryTable entries={drawEntries} onDelete={(id) => setEntries((current) => current.filter((entry) => entry.id !== id))} /></section> : null}
      </section>
    </main>
  );
}

function AddPanel({ form, setForm, addEntry }: { form: FormState; setForm: (value: FormState | ((current: FormState) => FormState)) => void; addEntry: () => void }) {
  return (
    <section className="panel">
      <SectionTitle title="เพิ่มรายการแบบเร็ว" description="บันทึกเลขสลาก 6 หลัก จำนวนใบ ราคา และหมายเหตุ" />
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Field label="ชื่อเจ้าของรายการ">
          <input value={form.holderName} onChange={(event) => setForm({ ...form, holderName: event.target.value })} placeholder="เช่น บอย" className="field" />
        </Field>
        <Field label="เลขสลาก 6 หลัก">
          <input value={form.lotteryNumber} onChange={(event) => setForm({ ...form, lotteryNumber: normalizeNumber(event.target.value).slice(0, 6) })} placeholder="123456" inputMode="numeric" className="field text-2xl font-bold tracking-widest" />
        </Field>
        <Field label="จำนวนใบ">
          <input value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value.replace(/[^0-9]/g, "") })} placeholder="1" inputMode="numeric" className="field" />
        </Field>
        <Field label="ราคา/ใบ">
          <input value={form.pricePerTicket} onChange={(event) => setForm({ ...form, pricePerTicket: event.target.value.replace(/[^0-9.]/g, "") })} placeholder="80" inputMode="decimal" className="field" />
        </Field>
        <Field label="หมายเหตุ">
          <input value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} placeholder="เช่น ฝากซื้อ / ชุดที่ 1" className="field" />
        </Field>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
          <p className="font-semibold text-slate-900">สูตรคิดยอด</p>
          <p>ยอดรวม = จำนวนใบ × ราคา/ใบ</p>
          <p className="mt-1">ตัวอย่าง 2 ใบ × 80 = 160 บาท</p>
        </div>
      </div>
      <button onClick={addEntry} className="primary-button mt-5 w-full px-5 py-4 text-lg">บันทึกแล้วเพิ่มต่อ</button>
    </section>
  );
}

function BulkPanel(props: { bulkText: string; setBulkText: (value: string) => void; bulkDefaultName: string; setBulkDefaultName: (value: string) => void; prepareBulkData: () => void; drafts: BulkDraft[]; updateDraft: (id: string, patch: Partial<BulkDraft>) => void; confirmBulkData: () => void }) {
  return (
    <section className="mt-5 space-y-4">
      <div className="panel">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <SectionTitle title="วางข้อความจาก LINE" description="เหมาะกับข้อความที่มีชื่อ + เลขสลาก 6 หลัก + จำนวนใบ" />
          <button onClick={props.prepareBulkData} className="primary-button px-5 py-3">เตรียมข้อมูล</button>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-[0.8fr_1.2fr]">
          <Field label="ชื่อเริ่มต้น ถ้าบรรทัดไม่มีชื่อ">
            <input value={props.bulkDefaultName} onChange={(event) => props.setBulkDefaultName(event.target.value)} placeholder="เช่น บอย" className="field" />
          </Field>
          <Field label="ตัวอย่างรูปแบบที่อ่านได้">
            <div className="rounded-2xl border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-slate-700">บอย 123456 1 ใบ<br />มด 654321 2 ใบ ราคา 80<br />เจน<br />778899 1 ใบ</div>
          </Field>
        </div>
        <Field label="วางข้อความชุดจาก LINE">
          <textarea value={props.bulkText} onChange={(event) => props.setBulkText(event.target.value)} placeholder={'ตัวอย่าง:\nบอย 123456 1 ใบ\nบอย 654321 2 ใบ\nมด 889900 1 ใบ ราคา 80'} className="field mt-2 min-h-48 resize-y leading-7" />
        </Field>
      </div>
      {props.drafts.length ? (
        <div className="panel">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <SectionTitle title="ตรวจสอบก่อนยืนยัน" description="แก้ไขช่องที่ระบบแยกผิดได้ แถวที่มีปัญหาจะไม่ถูกบันทึก" />
            <button onClick={props.confirmBulkData} className="primary-button px-5 py-3">ยืนยันบันทึก {props.drafts.filter((draft) => !draft.error).length} รายการ</button>
          </div>
          <BulkDraftTable drafts={props.drafts} onUpdate={props.updateDraft} />
        </div>
      ) : null}
    </section>
  );
}

function CalculatePanel({ result, setResult, calculateRound }: { result: ResultInput; setResult: (value: ResultInput) => void; calculateRound: () => void }) {
  return (
    <section className="panel">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <SectionTitle title="ตรวจผลรางวัล" description="กรอกผลจากแหล่งทางการ แล้วกดคำนวณทั้งงวด" />
        <a href={officialResultUrl} target="_blank" rel="noreferrer" className="secondary-button px-4 py-3 text-sm">เปิดเว็บกองสลาก</a>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Field label="รางวัลที่ 1">
          <input value={result.firstPrize} onChange={(event) => setResult({ ...result, firstPrize: normalizeNumber(event.target.value).slice(0, 6) })} className="field text-2xl font-bold tracking-widest" inputMode="numeric" placeholder="123456" />
        </Field>
        <Field label="เลขหน้า 3 ตัว หลายเลขได้">
          <input value={result.front3} onChange={(event) => setResult({ ...result, front3: event.target.value })} className="field text-2xl font-bold tracking-widest" placeholder="123 456" />
        </Field>
        <Field label="เลขท้าย 3 ตัว หลายเลขได้">
          <input value={result.back3} onChange={(event) => setResult({ ...result, back3: event.target.value })} className="field text-2xl font-bold tracking-widest" placeholder="789 012" />
        </Field>
        <Field label="เลขท้าย 2 ตัว">
          <input value={result.bottom2} onChange={(event) => setResult({ ...result, bottom2: normalizeNumber(event.target.value).slice(0, 2) })} className="field text-2xl font-bold tracking-widest" inputMode="numeric" placeholder="55" />
        </Field>
      </div>
      <button onClick={calculateRound} className="primary-button mt-5 w-full px-5 py-4 text-lg">คำนวณผลทั้งงวด</button>
      <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900">ตรวจผลกับแหล่งทางการก่อนคำนวณทุกครั้ง ระบบนี้เป็นตัวช่วยบันทึกและสรุปข้อมูลเท่านั้น</p>
    </section>
  );
}

function ReportPanel({ report, copySummary, shareSummary, exportCsv }: { report: ReturnType<typeof buildHolderReport>; copySummary: () => void; shareSummary: () => void; exportCsv: () => void }) {
  return (
    <section className="panel">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <SectionTitle title="Report ตามรายชื่อ" description="ดูยอดรวม รางวัล และสุทธิของแต่ละคนในงวดนี้" />
        <div className="flex flex-wrap gap-2">
          <button onClick={copySummary} className="secondary-button px-4 py-3 text-sm">Copy</button>
          <button onClick={shareSummary} className="primary-button px-4 py-3 text-sm">Share LINE</button>
          <button onClick={exportCsv} className="secondary-button px-4 py-3 text-sm">Export CSV</button>
        </div>
      </div>
      <ReportTable report={report} />
    </section>
  );
}

function BulkDraftTable({ drafts, onUpdate }: { drafts: BulkDraft[]; onUpdate: (id: string, patch: Partial<BulkDraft>) => void }) {
  return (
    <div className="mt-5 overflow-x-auto">
      <table className="w-full min-w-[920px] border-separate border-spacing-y-2 text-sm">
        <thead className="text-left text-slate-500">
          <tr>
            <th className="px-3 py-2">สถานะ</th>
            <th className="px-3 py-2">ชื่อ</th>
            <th className="px-3 py-2">เลขสลาก</th>
            <th className="px-3 py-2">จำนวนใบ</th>
            <th className="px-3 py-2">ราคา/ใบ</th>
            <th className="px-3 py-2">ต้นฉบับ</th>
          </tr>
        </thead>
        <tbody>
          {drafts.map((draft) => (
            <tr key={draft.id} className={draft.error ? "bg-red-50" : "bg-white"}>
              <td className="rounded-l-2xl border-y border-l border-slate-200 px-3 py-3 text-xs text-slate-600">{draftStatus(draft)}</td>
              <td className="border-y border-slate-200 px-3 py-3"><input value={draft.holderName} onChange={(event) => onUpdate(draft.id, { holderName: event.target.value })} className="mini-field" /></td>
              <td className="border-y border-slate-200 px-3 py-3"><input value={draft.lotteryNumber} onChange={(event) => onUpdate(draft.id, { lotteryNumber: normalizeNumber(event.target.value).slice(0, 6) })} className="mini-field font-bold tracking-widest" /></td>
              <td className="border-y border-slate-200 px-3 py-3"><input value={draft.quantity} onChange={(event) => onUpdate(draft.id, { quantity: event.target.value.replace(/[^0-9]/g, "") })} className="mini-field" /></td>
              <td className="border-y border-slate-200 px-3 py-3"><input value={draft.pricePerTicket} onChange={(event) => onUpdate(draft.id, { pricePerTicket: event.target.value.replace(/[^0-9.]/g, "") })} className="mini-field" /></td>
              <td className="rounded-r-2xl border-y border-r border-slate-200 px-3 py-3 text-xs text-slate-500">{draft.sourceLine}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReportTable({ report }: { report: ReturnType<typeof buildHolderReport> }) {
  if (!report.length) return <EmptyState text="ยังไม่มีข้อมูลรายงานในงวดนี้" />;
  return (
    <div className="mt-5 overflow-x-auto">
      <table className="w-full min-w-[820px] border-separate border-spacing-y-2 text-sm">
        <thead className="text-left text-slate-500">
          <tr>
            <th className="px-3 py-2">ชื่อ</th>
            <th className="px-3 py-2">รายการ</th>
            <th className="px-3 py-2">จำนวนใบ</th>
            <th className="px-3 py-2">ยอดรวม</th>
            <th className="px-3 py-2">รางวัล</th>
            <th className="px-3 py-2">สุทธิ</th>
          </tr>
        </thead>
        <tbody>
          {report.map((item) => (
            <tr key={item.holderName} className="bg-white">
              <td className="rounded-l-2xl border-y border-l border-slate-200 px-3 py-3 font-semibold text-slate-900">{item.holderName}</td>
              <td className="border-y border-slate-200 px-3 py-3">{item.totalEntries}</td>
              <td className="border-y border-slate-200 px-3 py-3">{item.totalTickets}</td>
              <td className="border-y border-slate-200 px-3 py-3">{formatMoney(item.totalCost)}</td>
              <td className="border-y border-slate-200 px-3 py-3 text-[#0b5aa0]">{formatMoney(item.totalReward)}</td>
              <td className={`rounded-r-2xl border-y border-r border-slate-200 px-3 py-3 font-bold ${item.netAmount >= 0 ? "text-[#0b6b4f]" : "text-slate-700"}`}>{item.netAmount >= 0 ? "+" : ""}{formatMoney(item.netAmount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EntryTable({ entries, onDelete }: { entries: Entry[]; onDelete: (id: string) => void }) {
  if (!entries.length) return <EmptyState text="ยังไม่มีรายการในงวดนี้" />;
  return (
    <div className="mt-5 overflow-x-auto">
      <table className="w-full min-w-[980px] border-separate border-spacing-y-2 text-sm">
        <thead className="text-left text-slate-500">
          <tr>
            <th className="px-3 py-2">ชื่อ</th>
            <th className="px-3 py-2">เลขสลาก</th>
            <th className="px-3 py-2">ใบ</th>
            <th className="px-3 py-2">ยอดรวม</th>
            <th className="px-3 py-2">สถานะ</th>
            <th className="px-3 py-2">รางวัล</th>
            <th className="px-3 py-2">หมายเหตุ</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id} className="bg-white">
              <td className="rounded-l-2xl border-y border-l border-slate-200 px-3 py-3 font-semibold">{entry.holderName}</td>
              <td className="border-y border-slate-200 px-3 py-3 text-lg font-bold tracking-widest text-[#0b2e59]">{entry.lotteryNumber}</td>
              <td className="border-y border-slate-200 px-3 py-3">{entry.quantity}</td>
              <td className="border-y border-slate-200 px-3 py-3">{formatMoney(calculateEntryCost(entry))}</td>
              <td className="border-y border-slate-200 px-3 py-3">{entry.matchedPrizes.length ? <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">ถูกรางวัล</span> : <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500">ยังไม่พบรางวัล</span>}</td>
              <td className="border-y border-slate-200 px-3 py-3">{entry.matchedPrizes.map((prize) => prize.label).join(" + ") || "-"}<div className="text-xs text-slate-500">{formatMoney(entry.rewardAmount)}</div></td>
              <td className="border-y border-slate-200 px-3 py-3 text-slate-500">{entry.note || "-"}</td>
              <td className="rounded-r-2xl border-y border-r border-slate-200 px-3 py-3 text-right"><button onClick={() => onDelete(entry.id)} className="text-sm font-semibold text-red-500 hover:text-red-700">ลบ</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InfoCard({ title, text }: { title: string; text: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600"><p className="mb-1 font-semibold text-[#0b2e59]">{title}</p>{text}</div>;
}

function SectionTitle({ title, description }: { title: string; description: string }) {
  return <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#c9973d]">Official record tool</p><h2 className="mt-1 text-xl font-semibold text-[#0b2e59]">{title}</h2><p className="mt-1 text-sm text-slate-600">{description}</p></div>;
}

function StatCard({ title, value, highlight }: { title: string; value: string; highlight?: boolean }) {
  return <div className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm"><p className="text-sm text-slate-500">{title}</p><p className={`mt-2 text-2xl font-bold ${highlight ? "text-[#0b6b4f]" : "text-slate-900"}`}>{value}</p></div>;
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return <button onClick={onClick} className={`rounded-2xl px-4 py-3 text-sm font-semibold shadow-sm transition ${active ? "bg-[#0b2e59] text-white" : "border border-slate-200 bg-white text-slate-700 hover:bg-blue-50"}`}>{children}</button>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="mt-4 block"><span className="mb-2 block text-sm font-medium text-slate-700">{label}</span>{children}</label>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">{text}</div>;
}

function csvEscape(value: string | number) {
  return `"${String(value).replace(/"/g, '""')}"`;
}
