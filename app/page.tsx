"use client";

import { useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import type { BulkDraft, EntryKind, NumberEntry, PaymentStatus } from "@/src/types";
import { draftStatus, parseBulkText } from "@/src/lib/bulk-parser";
import {
  buildCustomerReport,
  buildLineSummary,
  expectedDigits,
  formatMoney,
  kindLabel,
  kindShortLabel,
  normalizeNumber,
  paymentLabel,
  reverseNumbers,
  sameCustomer,
  sanitizeAmount,
  validateNumberForKind
} from "@/src/lib/calculation";
import { loadFromStorage, saveToStorage } from "@/src/lib/storage";

type Tab = "quick" | "bulk" | "entries" | "summary";

type FormState = {
  customerName: string;
  number: string;
  kind: EntryKind;
  amount: string;
  paymentStatus: PaymentStatus;
  note: string;
  reverseMode: boolean;
};

const entriesKey = "lotto-record:v4:number-entries";
const userKey = "lotto-record:v4:user";
const amountPresets = [10, 20, 50, 100, 200, 500];
const kindGroups: EntryKind[] = ["two_top", "two_bottom", "three_direct", "three_tod", "run_top", "run_bottom"];

const initialForm: FormState = {
  customerName: "",
  number: "",
  kind: "two_top",
  amount: "20",
  paymentStatus: "paid",
  note: "",
  reverseMode: false
};

function getBangkokDate() {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function csvEscape(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function buildEntry(args: Omit<NumberEntry, "id" | "createdAt">): NumberEntry {
  return { ...args, id: makeId(), createdAt: nowIso() };
}

export default function HomePage() {
  const [userName, setUserName] = useState("");
  const [loginName, setLoginName] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("quick");
  const [drawDate, setDrawDate] = useState(getBangkokDate());
  const [entries, setEntries] = useState<NumberEntry[]>([]);
  const [form, setForm] = useState<FormState>(initialForm);
  const [bulkText, setBulkText] = useState("");
  const [bulkDefaultName, setBulkDefaultName] = useState("");
  const [bulkDrafts, setBulkDrafts] = useState<BulkDraft[]>([]);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    setEntries(loadFromStorage<NumberEntry[]>(entriesKey, []));
    setUserName(loadFromStorage<string>(userKey, ""));
  }, []);

  useEffect(() => saveToStorage(entriesKey, entries), [entries]);

  const drawEntries = useMemo(() => entries.filter((entry) => entry.drawDate === drawDate), [entries, drawDate]);
  const report = useMemo(() => buildCustomerReport(drawEntries), [drawEntries]);
  const recentCustomers = useMemo(() => Array.from(new Set(drawEntries.map((entry) => entry.customerName))).slice(0, 8), [drawEntries]);
  const latestEntries = useMemo(() => drawEntries.slice(0, 8), [drawEntries]);
  const filteredEntries = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return drawEntries;
    return drawEntries.filter((entry) => [entry.customerName, entry.number, kindLabel[entry.kind], entry.note].join(" ").toLowerCase().includes(query));
  }, [drawEntries, search]);
  const totals = useMemo(() => {
    const totalAmount = drawEntries.reduce((sum, entry) => sum + entry.amount, 0);
    const paidAmount = drawEntries.filter((entry) => entry.paymentStatus === "paid").reduce((sum, entry) => sum + entry.amount, 0);
    return {
      totalAmount,
      paidAmount,
      unpaidAmount: totalAmount - paidAmount,
      entries: drawEntries.length,
      customers: report.length
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

  function mergeEntries(newEntries: NumberEntry[]) {
    setEntries((current) => {
      const next = [...current];
      for (const entry of newEntries) {
        const duplicateIndex = next.findIndex((item) =>
          item.drawDate === entry.drawDate
          && sameCustomer(item.customerName, entry.customerName)
          && item.number === entry.number
          && item.kind === entry.kind
          && item.paymentStatus === entry.paymentStatus
        );

        if (duplicateIndex >= 0) {
          const old = next[duplicateIndex];
          next[duplicateIndex] = {
            ...old,
            amount: old.amount + entry.amount,
            note: [old.note, entry.note].filter(Boolean).join(" | "),
            updatedAt: nowIso()
          };
        } else {
          next.unshift(entry);
        }
      }
      return next;
    });
  }

  function addEntry() {
    const customerName = form.customerName.trim();
    const number = normalizeNumber(form.number).slice(0, expectedDigits(form.kind));
    const amount = Number(form.amount);
    const numberError = validateNumberForKind(number, form.kind);

    if (!customerName) return setMessage("กรุณาใส่ชื่อลูกค้าก่อนบันทึก");
    if (numberError) return setMessage(numberError);
    if (!amount || amount <= 0) return setMessage("กรุณาใส่ยอดให้ถูกต้อง");

    const numbers = form.reverseMode ? reverseNumbers(number, form.kind) : [number];
    const newEntries = numbers.map((item) => buildEntry({
      drawDate,
      customerName,
      number: item,
      kind: form.kind,
      amount,
      paymentStatus: form.paymentStatus,
      note: form.note.trim()
    }));

    mergeEntries(newEntries);
    setMessage(form.reverseMode && numbers.length > 1 ? `บันทึกแล้ว ${numbers.length} รายการ: ${numbers.join(", ")}` : `บันทึกแล้ว: ${customerName} ${number} ${kindShortLabel[form.kind]} ${formatMoney(amount)}`);
    setForm((current) => ({ ...current, number: "", amount: current.amount || "20", note: "", reverseMode: false }));
    setActiveTab("quick");
  }

  function prepareBulkData() {
    const drafts = parseBulkText(bulkText, bulkDefaultName);
    setBulkDrafts(drafts);
    setMessage(drafts.length ? `แยกข้อมูลได้ ${drafts.length} รายการ ตรวจแถวสีแดงก่อนยืนยัน` : "ยังแยกข้อมูลไม่ได้ ลองใส่รูปแบบ เช่น พี่บอย 25 บน 50");
  }

  function updateDraft(id: string, patch: Partial<BulkDraft>) {
    setBulkDrafts((current) => current.map((draft) => {
      if (draft.id !== id) return draft;
      const updated = { ...draft, ...patch };
      const error = validateNumberForKind(normalizeNumber(updated.number).slice(0, expectedDigits(updated.kind)), updated.kind)
        || (!updated.customerName.trim() ? "ไม่พบชื่อ" : null)
        || (!Number(updated.amount) || Number(updated.amount) <= 0 ? "ยอดไม่ถูกต้อง" : null);
      return { ...updated, error: error || undefined };
    }));
  }

  function confirmBulkData() {
    const validEntries = bulkDrafts
      .filter((draft) => !draft.error)
      .map((draft) => buildEntry({
        drawDate,
        customerName: draft.customerName.trim(),
        number: normalizeNumber(draft.number).slice(0, expectedDigits(draft.kind)),
        kind: draft.kind,
        amount: Number(draft.amount),
        paymentStatus: draft.paymentStatus,
        note: draft.note.trim()
      }));

    if (!validEntries.length) return setMessage("ยังไม่มีรายการที่พร้อมบันทึก");
    mergeEntries(validEntries);
    setBulkDrafts([]);
    setBulkText("");
    setMessage(`ยืนยันบันทึกแล้ว ${validEntries.length} รายการ รายการซ้ำจะถูกรวมยอดให้เอง`);
    setActiveTab("entries");
  }

  function deleteEntry(id: string) {
    const target = entries.find((entry) => entry.id === id);
    if (!target) return;
    const ok = window.confirm(`ลบ ${target.customerName} ${target.number} ${kindShortLabel[target.kind]} ${formatMoney(target.amount)} ใช่ไหม?`);
    if (!ok) return;
    setEntries((current) => current.filter((entry) => entry.id !== id));
    setMessage("ลบรายการแล้ว");
  }

  function togglePaid(id: string) {
    setEntries((current) => current.map((entry) => entry.id === id ? { ...entry, paymentStatus: entry.paymentStatus === "paid" ? "unpaid" : "paid", updatedAt: nowIso() } : entry));
  }

  async function copySummary() {
    const text = buildLineSummary(drawDate, report, drawEntries);
    try {
      await navigator.clipboard.writeText(text);
      setMessage("คัดลอกสรุปแล้ว พร้อมส่ง LINE");
    } catch {
      setMessage("คัดลอกไม่สำเร็จ กรุณาลองใหม่");
    }
  }

  async function shareSummary() {
    const text = buildLineSummary(drawDate, report, drawEntries);
    try {
      if (navigator.share) {
        await navigator.share({ title: `สรุปงวด ${drawDate}`, text });
        return;
      }
      await copySummary();
    } catch {
      setMessage("ยกเลิกการแชร์หรือแชร์ไม่สำเร็จ");
    }
  }

  function exportCsv() {
    const rows = [
      ["งวด", "ชื่อลูกค้า", "เลข", "ประเภท", "ยอด", "สถานะ", "หมายเหตุ", "เวลาบันทึก"],
      ...drawEntries.map((entry) => [entry.drawDate, entry.customerName, entry.number, kindLabel[entry.kind], entry.amount, paymentLabel[entry.paymentStatus], entry.note, entry.createdAt])
    ];
    const csv = `\uFEFF${rows.map((row) => row.map(csvEscape).join(",")).join("\n")}`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `number-record-${drawDate}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (!userName) {
    return (
      <main className="min-h-screen bg-[#f1f5fb] px-4 py-8 text-slate-900">
        <section className="mx-auto flex min-h-[82vh] max-w-md flex-col justify-center">
          <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl shadow-slate-950/10">
            <div className="bg-[linear-gradient(135deg,#08264a,#0b3c72_60%,#d09a34)] px-6 py-7 text-white">
              <p className="text-sm font-semibold tracking-[0.24em] text-white/75">NUMBER RECORD</p>
              <h1 className="mt-4 text-3xl font-bold leading-tight">ระบบจดเลขเร็ว</h1>
              <p className="mt-3 text-sm leading-6 text-blue-50/90">ปุ่มใหญ่ อ่านง่าย เหมาะกับคนใช้งานมือถือ อายุ 30–50 ปี เน้นจดไว กันพลาด และสรุปยอดทันที</p>
            </div>
            <div className="p-6">
              <Field label="ชื่อผู้ใช้งาน">
                <input value={loginName} onChange={(event) => setLoginName(event.target.value)} placeholder="เช่น แอดมิน / หน้าร้าน" className="field" />
              </Field>
              <button onClick={login} className="primary-button mt-4 w-full px-4 py-4 text-lg">เข้าใช้งาน</button>
              <p className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900">ระบบนี้เป็นเครื่องมือบันทึกข้อมูลส่วนตัว ไม่มีระบบฝากถอน รับเงินออนไลน์ หรือจ่ายเงินในระบบ</p>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f4f7fb] px-3 py-4 text-slate-900 md:px-5">
      <section className="mx-auto max-w-7xl pb-28">
        <header className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-xl shadow-slate-950/5">
          <div className="bg-[linear-gradient(135deg,#08264a,#0b3c72_58%,#c9973d)] p-5 text-white md:p-7">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm text-blue-50/80">ผู้ใช้งาน: {userName}</p>
                <h1 className="text-2xl font-bold md:text-4xl">โหมดจดเลขเร็ว</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-blue-50/90">ออกแบบให้เปิดมือถือแล้วจดได้ทันที: ชื่อ → เลข → ประเภท → ยอด → บันทึก</p>
              </div>
              <div className="grid grid-cols-[1fr_auto] gap-2 sm:flex">
                <input type="date" value={drawDate} onChange={(event) => setDrawDate(event.target.value)} className="rounded-2xl border border-white/30 bg-white px-4 py-3 text-sm text-slate-900" />
                <button onClick={logout} className="rounded-2xl border border-white/30 bg-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/20">ออก</button>
              </div>
            </div>
          </div>
          <div className="grid gap-3 border-t border-slate-200 bg-white p-4 md:grid-cols-4">
            <InfoCard title="ปุ่มใหญ่" text="กดง่ายบนมือถือ ไม่ต้องเล็งมาก" />
            <InfoCard title="กันพลาด" text="บันทึกไม่ได้ถ้าข้อมูลยังไม่ครบ" />
            <InfoCard title="รวมซ้ำ" text="ชื่อเดิม เลขเดิม ประเภทเดิม รวมยอดให้เอง" />
            <InfoCard title="ส่งสรุป" text="คัดลอก/แชร์ยอดให้ลูกค้าหรือทีมได้เร็ว" />
          </div>
        </header>

        {message ? <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-900">{message}</div> : null}

        <section className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
          <StatCard title="ยอดรวม" value={formatMoney(totals.totalAmount)} />
          <StatCard title="จ่ายแล้ว" value={formatMoney(totals.paidAmount)} />
          <StatCard title="ค้างจ่าย" value={formatMoney(totals.unpaidAmount)} alert={totals.unpaidAmount > 0} />
          <StatCard title="รายการ" value={`${totals.entries} รายการ`} />
          <StatCard title="ลูกค้า" value={`${totals.customers} คน`} />
        </section>

        <nav className="sticky top-2 z-20 mt-5 grid grid-cols-4 gap-2 rounded-[1.35rem] border border-slate-200 bg-white/95 p-2 shadow-lg shadow-slate-950/5 backdrop-blur">
          <TabButton active={activeTab === "quick"} onClick={() => setActiveTab("quick")}>จดเร็ว</TabButton>
          <TabButton active={activeTab === "bulk"} onClick={() => setActiveTab("bulk")}>LINE</TabButton>
          <TabButton active={activeTab === "entries"} onClick={() => setActiveTab("entries")}>รายการ</TabButton>
          <TabButton active={activeTab === "summary"} onClick={() => setActiveTab("summary")}>สรุป</TabButton>
        </nav>

        {activeTab === "quick" ? <QuickPanel form={form} setForm={setForm} addEntry={addEntry} recentCustomers={recentCustomers} latestEntries={latestEntries} /> : null}
        {activeTab === "bulk" ? <BulkPanel bulkText={bulkText} setBulkText={setBulkText} bulkDefaultName={bulkDefaultName} setBulkDefaultName={setBulkDefaultName} prepareBulkData={prepareBulkData} drafts={bulkDrafts} updateDraft={updateDraft} confirmBulkData={confirmBulkData} /> : null}
        {activeTab === "entries" ? <EntriesPanel entries={filteredEntries} search={search} setSearch={setSearch} onDelete={deleteEntry} onTogglePaid={togglePaid} /> : null}
        {activeTab === "summary" ? <SummaryPanel report={report} totals={totals} copySummary={copySummary} shareSummary={shareSummary} exportCsv={exportCsv} /> : null}
      </section>
    </main>
  );
}

function QuickPanel({ form, setForm, addEntry, recentCustomers, latestEntries }: { form: FormState; setForm: Dispatch<SetStateAction<FormState>>; addEntry: () => void; recentCustomers: string[]; latestEntries: NumberEntry[] }) {
  const digits = expectedDigits(form.kind);
  const number = normalizeNumber(form.number).slice(0, digits);
  const amount = Number(form.amount) || 0;
  const numberError = number ? validateNumberForKind(number, form.kind) : `รอเลข ${digits} หลัก`;
  const previewNumbers = form.reverseMode ? reverseNumbers(number, form.kind) : [number];
  const canSave = Boolean(form.customerName.trim() && !validateNumberForKind(number, form.kind) && amount > 0);

  function setPatch(patch: Partial<FormState>) {
    setForm((current) => ({ ...current, ...patch }));
  }

  function pressDigit(value: string) {
    setForm((current) => ({ ...current, number: normalizeNumber(`${current.number}${value}`).slice(0, expectedDigits(current.kind)) }));
  }

  function chooseKind(kind: EntryKind) {
    setForm((current) => ({ ...current, kind, number: normalizeNumber(current.number).slice(0, expectedDigits(kind)), reverseMode: current.reverseMode && expectedDigits(kind) > 1 }));
  }

  return (
    <section className="mt-5 grid gap-5 lg:grid-cols-[1.08fr_0.92fr]">
      <div className="panel mt-0">
        <SectionTitle title="จดเร็ว" description="สำหรับหน้างานจริง ปุ่มใหญ่ ลำดับสั้น และมี Preview ก่อนบันทึก" />

        <div className="mt-5 grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
          <Field label="ชื่อลูกค้า">
            <input value={form.customerName} onChange={(event) => setPatch({ customerName: event.target.value })} placeholder="เช่น พี่บอย / แม่แดง" className="field text-xl font-bold" />
          </Field>
          <Field label="สถานะ">
            <div className="grid grid-cols-2 gap-2">
              {(["paid", "unpaid"] as PaymentStatus[]).map((status) => <button key={status} onClick={() => setPatch({ paymentStatus: status })} className={`big-choice ${form.paymentStatus === status ? "big-choice-active" : ""}`}>{paymentLabel[status]}</button>)}
            </div>
          </Field>
        </div>

        {recentCustomers.length ? <div className="mt-3 flex gap-2 overflow-x-auto pb-1">{recentCustomers.map((name) => <button key={name} onClick={() => setPatch({ customerName: name })} className="whitespace-nowrap rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700">{name}</button>)}</div> : null}

        <div className="mt-5 rounded-[2rem] border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-500">เลข {digits} หลัก</p>
              <p className={`mt-1 font-mono text-5xl font-black tracking-[0.2em] ${number.length === digits ? "text-[#0b2e59]" : "text-slate-400"}`}>{number.padEnd(digits, "•")}</p>
              <p className="mt-1 text-sm text-slate-500">{numberError || "พร้อมบันทึก"}</p>
            </div>
            <button onClick={() => setPatch({ number: "" })} className="secondary-button px-4 py-3 text-sm">ล้าง</button>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => <KeyButton key={digit} onClick={() => pressDigit(digit)}>{digit}</KeyButton>)}
            <KeyButton onClick={() => setForm((current) => ({ ...current, number: current.number.slice(0, -1) }))}>ลบ</KeyButton>
            <KeyButton onClick={() => pressDigit("0")}>0</KeyButton>
            <KeyButton onClick={() => setPatch({ number: "" })}>CLR</KeyButton>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2 md:grid-cols-3">
          {kindGroups.map((kind) => <button key={kind} onClick={() => chooseKind(kind)} className={`kind-button ${form.kind === kind ? "kind-button-active" : ""}`}>{kindLabel[kind]}</button>)}
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-[1.5rem] border border-slate-200 bg-white p-4">
            <p className="text-sm font-semibold text-slate-700">ยอดเงิน</p>
            <input value={form.amount} onChange={(event) => setPatch({ amount: sanitizeAmount(event.target.value) })} inputMode="decimal" className="field mt-3 py-4 text-center text-3xl font-black" />
            <div className="mt-3 grid grid-cols-3 gap-2">
              {amountPresets.map((item) => <ChipButton key={item} active={amount === item} onClick={() => setPatch({ amount: String(item) })}>{item}</ChipButton>)}
            </div>
          </div>
          <div className="rounded-[1.5rem] border border-slate-200 bg-white p-4">
            <p className="text-sm font-semibold text-slate-700">ตัวเลือก</p>
            <button disabled={digits === 1} onClick={() => setPatch({ reverseMode: !form.reverseMode })} className={`mt-3 w-full rounded-2xl border px-4 py-4 text-lg font-black ${form.reverseMode ? "border-amber-300 bg-amber-100 text-amber-900" : "border-slate-200 bg-slate-50 text-slate-700 disabled:opacity-40"}`}>กลับเลข</button>
            <input value={form.note} onChange={(event) => setPatch({ note: event.target.value })} placeholder="หมายเหตุ เช่น โทรมา / ฝากไว้" className="field mt-3" />
          </div>
        </div>

        <div className="mt-5 rounded-[1.5rem] border border-blue-100 bg-blue-50 p-4">
          <p className="text-sm font-semibold text-blue-900">ตรวจอีกทีก่อนบันทึก</p>
          <p className="mt-2 text-2xl font-black text-[#0b2e59]">{form.customerName.trim() || "ยังไม่ใส่ชื่อ"} / {previewNumbers.filter(Boolean).join(", ") || "--"} / {kindLabel[form.kind]} / {formatMoney(amount)}</p>
          {form.reverseMode && previewNumbers.length > 1 ? <p className="mt-1 text-sm text-blue-700">เปิดกลับเลข จะเพิ่ม {previewNumbers.length} รายการ รวม {formatMoney(amount * previewNumbers.length)}</p> : null}
        </div>

        <button onClick={addEntry} disabled={!canSave} className="primary-button mt-5 w-full px-5 py-5 text-xl disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none">บันทึกรายการ</button>
      </div>

      <aside className="panel mt-0">
        <SectionTitle title="รายการล่าสุด" description="เช็กทันทีว่าบันทึกเข้าแล้ว" />
        <div className="mt-4 space-y-3">
          {latestEntries.length ? latestEntries.map((entry) => <EntryCard key={entry.id} entry={entry} />) : <EmptyText>ยังไม่มีรายการในงวดนี้</EmptyText>}
        </div>
      </aside>
    </section>
  );
}

function BulkPanel({ bulkText, setBulkText, bulkDefaultName, setBulkDefaultName, prepareBulkData, drafts, updateDraft, confirmBulkData }: { bulkText: string; setBulkText: (value: string) => void; bulkDefaultName: string; setBulkDefaultName: (value: string) => void; prepareBulkData: () => void; drafts: BulkDraft[]; updateDraft: (id: string, patch: Partial<BulkDraft>) => void; confirmBulkData: () => void }) {
  return (
    <section className="panel">
      <SectionTitle title="วางจาก LINE" description="ตัวอย่าง: พี่บอย 25 บน 50 / แอน 123 โต๊ด 20 / แม่แดง วิ่งบน 7 100" />
      <div className="mt-5 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <Field label="ชื่อลูกค้าเริ่มต้น ถ้าบรรทัดไม่มีชื่อ">
            <input value={bulkDefaultName} onChange={(event) => setBulkDefaultName(event.target.value)} placeholder="เช่น พี่บอย" className="field" />
          </Field>
          <textarea value={bulkText} onChange={(event) => setBulkText(event.target.value)} placeholder={'พี่บอย 25 บน 50\nพี่บอย 25 ล่าง 50\nแอน 123 โต๊ด 20'} className="field mt-4 min-h-64" />
          <button onClick={prepareBulkData} className="primary-button mt-4 w-full px-4 py-4">แยกรายการ</button>
        </div>
        <div className="space-y-3">
          {drafts.length ? drafts.map((draft) => <div key={draft.id} className={`rounded-2xl border p-3 ${draft.error ? "border-red-200 bg-red-50" : "border-emerald-200 bg-emerald-50"}`}>
            <div className="grid gap-2 md:grid-cols-5">
              <input value={draft.customerName} onChange={(event) => updateDraft(draft.id, { customerName: event.target.value })} className="mini-field md:col-span-1" />
              <input value={draft.number} onChange={(event) => updateDraft(draft.id, { number: normalizeNumber(event.target.value).slice(0, expectedDigits(draft.kind)) })} className="mini-field font-mono" />
              <select value={draft.kind} onChange={(event) => updateDraft(draft.id, { kind: event.target.value as EntryKind })} className="mini-field">
                {kindGroups.map((kind) => <option key={kind} value={kind}>{kindLabel[kind]}</option>)}
              </select>
              <input value={draft.amount} onChange={(event) => updateDraft(draft.id, { amount: sanitizeAmount(event.target.value) })} className="mini-field" />
              <select value={draft.paymentStatus} onChange={(event) => updateDraft(draft.id, { paymentStatus: event.target.value as PaymentStatus })} className="mini-field">
                <option value="paid">จ่ายแล้ว</option>
                <option value="unpaid">ค้างจ่าย</option>
              </select>
            </div>
            <p className="mt-2 text-xs text-slate-600">{draftStatus(draft)}</p>
          </div>) : <EmptyText>ยังไม่มีรายการที่แยกแล้ว</EmptyText>}
          {drafts.length ? <button onClick={confirmBulkData} className="primary-button w-full px-4 py-4">ยืนยันบันทึกทั้งหมด</button> : null}
        </div>
      </div>
    </section>
  );
}

function EntriesPanel({ entries, search, setSearch, onDelete, onTogglePaid }: { entries: NumberEntry[]; search: string; setSearch: (value: string) => void; onDelete: (id: string) => void; onTogglePaid: (id: string) => void }) {
  return (
    <section className="panel">
      <SectionTitle title="รายการทั้งหมด" description="ค้นหาชื่อ/เลข/ประเภท แล้วเปลี่ยนสถานะหรือลบรายการได้" />
      <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ค้นหาชื่อลูกค้า หรือเลข" className="field mt-4" />
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {entries.length ? entries.map((entry) => <div key={entry.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-lg font-black text-slate-900">{entry.customerName}</p>
              <p className="mt-1 font-mono text-3xl font-black tracking-[0.16em] text-[#0b2e59]">{entry.number}</p>
              <p className="mt-1 text-sm font-semibold text-slate-600">{kindLabel[entry.kind]} • {formatMoney(entry.amount)}</p>
              {entry.note ? <p className="mt-1 text-xs text-slate-500">{entry.note}</p> : null}
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${entry.paymentStatus === "paid" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>{paymentLabel[entry.paymentStatus]}</span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button onClick={() => onTogglePaid(entry.id)} className="secondary-button px-4 py-3 text-sm">เปลี่ยนสถานะ</button>
            <button onClick={() => onDelete(entry.id)} className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">ลบ</button>
          </div>
        </div>) : <EmptyText>ยังไม่มีรายการ</EmptyText>}
      </div>
    </section>
  );
}

function SummaryPanel({ report, totals, copySummary, shareSummary, exportCsv }: { report: ReturnType<typeof buildCustomerReport>; totals: { totalAmount: number; paidAmount: number; unpaidAmount: number; entries: number; customers: number }; copySummary: () => void; shareSummary: () => void; exportCsv: () => void }) {
  return (
    <section className="panel">
      <SectionTitle title="สรุปตามลูกค้า" description="ดูยอดรวม จ่ายแล้ว ค้างจ่าย และคัดลอกส่ง LINE" />
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <StatCard title="ยอดรวม" value={formatMoney(totals.totalAmount)} />
        <StatCard title="จ่ายแล้ว" value={formatMoney(totals.paidAmount)} />
        <StatCard title="ค้างจ่าย" value={formatMoney(totals.unpaidAmount)} alert={totals.unpaidAmount > 0} />
      </div>
      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <button onClick={copySummary} className="primary-button px-4 py-4">คัดลอกสรุป</button>
        <button onClick={shareSummary} className="secondary-button px-4 py-4">แชร์</button>
        <button onClick={exportCsv} className="secondary-button px-4 py-4">Export CSV</button>
      </div>
      <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
        {report.length ? report.map((item) => <div key={item.customerName} className="grid gap-2 border-b border-slate-100 bg-white p-4 last:border-b-0 md:grid-cols-[1fr_auto_auto_auto] md:items-center">
          <p className="text-lg font-black">{item.customerName}</p>
          <p className="text-sm text-slate-600">{item.totalEntries} รายการ</p>
          <p className="font-bold text-[#0b2e59]">รวม {formatMoney(item.totalAmount)}</p>
          <p className="font-bold text-amber-700">ค้าง {formatMoney(item.unpaidAmount)}</p>
        </div>) : <EmptyText>ยังไม่มีข้อมูลสรุป</EmptyText>}
      </div>
    </section>
  );
}

function EntryCard({ entry }: { entry: NumberEntry }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-black">{entry.customerName}</p><p className="mt-1 font-mono text-2xl font-black tracking-[0.15em] text-[#0b2e59]">{entry.number}</p><p className="text-sm text-slate-600">{kindLabel[entry.kind]} • {formatMoney(entry.amount)}</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">{paymentLabel[entry.paymentStatus]}</span></div></div>;
}

function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block"><span className="mb-2 block text-sm font-bold text-slate-700">{label}</span>{children}</label>; }
function SectionTitle({ title, description }: { title: string; description: string }) { return <div><h2 className="text-xl font-black text-slate-950 md:text-2xl">{title}</h2><p className="mt-1 text-sm leading-6 text-slate-500">{description}</p></div>; }
function StatCard({ title, value, alert }: { title: string; value: string; alert?: boolean }) { return <div className={`rounded-3xl border p-4 shadow-sm ${alert ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"}`}><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{title}</p><p className="mt-2 text-xl font-black text-slate-950 md:text-2xl">{value}</p></div>; }
function InfoCard({ title, text }: { title: string; text: string }) { return <div className="rounded-2xl bg-slate-50 p-4"><p className="font-black text-slate-900">{title}</p><p className="mt-1 text-sm leading-5 text-slate-500">{text}</p></div>; }
function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) { return <button onClick={onClick} className={`rounded-2xl px-2 py-3 text-sm font-black transition ${active ? "bg-[#0b2e59] text-white shadow-lg shadow-blue-950/15" : "bg-slate-50 text-slate-600 hover:bg-blue-50"}`}>{children}</button>; }
function KeyButton({ onClick, children }: { onClick: () => void; children: ReactNode }) { return <button onClick={onClick} className="number-key">{children}</button>; }
function ChipButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) { return <button onClick={onClick} className={`rounded-2xl border px-3 py-3 text-lg font-black transition ${active ? "border-[#0b2e59] bg-[#0b2e59] text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-blue-50"}`}>{children}</button>; }
function EmptyText({ children }: { children: ReactNode }) { return <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">{children}</div>; }
