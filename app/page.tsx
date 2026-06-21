"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { BulkDraft, Entry, NumberType, ResultInput } from "@/src/types";
import { draftStatus, parseBulkText } from "@/src/lib/bulk-parser";
import {
  buildCustomerReport,
  buildLineSummary,
  calculateEntries,
  defaultPayoutRate,
  emptyResultInput,
  formatMoney,
  normalizeNumber,
  normalizeResultInput,
  numberTypeHints,
  numberTypeLabel,
  numberTypeOptions,
  validateNumber
} from "@/src/lib/calculation";
import { loadFromStorage, saveToStorage } from "@/src/lib/storage";

type Tab = "add" | "bulk" | "report" | "calculate" | "entries";

type FormState = {
  customerName: string;
  number: string;
  numberType: NumberType;
  amount: string;
  payoutRate: string;
  note: string;
};

const entriesKey = "lotto-record:entries";
const userKey = "lotto-record:user";
const today = new Date().toISOString().slice(0, 10);
const gloUrl = "https://www.glo.or.th/";

function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random()}`;
}

const initialForm: FormState = {
  customerName: "",
  number: "",
  numberType: "bottom_2",
  amount: "",
  payoutRate: String(defaultPayoutRate.bottom_2),
  note: ""
};

export default function HomePage() {
  const [userName, setUserName] = useState("");
  const [loginName, setLoginName] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("add");
  const [roundDate, setRoundDate] = useState(today);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [form, setForm] = useState<FormState>(initialForm);
  const [bulkText, setBulkText] = useState("");
  const [bulkDefaultName, setBulkDefaultName] = useState("");
  const [bulkDefaultType, setBulkDefaultType] = useState<NumberType>("bottom_2");
  const [bulkDrafts, setBulkDrafts] = useState<BulkDraft[]>([]);
  const [result, setResult] = useState<ResultInput>(emptyResultInput);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setEntries(loadFromStorage<Entry[]>(entriesKey, []));
    setUserName(loadFromStorage<string>(userKey, ""));
  }, []);

  useEffect(() => saveToStorage(entriesKey, entries), [entries]);

  const roundEntries = useMemo(() => entries.filter((entry) => entry.roundDate === roundDate), [entries, roundDate]);
  const report = useMemo(() => buildCustomerReport(roundEntries), [roundEntries]);
  const totals = useMemo(() => {
    const totalAmount = roundEntries.reduce((sum, entry) => sum + entry.amount, 0);
    const totalPrize = roundEntries.reduce((sum, entry) => sum + entry.prizeAmount, 0);
    return { totalAmount, totalPrize, totalNet: totalPrize - totalAmount, entries: roundEntries.length, customers: report.length };
  }, [roundEntries, report.length]);

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

  function changeType(type: NumberType) {
    setForm((current) => ({ ...current, numberType: type, number: "", payoutRate: String(defaultPayoutRate[type]) }));
  }

  function entryFromDraft(draft: BulkDraft): Entry | null {
    const number = normalizeNumber(draft.number);
    if (!draft.customerName.trim()) return null;
    if (validateNumber(number, draft.numberType)) return null;
    const amount = Number(draft.amount);
    const payoutRate = Number(draft.payoutRate);
    if (!amount || amount <= 0 || !payoutRate || payoutRate <= 0) return null;
    return {
      id: makeId(),
      roundDate,
      customerName: draft.customerName.trim(),
      number,
      numberType: draft.numberType,
      amount,
      payoutRate,
      note: draft.note.trim(),
      isWin: false,
      prizeAmount: 0,
      netAmount: -amount,
      createdAt: new Date().toISOString()
    };
  }

  function addEntry() {
    const entry = entryFromDraft({ ...form, id: makeId(), sourceLine: "" });
    if (!form.customerName.trim()) return setMessage("กรุณาใส่ชื่อในช่องชื่อ");
    if (!entry) {
      const error = validateNumber(normalizeNumber(form.number), form.numberType);
      return setMessage(error || "กรุณาตรวจสอบจำนวนเงินและอัตราจ่าย");
    }
    setEntries((current) => [entry, ...current]);
    setForm((current) => ({ ...current, number: "", amount: "", note: "" }));
    setMessage(`บันทึก ${entry.customerName} ${numberTypeLabel[entry.numberType]} เลข ${entry.number} แล้ว`);
  }

  function prepareBulkData() {
    const drafts = parseBulkText(bulkText, bulkDefaultName, bulkDefaultType);
    setBulkDrafts(drafts);
    setMessage(drafts.length ? `เตรียมข้อมูลแล้ว ${drafts.length} รายการ กรุณาตรวจสอบก่อนยืนยัน` : "ยังแยกข้อมูลไม่ได้ ลองใส่ชื่อ เลข และเงินให้ชัดขึ้น");
  }

  function updateDraft(id: string, patch: Partial<BulkDraft>) {
    setBulkDrafts((current) => current.map((draft) => {
      if (draft.id !== id) return draft;
      const updated = { ...draft, ...patch };
      const error = validateNumber(normalizeNumber(updated.number), updated.numberType)
        || (!Number(updated.amount) || Number(updated.amount) <= 0 ? "จำนวนเงินไม่ถูกต้อง" : null)
        || (!Number(updated.payoutRate) || Number(updated.payoutRate) <= 0 ? "อัตราจ่ายไม่ถูกต้อง" : null);
      return { ...updated, error: error || undefined };
    }));
  }

  function confirmBulkData() {
    const validEntries = bulkDrafts.map(entryFromDraft).filter((entry): entry is Entry => Boolean(entry));
    if (!validEntries.length) return setMessage("ยังไม่มีรายการที่พร้อมบันทึก");
    setEntries((current) => [...validEntries.reverse(), ...current]);
    setBulkDrafts([]);
    setBulkText("");
    setMessage(`ยืนยันบันทึกแล้ว ${validEntries.length} รายการ`);
  }

  function calculateRound() {
    const cleanResult = normalizeResultInput(result);
    const calculated = calculateEntries(roundEntries, cleanResult);
    const calculatedMap = new Map(calculated.map((entry) => [entry.id, entry]));
    setEntries((current) => current.map((entry) => calculatedMap.get(entry.id) ?? entry));
    setResult(cleanResult);
    setMessage("คำนวณผลแล้ว ตรวจ Report ได้ทันที");
  }

  function updateFirstPrize(value: string) {
    const firstPrize = normalizeNumber(value).slice(0, 6);
    setResult((current) => ({
      ...current,
      firstPrize,
      top3: firstPrize.length === 6 ? firstPrize.slice(-3) : current.top3,
      top2: firstPrize.length === 6 ? firstPrize.slice(-2) : current.top2
    }));
  }

  async function copySummary() {
    await navigator.clipboard.writeText(buildLineSummary(roundDate, report, roundEntries));
    setMessage("คัดลอกข้อความสรุปแล้ว");
  }

  async function shareSummary() {
    const text = buildLineSummary(roundDate, report, roundEntries);
    if (navigator.share) return navigator.share({ title: `สรุปงวด ${roundDate}`, text });
    await navigator.clipboard.writeText(text);
    setMessage("คัดลอกข้อความให้แล้ว เพราะเครื่องนี้ไม่รองรับ Share โดยตรง");
  }

  if (!userName) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,#1f2937,#050608_55%)] px-5 py-8 text-white">
        <section className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center">
          <div className="rounded-[2rem] border border-white/10 bg-white/10 p-6 shadow-2xl backdrop-blur">
            <p className="text-sm text-emerald-300">Lotto Record MVP</p>
            <h1 className="mt-3 text-3xl font-bold leading-tight">ระบบบันทึกและคำนวณรายงวด</h1>
            <p className="mt-3 text-sm leading-6 text-slate-300">บันทึกข้อมูล คำนวณรายงาน และแชร์สรุปออก LINE ได้ง่ายขึ้น</p>
            <Field label="ชื่อผู้ใช้งาน"><input value={loginName} onChange={(e) => setLoginName(e.target.value)} placeholder="เช่น แอดมินร้าน" className="field" /></Field>
            <button onClick={login} className="mt-4 w-full rounded-2xl bg-emerald-400 px-4 py-4 font-semibold text-slate-950">เข้าใช้งาน</button>
            <p className="mt-5 rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4 text-xs leading-5 text-amber-100">ระบบนี้เป็นเครื่องมือบันทึกและคำนวณข้อมูลเท่านั้น ไม่มีระบบซื้อขาย ฝากถอน หรือจ่ายเงินผ่านระบบ</p>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#050608] px-4 py-5 text-white">
      <section className="mx-auto max-w-7xl">
        <header className="flex flex-col gap-4 rounded-[2rem] border border-white/10 bg-white/[0.06] p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm text-emerald-300">เข้าสู่ระบบโดย {userName}</p>
            <h1 className="text-2xl font-bold md:text-4xl">บันทึกและคำนวณรายงวด</h1>
            <p className="mt-2 text-sm text-slate-400">กรอกทีละรายการ หรือวางข้อความจาก LINE แล้วตรวจสอบก่อนยืนยัน</p>
          </div>
          <div className="flex gap-2"><input type="date" value={roundDate} onChange={(e) => setRoundDate(e.target.value)} className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm" /><button onClick={logout} className="rounded-2xl border border-white/10 px-4 py-3 text-sm text-slate-300">ออก</button></div>
        </header>

        {message ? <div className="mt-4 rounded-2xl bg-emerald-400/10 p-4 text-sm text-emerald-200">{message}</div> : null}

        <section className="mt-4 grid gap-3 md:grid-cols-5">
          <StatCard title="ยอดรวม" value={formatMoney(totals.totalAmount)} />
          <StatCard title="ยอดถูก" value={formatMoney(totals.totalPrize)} />
          <StatCard title="สุทธิ" value={`${totals.totalNet >= 0 ? "+" : ""}${formatMoney(totals.totalNet)}`} highlight={totals.totalNet >= 0} />
          <StatCard title="รายการ" value={`${totals.entries}`} />
          <StatCard title="รายชื่อ" value={`${totals.customers}`} />
        </section>

        <nav className="mt-5 grid grid-cols-2 gap-2 md:grid-cols-5">
          <TabButton active={activeTab === "add"} onClick={() => setActiveTab("add")}>+ เพิ่มทีละรายการ</TabButton>
          <TabButton active={activeTab === "bulk"} onClick={() => setActiveTab("bulk")}>วางจาก LINE</TabButton>
          <TabButton active={activeTab === "report"} onClick={() => setActiveTab("report")}>Report</TabButton>
          <TabButton active={activeTab === "calculate"} onClick={() => setActiveTab("calculate")}>คำนวณผล</TabButton>
          <TabButton active={activeTab === "entries"} onClick={() => setActiveTab("entries")}>รายการทั้งหมด</TabButton>
        </nav>

        {activeTab === "add" ? <AddPanel form={form} setForm={setForm} changeType={changeType} addEntry={addEntry} addAmount={(value) => setForm((current) => ({ ...current, amount: String((Number(current.amount) || 0) + value) }))} /> : null}
        {activeTab === "bulk" ? <BulkPanel bulkText={bulkText} setBulkText={setBulkText} bulkDefaultName={bulkDefaultName} setBulkDefaultName={setBulkDefaultName} bulkDefaultType={bulkDefaultType} setBulkDefaultType={setBulkDefaultType} prepareBulkData={prepareBulkData} drafts={bulkDrafts} updateDraft={updateDraft} confirmBulkData={confirmBulkData} /> : null}
        {activeTab === "report" ? <ReportPanel report={report} copySummary={copySummary} shareSummary={shareSummary} /> : null}
        {activeTab === "calculate" ? <CalculatePanel result={result} setResult={setResult} updateFirstPrize={updateFirstPrize} calculateRound={calculateRound} report={report} /> : null}
        {activeTab === "entries" ? <section className="mt-5 rounded-[2rem] border border-white/10 bg-white/[0.06] p-5"><h2 className="text-xl font-semibold">รายการทั้งหมดในงวดนี้</h2><EntryTable entries={roundEntries} onDelete={(id) => setEntries((current) => current.filter((entry) => entry.id !== id))} /></section> : null}
      </section>
    </main>
  );
}

function AddPanel({ form, setForm, changeType, addEntry, addAmount }: { form: FormState; setForm: (value: FormState | ((current: FormState) => FormState)) => void; changeType: (type: NumberType) => void; addEntry: () => void; addAmount: (value: number) => void }) {
  return <section className="mt-5 rounded-[2rem] border border-white/10 bg-white/[0.06] p-5"><h2 className="text-xl font-semibold">เพิ่มรายการแบบเร็ว</h2><div className="mt-4 grid gap-4 md:grid-cols-2"><Field label="ชื่อคนซื้อ / ชื่อผู้ฝาก"><input value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} placeholder="เช่น บอย" className="field" /></Field><Field label="เลขที่ต้องบันทึก"><input value={form.number} onChange={(e) => setForm({ ...form, number: normalizeNumber(e.target.value) })} placeholder="เช่น 55" inputMode="numeric" className="field text-2xl font-bold tracking-widest" /></Field><Field label="ประเภทเลข"><NumberTypeSelect value={form.numberType} onChange={changeType} /><p className="mt-2 text-xs text-slate-500">{numberTypeHints[form.numberType]}</p></Field><Field label="จำนวนเงิน"><input value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value.replace(/[^0-9.]/g, "") })} placeholder="เช่น 100" inputMode="decimal" className="field" /><div className="mt-2 grid grid-cols-4 gap-2">{[10, 20, 50, 100].map((value) => <button key={value} onClick={() => addAmount(value)} className="rounded-xl bg-white/10 py-2 text-sm">+{value}</button>)}</div></Field><Field label="อัตราจ่าย"><input value={form.payoutRate} onChange={(e) => setForm({ ...form, payoutRate: e.target.value.replace(/[^0-9.]/g, "") })} inputMode="decimal" className="field" /></Field><Field label="หมายเหตุ"><input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="เช่น มาจากไลน์กลุ่ม" className="field" /></Field></div><button onClick={addEntry} className="mt-5 w-full rounded-2xl bg-emerald-400 px-5 py-4 text-lg font-bold text-slate-950">บันทึกแล้วเพิ่มต่อ</button></section>;
}

function BulkPanel(props: { bulkText: string; setBulkText: (value: string) => void; bulkDefaultName: string; setBulkDefaultName: (value: string) => void; bulkDefaultType: NumberType; setBulkDefaultType: (value: NumberType) => void; prepareBulkData: () => void; drafts: BulkDraft[]; updateDraft: (id: string, patch: Partial<BulkDraft>) => void; confirmBulkData: () => void }) {
  return <section className="mt-5 space-y-4"><div className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-5"><div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between"><div><h2 className="text-xl font-semibold">วางข้อความจาก LINE แล้วเตรียมข้อมูล</h2><p className="mt-1 text-sm text-slate-400">ระบบจะแยกชื่อ เลข ประเภท เงิน และหมายเหตุให้ก่อนบันทึกจริง</p></div><button onClick={props.prepareBulkData} className="rounded-2xl bg-emerald-400 px-5 py-3 font-semibold text-slate-950">เตรียมข้อมูล</button></div><div className="mt-4 grid gap-4 md:grid-cols-[0.7fr_0.7fr_1.6fr]"><Field label="ชื่อเริ่มต้น ถ้าข้อความไม่มีชื่อ"><input value={props.bulkDefaultName} onChange={(e) => props.setBulkDefaultName(e.target.value)} placeholder="เช่น บอย" className="field" /></Field><Field label="ประเภทเริ่มต้น"><NumberTypeSelect value={props.bulkDefaultType} onChange={props.setBulkDefaultType} /></Field><Field label="ตัวอย่างรูปแบบที่ระบบอ่านได้"><div className="rounded-2xl bg-black/30 p-3 text-xs leading-5 text-slate-400">บอย 55 ล่าง 100<br />มด 123 บน3 50<br />เจน 789 หน้า 20<br />เอ 456 ท้าย3 30</div></Field></div><Field label="วางข้อความชุดจาก LINE"><textarea value={props.bulkText} onChange={(e) => props.setBulkText(e.target.value)} placeholder={'ตัวอย่าง:\nบอย 55 ล่าง 100\nบอย 89 ล่าง 50\nมด 123 บน3 20'} className="field mt-2 min-h-48 resize-y leading-7" /></Field></div>{props.drafts.length ? <div className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-5"><div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><h3 className="text-lg font-semibold">ตรวจสอบก่อนยืนยัน</h3><p className="text-sm text-slate-400">แก้ไขช่องที่ระบบแยกผิดได้ แถวสีแดงจะไม่ถูกบันทึก</p></div><button onClick={props.confirmBulkData} className="rounded-2xl bg-emerald-400 px-5 py-3 font-semibold text-slate-950">ยืนยันบันทึก {props.drafts.filter((draft) => !draft.error).length} รายการ</button></div><BulkDraftTable drafts={props.drafts} onUpdate={props.updateDraft} /></div> : null}</section>;
}

function ReportPanel({ report, copySummary, shareSummary }: { report: ReturnType<typeof buildCustomerReport>; copySummary: () => void; shareSummary: () => void }) {
  return <section className="mt-5 rounded-[2rem] border border-white/10 bg-white/[0.06] p-5"><div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><h2 className="text-xl font-semibold">Report ตามรายชื่อ</h2><p className="text-sm text-slate-400">ดูว่าใครยอดเท่าไหร่ ถูกเท่าไหร่ และหักลบสุทธิเหลือเท่าไหร่</p></div><div className="flex gap-2"><button onClick={copySummary} className="rounded-2xl border border-white/10 px-4 py-3 text-sm">Copy</button><button onClick={shareSummary} className="rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-slate-950">Share LINE</button></div></div><ReportTable report={report} /></section>;
}

function CalculatePanel({ result, setResult, updateFirstPrize, calculateRound, report }: { result: ResultInput; setResult: (value: ResultInput) => void; updateFirstPrize: (value: string) => void; calculateRound: () => void; report: ReturnType<typeof buildCustomerReport> }) {
  return <section className="mt-5 rounded-[2rem] border border-white/10 bg-white/[0.06] p-5"><div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between"><div><h2 className="text-xl font-semibold">คำนวณผลหลังออกผล</h2><p className="mt-1 text-sm text-slate-400">กรอกหรือวางผลจากแหล่งทางการ แล้วค่อยกดคำนวณ</p></div><a href={gloUrl} target="_blank" rel="noreferrer" className="rounded-2xl border border-white/10 px-4 py-3 text-sm text-slate-200">เปิดเว็บทางการ</a></div><div className="mt-4 grid gap-4 md:grid-cols-3"><Field label="เลข 6 หลัก"><input value={result.firstPrize} onChange={(e) => updateFirstPrize(e.target.value)} className="field text-2xl font-bold tracking-widest" inputMode="numeric" placeholder="123456" /></Field><Field label="2 ตัวบน"><input value={result.top2} onChange={(e) => setResult({ ...result, top2: normalizeNumber(e.target.value).slice(0, 2) })} className="field text-2xl font-bold tracking-widest" inputMode="numeric" placeholder="56" /></Field><Field label="2 ตัวล่าง"><input value={result.bottom2} onChange={(e) => setResult({ ...result, bottom2: normalizeNumber(e.target.value).slice(0, 2) })} className="field text-2xl font-bold tracking-widest" inputMode="numeric" placeholder="55" /></Field><Field label="3 ตัวบน"><input value={result.top3} onChange={(e) => setResult({ ...result, top3: normalizeNumber(e.target.value).slice(0, 3) })} className="field text-2xl font-bold tracking-widest" inputMode="numeric" placeholder="456" /></Field><Field label="เลขหน้า 3 ตัว หลายเลขได้"><input value={result.front3} onChange={(e) => setResult({ ...result, front3: e.target.value })} className="field text-2xl font-bold tracking-widest" placeholder="123 456" /></Field><Field label="เลขท้าย 3 ตัว หลายเลขได้"><input value={result.back3} onChange={(e) => setResult({ ...result, back3: e.target.value })} className="field text-2xl font-bold tracking-widest" placeholder="789 012" /></Field></div><button onClick={calculateRound} className="mt-5 w-full rounded-2xl bg-emerald-400 px-5 py-4 text-lg font-bold text-slate-950">คำนวณผลทั้งงวด</button><ReportTable report={report} /></section>;
}

function StatCard({ title, value, highlight }: { title: string; value: string; highlight?: boolean }) { return <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-4"><p className="text-sm text-slate-400">{title}</p><p className={`mt-2 text-2xl font-bold ${highlight ? "text-emerald-300" : "text-white"}`}>{value}</p></div>; }
function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) { return <button onClick={onClick} className={`rounded-2xl px-4 py-3 text-sm font-semibold ${active ? "bg-emerald-400 text-slate-950" : "bg-white/10 text-slate-200"}`}>{children}</button>; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="mt-4 block"><span className="mb-2 block text-sm text-slate-400">{label}</span>{children}</label>; }
function NumberTypeSelect({ value, onChange }: { value: NumberType; onChange: (value: NumberType) => void }) { return <select value={value} onChange={(e) => onChange(e.target.value as NumberType)} className="field">{numberTypeOptions.map((type) => <option key={type} value={type}>{numberTypeLabel[type]}</option>)}</select>; }

function BulkDraftTable({ drafts, onUpdate }: { drafts: BulkDraft[]; onUpdate: (id: string, patch: Partial<BulkDraft>) => void }) {
  return <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[1100px] border-separate border-spacing-y-2 text-sm"><thead className="text-left text-slate-400"><tr><th className="px-3 py-2">สถานะ</th><th className="px-3 py-2">ชื่อ</th><th className="px-3 py-2">เลข</th><th className="px-3 py-2">ประเภท</th><th className="px-3 py-2 text-right">เงิน</th><th className="px-3 py-2 text-right">อัตราจ่าย</th><th className="px-3 py-2">หมายเหตุ</th></tr></thead><tbody>{drafts.map((draft) => <tr key={draft.id} className="bg-white/[0.06] align-top"><td className={`rounded-l-2xl px-3 py-3 text-xs ${draft.error ? "text-red-300" : "text-emerald-300"}`}>{draftStatus(draft)}</td><td className="px-3 py-3"><input value={draft.customerName} onChange={(e) => onUpdate(draft.id, { customerName: e.target.value })} className="mini-field" /></td><td className="px-3 py-3"><input value={draft.number} onChange={(e) => onUpdate(draft.id, { number: normalizeNumber(e.target.value) })} className="mini-field font-bold tracking-wider" /></td><td className="px-3 py-3"><NumberTypeSelect value={draft.numberType} onChange={(value) => onUpdate(draft.id, { numberType: value, payoutRate: String(defaultPayoutRate[value]) })} /></td><td className="px-3 py-3"><input value={draft.amount} onChange={(e) => onUpdate(draft.id, { amount: e.target.value.replace(/[^0-9.]/g, "") })} className="mini-field text-right" /></td><td className="px-3 py-3"><input value={draft.payoutRate} onChange={(e) => onUpdate(draft.id, { payoutRate: e.target.value.replace(/[^0-9.]/g, "") })} className="mini-field text-right" /></td><td className="rounded-r-2xl px-3 py-3"><input value={draft.note} onChange={(e) => onUpdate(draft.id, { note: e.target.value })} className="mini-field" /></td></tr>)}</tbody></table></div>;
}

function ReportTable({ report }: { report: ReturnType<typeof buildCustomerReport> }) {
  return <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[760px] border-separate border-spacing-y-2 text-sm"><thead className="text-left text-slate-400"><tr><th className="px-4 py-2">ชื่อ</th><th className="px-4 py-2 text-right">รายการ</th><th className="px-4 py-2 text-right">ยอดรวม</th><th className="px-4 py-2 text-right">ยอดถูก</th><th className="px-4 py-2 text-right">สุทธิ</th><th className="px-4 py-2 text-right">ถูกกี่รายการ</th></tr></thead><tbody>{report.map((item) => <tr key={item.customerName} className="bg-white/[0.06]"><td className="rounded-l-2xl px-4 py-4 font-semibold">{item.customerName}</td><td className="px-4 py-4 text-right">{item.totalEntries}</td><td className="px-4 py-4 text-right">{formatMoney(item.totalAmount)}</td><td className="px-4 py-4 text-right">{formatMoney(item.totalPrize)}</td><td className={`px-4 py-4 text-right font-bold ${item.netAmount >= 0 ? "text-emerald-300" : "text-red-300"}`}>{item.netAmount >= 0 ? "+" : ""}{formatMoney(item.netAmount)}</td><td className="rounded-r-2xl px-4 py-4 text-right">{item.wins}</td></tr>)}</tbody></table>{report.length === 0 ? <p className="py-8 text-center text-sm text-slate-400">ยังไม่มีข้อมูล</p> : null}</div>;
}

function EntryTable({ entries, onDelete }: { entries: Entry[]; onDelete: (id: string) => void }) {
  return <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[980px] border-separate border-spacing-y-2 text-sm"><thead className="text-left text-slate-400"><tr><th className="px-4 py-2">ชื่อ</th><th className="px-4 py-2">เลข</th><th className="px-4 py-2">ประเภท</th><th className="px-4 py-2 text-right">เงิน</th><th className="px-4 py-2">หมายเหตุ</th><th className="px-4 py-2">สถานะ</th><th className="px-4 py-2 text-right">รางวัล</th><th className="px-4 py-2"></th></tr></thead><tbody>{entries.map((entry) => <tr key={entry.id} className="bg-white/[0.06]"><td className="rounded-l-2xl px-4 py-4 font-semibold">{entry.customerName}</td><td className="px-4 py-4 text-lg font-bold tracking-wider">{entry.number}</td><td className="px-4 py-4">{numberTypeLabel[entry.numberType]}</td><td className="px-4 py-4 text-right">{formatMoney(entry.amount)}</td><td className="px-4 py-4 text-slate-300">{entry.note || "-"}</td><td className={`px-4 py-4 ${entry.isWin ? "text-emerald-300" : "text-slate-400"}`}>{entry.isWin ? "ถูก" : "ไม่ถูก/รอผล"}</td><td className="px-4 py-4 text-right">{formatMoney(entry.prizeAmount)}</td><td className="rounded-r-2xl px-4 py-4 text-right"><button onClick={() => onDelete(entry.id)} className="text-red-300">ลบ</button></td></tr>)}</tbody></table>{entries.length === 0 ? <p className="py-8 text-center text-sm text-slate-400">ยังไม่มีรายการ</p> : null}</div>;
}
