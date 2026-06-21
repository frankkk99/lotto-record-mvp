"use client";

import { useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
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

type Tab = "quick" | "bulk" | "entries" | "report" | "calculate";

type FormState = {
  holderName: string;
  lotteryNumber: string;
  quantity: string;
  pricePerTicket: string;
  note: string;
};

const entriesKey = "lotto-record:v3:entries";
const userKey = "lotto-record:v3:user";
const officialResultUrl = "https://www.glo.or.th/home-page";
const pricePresets = [80, 100, 120];
const quantityPresets = [1, 2, 5, 10];

const initialForm: FormState = {
  holderName: "",
  lotteryNumber: "",
  quantity: "1",
  pricePerTicket: "80",
  note: ""
};

function getBangkokDate() {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function sameHolder(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function recalculateEntryWithQuantity(entry: Entry, quantity: number): Entry {
  const rewardAmount = entry.matchedPrizes.reduce((sum, prize) => sum + prize.amountPerTicket * quantity, 0);
  return {
    ...entry,
    quantity,
    rewardAmount,
    netAmount: rewardAmount - quantity * entry.pricePerTicket
  };
}

export default function HomePage() {
  const [userName, setUserName] = useState("");
  const [loginName, setLoginName] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("quick");
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
  const latestEntries = useMemo(() => drawEntries.slice(0, 6), [drawEntries]);
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
      setMessage("กรุณาใส่ชื่อก่อนบันทึก");
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

    const duplicate = drawEntries.find((item) =>
      sameHolder(item.holderName, entry.holderName)
      && item.lotteryNumber === entry.lotteryNumber
      && item.pricePerTicket === entry.pricePerTicket
    );

    if (duplicate) {
      const nextQuantity = duplicate.quantity + entry.quantity;
      setEntries((current) => current.map((item) => item.id === duplicate.id ? recalculateEntryWithQuantity(item, nextQuantity) : item));
      setMessage(`เลข ${entry.lotteryNumber} ของ ${entry.holderName} มีอยู่แล้ว ระบบรวมเป็น ${nextQuantity} ใบให้แล้ว`);
    } else {
      setEntries((current) => [entry, ...current]);
      setMessage(`บันทึกแล้ว: ${entry.holderName} เลข ${entry.lotteryNumber} จำนวน ${entry.quantity} ใบ`);
    }

    setForm((current) => ({ ...current, lotteryNumber: "", quantity: "1", note: "" }));
    setActiveTab("quick");
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
    setMessage(drafts.length ? `เตรียมข้อมูลแล้ว ${drafts.length} รายการ กรุณาตรวจแถวสีแดงก่อนยืนยัน` : "ยังแยกข้อมูลไม่ได้ ลองใส่ชื่อและเลขสลาก 6 หลักให้ชัดขึ้น");
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

    setEntries((current) => {
      const next = [...current];
      for (const entry of validEntries.reverse()) {
        const duplicateIndex = next.findIndex((item) =>
          item.drawDate === entry.drawDate
          && sameHolder(item.holderName, entry.holderName)
          && item.lotteryNumber === entry.lotteryNumber
          && item.pricePerTicket === entry.pricePerTicket
        );
        if (duplicateIndex >= 0) {
          next[duplicateIndex] = recalculateEntryWithQuantity(next[duplicateIndex], next[duplicateIndex].quantity + entry.quantity);
        } else {
          next.unshift(entry);
        }
      }
      return next;
    });

    setBulkDrafts([]);
    setBulkText("");
    setMessage(`ยืนยันบันทึกแล้ว ${validEntries.length} รายการ รายการซ้ำจะถูกรวมใบให้เอง`);
    setActiveTab("entries");
  }

  function calculateRound() {
    const cleanResult = normalizeResultInput(result);
    const calculated = calculateEntries(drawEntries, cleanResult);
    const calculatedMap = new Map(calculated.map((entry) => [entry.id, entry]));
    setEntries((current) => current.map((entry) => calculatedMap.get(entry.id) ?? entry));
    setResult(cleanResult);
    setMessage("คำนวณผลเรียบร้อย ตรวจ Report ได้ทันที");
  }

  function changeEntryQuantity(id: string, delta: number) {
    setEntries((current) => current.map((entry) => {
      if (entry.id !== id) return entry;
      const nextQuantity = Math.max(1, entry.quantity + delta);
      return recalculateEntryWithQuantity(entry, nextQuantity);
    }));
  }

  function deleteEntry(id: string) {
    const target = entries.find((entry) => entry.id === id);
    if (!target) return;
    const ok = window.confirm(`ลบรายการ ${target.holderName} เลข ${target.lotteryNumber} ใช่ไหม?`);
    if (!ok) return;
    setEntries((current) => current.filter((entry) => entry.id !== id));
    setMessage(`ลบรายการ ${target.lotteryNumber} แล้ว`);
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
        entry.matchedPrizes.map((prize) => prize.label).join(" + ") || "ยังไม่พบรางวัล",
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
              <h1 className="mt-4 text-3xl font-bold leading-tight">ระบบบันทึกสลากหน้างาน</h1>
              <p className="mt-3 text-sm leading-6 text-blue-50/90">ออกแบบให้คนจดรายการใช้ง่าย ปุ่มใหญ่ กรอกเร็ว ตรวจพลาดก่อนบันทึก และสรุปรายงานได้ทันที</p>
            </div>
            <div className="p-6">
              <Field label="ชื่อผู้ใช้งาน">
                <input value={loginName} onChange={(event) => setLoginName(event.target.value)} placeholder="เช่น แอดมิน / หน้าร้าน" className="field" />
              </Field>
              <button onClick={login} className="primary-button mt-4 w-full px-4 py-4 text-base">เข้าใช้งาน</button>
              <p className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900">ระบบนี้เป็นเครื่องมือบันทึกและตรวจคำนวณข้อมูลสลากส่วนตัวเท่านั้น ไม่ใช่ระบบรับแทง ฝากถอน หรือจ่ายเงิน</p>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f4f7fb] px-3 py-4 text-slate-900 md:px-5">
      <section className="mx-auto max-w-7xl pb-24">
        <header className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-xl shadow-slate-950/5">
          <div className="bg-[linear-gradient(135deg,#08264a,#0b3c72_58%,#c9973d)] p-5 text-white md:p-7">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm text-blue-50/80">เข้าสู่ระบบโดย {userName}</p>
                <h1 className="text-2xl font-bold md:text-4xl">Lotto Field Desk</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-blue-50/90">โหมดหน้างานสำหรับบันทึกรายการสลากเร็ว กันเลขผิด กันบันทึกซ้ำ และสรุปยอดตามรายชื่อ</p>
              </div>
              <div className="grid grid-cols-[1fr_auto] gap-2 sm:flex">
                <input type="date" value={drawDate} onChange={(event) => setDrawDate(event.target.value)} className="rounded-2xl border border-white/30 bg-white px-4 py-3 text-sm text-slate-900" />
                <button onClick={logout} className="rounded-2xl border border-white/30 bg-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/20">ออก</button>
              </div>
            </div>
          </div>
          <div className="grid gap-3 border-t border-slate-200 bg-white p-4 md:grid-cols-4">
            <InfoCard title="ปุ่มใหญ่" text="กดง่ายบนมือถือ ใช้งานตอนลูกค้ารอได้เร็วขึ้น" />
            <InfoCard title="กันเลขผิด" text="เลขต้องครบ 6 หลัก พร้อมแสดงตัวอย่างก่อนบันทึก" />
            <InfoCard title="รวมซ้ำอัตโนมัติ" text="ชื่อเดิมเลขเดิมจะรวมจำนวนใบให้ ไม่แตกเป็นหลายแถว" />
            <InfoCard title="ลบแบบยืนยัน" text="กันมือไปโดนปุ่มลบโดยไม่ตั้งใจ" />
          </div>
        </header>

        {message ? <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-900">{message}</div> : null}

        <section className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
          <StatCard title="ยอดรวม" value={formatMoney(totals.totalCost)} />
          <StatCard title="จำนวนใบ" value={`${totals.tickets} ใบ`} />
          <StatCard title="รายการ" value={`${totals.entries} รายการ`} />
          <StatCard title="รายชื่อ" value={`${totals.holders} คน`} />
          <StatCard title="รางวัลรวม" value={formatMoney(totals.totalReward)} highlight={totals.totalReward > 0} />
        </section>

        <nav className="sticky top-2 z-20 mt-5 grid grid-cols-5 gap-2 rounded-[1.35rem] border border-slate-200 bg-white/95 p-2 shadow-lg shadow-slate-950/5 backdrop-blur">
          <TabButton active={activeTab === "quick"} onClick={() => setActiveTab("quick")}>ขายเร็ว</TabButton>
          <TabButton active={activeTab === "bulk"} onClick={() => setActiveTab("bulk")}>LINE</TabButton>
          <TabButton active={activeTab === "entries"} onClick={() => setActiveTab("entries")}>รายการ</TabButton>
          <TabButton active={activeTab === "report"} onClick={() => setActiveTab("report")}>สรุป</TabButton>
          <TabButton active={activeTab === "calculate"} onClick={() => setActiveTab("calculate")}>ตรวจ</TabButton>
        </nav>

        {activeTab === "quick" ? <QuickPanel form={form} setForm={setForm} addEntry={addEntry} drawEntries={drawEntries} latestEntries={latestEntries} /> : null}
        {activeTab === "bulk" ? <BulkPanel bulkText={bulkText} setBulkText={setBulkText} bulkDefaultName={bulkDefaultName} setBulkDefaultName={setBulkDefaultName} prepareBulkData={prepareBulkData} drafts={bulkDrafts} updateDraft={updateDraft} confirmBulkData={confirmBulkData} /> : null}
        {activeTab === "entries" ? <section className="panel"><SectionTitle title="รายการในงวดนี้" description="ดูรายการล่าสุด ปรับจำนวนใบด้วยปุ่ม +/- และลบแบบยืนยัน" /><EntryTable entries={drawEntries} onDelete={deleteEntry} onQuantityChange={changeEntryQuantity} /></section> : null}
        {activeTab === "report" ? <ReportPanel report={report} totals={totals} copySummary={copySummary} shareSummary={shareSummary} exportCsv={exportCsv} /> : null}
        {activeTab === "calculate" ? <CalculatePanel result={result} setResult={setResult} calculateRound={calculateRound} /> : null}
      </section>
    </main>
  );
}

function QuickPanel({ form, setForm, addEntry, drawEntries, latestEntries }: { form: FormState; setForm: Dispatch<SetStateAction<FormState>>; addEntry: () => void; drawEntries: Entry[]; latestEntries: Entry[] }) {
  const lotteryNumber = normalizeNumber(form.lotteryNumber).slice(0, 6);
  const quantity = Number(form.quantity) || 0;
  const pricePerTicket = Number(form.pricePerTicket) || 0;
  const holderName = form.holderName.trim();
  const duplicate = drawEntries.find((entry) => sameHolder(entry.holderName, holderName) && entry.lotteryNumber === lotteryNumber && entry.pricePerTicket === pricePerTicket);
  const numberError = lotteryNumber ? validateLotteryNumber(lotteryNumber) : "รอเลข 6 หลัก";
  const canSave = Boolean(holderName && lotteryNumber.length === 6 && quantity > 0 && pricePerTicket > 0);

  function setPatch(patch: Partial<FormState>) {
    setForm((current) => ({ ...current, ...patch }));
  }

  function pressDigit(value: string) {
    setForm((current) => ({ ...current, lotteryNumber: normalizeNumber(`${current.lotteryNumber}${value}`).slice(0, 6) }));
  }

  return (
    <section className="mt-5 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="panel mt-0">
        <SectionTitle title="ขายเร็ว / บันทึกเร็ว" description="กรอกชื่อ → กดเลข 6 หลัก → เลือกจำนวนใบ → ตรวจ Preview → บันทึก" />

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Field label="ชื่อลูกค้า / เจ้าของรายการ">
            <input value={form.holderName} onChange={(event) => setPatch({ holderName: event.target.value })} placeholder="เช่น พี่บอย / โต๊ะ 3" className="field text-lg font-semibold" />
          </Field>
          <Field label="หมายเหตุ">
            <input value={form.note} onChange={(event) => setPatch({ note: event.target.value })} placeholder="เช่น จ่ายแล้ว / ฝากไว้ / ชุด 1" className="field" />
          </Field>
        </div>

        <div className="mt-5 rounded-[2rem] border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-slate-500">เลขสลาก 6 หลัก</p>
              <p className={`mt-1 font-mono text-4xl font-black tracking-[0.22em] ${lotteryNumber.length === 6 ? "text-[#0b2e59]" : "text-slate-400"}`}>{lotteryNumber.padEnd(6, "•")}</p>
            </div>
            <button onClick={() => setPatch({ lotteryNumber: "" })} className="secondary-button px-4 py-3 text-sm">ล้างเลข</button>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => <KeyButton key={digit} onClick={() => pressDigit(digit)}>{digit}</KeyButton>)}
            <KeyButton onClick={() => setForm((current) => ({ ...current, lotteryNumber: current.lotteryNumber.slice(0, -1) }))}>ลบ</KeyButton>
            <KeyButton onClick={() => pressDigit("0")}>0</KeyButton>
            <KeyButton onClick={() => setPatch({ lotteryNumber: "" })}>CLR</KeyButton>
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="rounded-[1.5rem] border border-slate-200 bg-white p-4">
            <p className="text-sm font-semibold text-slate-700">จำนวนใบ</p>
            <div className="mt-3 flex items-center gap-2">
              <button onClick={() => setPatch({ quantity: String(Math.max(1, quantity - 1)) })} className="step-button">−</button>
              <input value={form.quantity} onChange={(event) => setPatch({ quantity: event.target.value.replace(/[^0-9]/g, "") })} inputMode="numeric" className="field py-3 text-center text-2xl font-bold" />
              <button onClick={() => setPatch({ quantity: String(quantity + 1) })} className="step-button">+</button>
            </div>
            <div className="mt-3 grid grid-cols-4 gap-2">
              {quantityPresets.map((item) => <ChipButton key={item} active={quantity === item} onClick={() => setPatch({ quantity: String(item) })}>{item} ใบ</ChipButton>)}
            </div>
          </div>

          <div className="rounded-[1.5rem] border border-slate-200 bg-white p-4">
            <p className="text-sm font-semibold text-slate-700">ราคา/ใบ</p>
            <input value={form.pricePerTicket} onChange={(event) => setPatch({ pricePerTicket: event.target.value.replace(/[^0-9.]/g, "") })} inputMode="decimal" className="field mt-3 py-3 text-center text-2xl font-bold" />
            <div className="mt-3 grid grid-cols-3 gap-2">
              {pricePresets.map((item) => <ChipButton key={item} active={pricePerTicket === item} onClick={() => setPatch({ pricePerTicket: String(item) })}>{item}.-</ChipButton>)}
            </div>
          </div>
        </div>

        <div className={`mt-5 rounded-[1.5rem] border p-4 ${canSave ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-700">ตรวจทานก่อนบันทึก</p>
              <p className="mt-1 text-lg font-bold text-slate-950">{holderName || "ยังไม่ใส่ชื่อ"} • {lotteryNumber || "------"} • {quantity || 0} ใบ • {formatMoney(quantity * pricePerTicket)}</p>
              <p className="mt-1 text-sm text-slate-600">{duplicate ? `พบรายการเดิม ${duplicate.quantity} ใบ ระบบจะรวมใบให้` : numberError || "พร้อมบันทึก"}</p>
            </div>
            <button disabled={!canSave} onClick={addEntry} className="primary-button min-h-16 px-6 py-4 text-lg disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none">ตรวจแล้ว บันทึก</button>
          </div>
        </div>
      </div>

      <aside className="panel mt-0">
        <SectionTitle title="รายการล่าสุด" description="เห็นทันทีว่าบันทึกเข้าแล้ว ลดโอกาสจดซ้ำหรือหลุดรายการ" />
        <div className="mt-4 space-y-3">
          {latestEntries.length ? latestEntries.map((entry) => <RecentEntryCard key={entry.id} entry={entry} />) : <EmptyState text="ยังไม่มีรายการล่าสุด" />}
        </div>
      </aside>
    </section>
  );
}

function BulkPanel(props: { bulkText: string; setBulkText: (value: string) => void; bulkDefaultName: string; setBulkDefaultName: (value: string) => void; prepareBulkData: () => void; drafts: BulkDraft[]; updateDraft: (id: string, patch: Partial<BulkDraft>) => void; confirmBulkData: () => void }) {
  const validCount = props.drafts.filter((draft) => !draft.error).length;
  return (
    <section className="mt-5 space-y-4">
      <div className="panel">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <SectionTitle title="วางจาก LINE แล้วให้ระบบแยกให้" description="เหมาะกับลูกค้าส่งหลายรายการเข้ามา ช่วยลดเวลาพิมพ์ใหม่" />
          <button onClick={props.prepareBulkData} className="primary-button px-5 py-4">แยกรายการ</button>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-[0.8fr_1.2fr]">
          <Field label="ชื่อเริ่มต้น ถ้าบรรทัดไม่มีชื่อ">
            <input value={props.bulkDefaultName} onChange={(event) => props.setBulkDefaultName(event.target.value)} placeholder="เช่น ลูกค้า LINE" className="field" />
          </Field>
          <Field label="ตัวอย่างรูปแบบที่อ่านได้">
            <div className="rounded-2xl border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-slate-700">บอย 123456 1 ใบ<br />มด 654321 2 ใบ ราคา 80<br />เจน<br />778899 1 ใบ</div>
          </Field>
        </div>
        <Field label="วางข้อความชุดจาก LINE">
          <textarea value={props.bulkText} onChange={(event) => props.setBulkText(event.target.value)} placeholder={'ตัวอย่าง:\nบอย 123456 1 ใบ\nบอย 654321 2 ใบ\nมด 889900 1 ใบ ราคา 80'} className="field mt-2 min-h-56 resize-y leading-7" />
        </Field>
      </div>
      {props.drafts.length ? (
        <div className="panel">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <SectionTitle title="ตรวจสอบก่อนยืนยัน" description="แถวสีแดงจะไม่ถูกบันทึก แก้ให้ครบก่อนกดยืนยัน" />
            <button onClick={props.confirmBulkData} className="primary-button px-5 py-4">ยืนยัน {validCount} รายการ</button>
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

function ReportPanel({ report, totals, copySummary, shareSummary, exportCsv }: { report: ReturnType<typeof buildHolderReport>; totals: { totalCost: number; totalReward: number; totalNet: number; entries: number; tickets: number; holders: number }; copySummary: () => void; shareSummary: () => void; exportCsv: () => void }) {
  return (
    <section className="panel">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <SectionTitle title="สรุปยอดตามรายชื่อ" description="ออกแบบให้ส่งต่อหรือใช้ปิดงวดได้เร็ว" />
        <div className="flex flex-wrap gap-2">
          <button onClick={copySummary} className="secondary-button px-4 py-3 text-sm">คัดลอกสรุป</button>
          <button onClick={shareSummary} className="primary-button px-4 py-3 text-sm">แชร์ LINE</button>
          <button onClick={exportCsv} className="secondary-button px-4 py-3 text-sm">Export CSV</button>
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <InfoCard title="ยอดรวมทั้งงวด" text={formatMoney(totals.totalCost)} />
        <InfoCard title="จำนวนสลาก" text={`${totals.tickets} ใบ จาก ${totals.entries} รายการ`} />
        <InfoCard title="รางวัลรวม" text={formatMoney(totals.totalReward)} />
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

function EntryTable({ entries, onDelete, onQuantityChange }: { entries: Entry[]; onDelete: (id: string) => void; onQuantityChange: (id: string, delta: number) => void }) {
  if (!entries.length) return <EmptyState text="ยังไม่มีรายการในงวดนี้" />;
  return (
    <div className="mt-5">
      <div className="space-y-3 md:hidden">
        {entries.map((entry) => <MobileEntryCard key={entry.id} entry={entry} onDelete={onDelete} onQuantityChange={onQuantityChange} />)}
      </div>
      <div className="hidden overflow-x-auto md:block">
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
                <td className="border-y border-slate-200 px-3 py-3"><QuantityControl quantity={entry.quantity} onMinus={() => onQuantityChange(entry.id, -1)} onPlus={() => onQuantityChange(entry.id, 1)} /></td>
                <td className="border-y border-slate-200 px-3 py-3">{formatMoney(calculateEntryCost(entry))}</td>
                <td className="border-y border-slate-200 px-3 py-3"><StatusBadge entry={entry} /></td>
                <td className="border-y border-slate-200 px-3 py-3">{entry.matchedPrizes.map((prize) => prize.label).join(" + ") || "-"}<div className="text-xs text-slate-500">{formatMoney(entry.rewardAmount)}</div></td>
                <td className="border-y border-slate-200 px-3 py-3 text-slate-500">{entry.note || "-"}</td>
                <td className="rounded-r-2xl border-y border-r border-slate-200 px-3 py-3 text-right"><button onClick={() => onDelete(entry.id)} className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-100">ลบ</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MobileEntryCard({ entry, onDelete, onQuantityChange }: { entry: Entry; onDelete: (id: string) => void; onQuantityChange: (id: string, delta: number) => void }) {
  return (
    <div className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-700">{entry.holderName}</p>
          <p className="mt-1 font-mono text-3xl font-black tracking-[0.18em] text-[#0b2e59]">{entry.lotteryNumber}</p>
          <p className="mt-1 text-sm text-slate-500">{entry.note || "ไม่มีหมายเหตุ"}</p>
        </div>
        <StatusBadge entry={entry} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-2xl bg-slate-50 p-3"><p className="text-slate-500">ยอดรวม</p><p className="font-bold">{formatMoney(calculateEntryCost(entry))}</p></div>
        <div className="rounded-2xl bg-slate-50 p-3"><p className="text-slate-500">รางวัล</p><p className="font-bold">{formatMoney(entry.rewardAmount)}</p></div>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <QuantityControl quantity={entry.quantity} onMinus={() => onQuantityChange(entry.id, -1)} onPlus={() => onQuantityChange(entry.id, 1)} />
        <button onClick={() => onDelete(entry.id)} className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">ลบ</button>
      </div>
    </div>
  );
}

function RecentEntryCard({ entry }: { entry: Entry }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-700">{entry.holderName}</p>
          <p className="mt-1 font-mono text-2xl font-black tracking-[0.18em] text-[#0b2e59]">{entry.lotteryNumber}</p>
        </div>
        <div className="text-right text-sm">
          <p className="font-bold">{entry.quantity} ใบ</p>
          <p className="text-slate-500">{formatMoney(calculateEntryCost(entry))}</p>
        </div>
      </div>
    </div>
  );
}

function QuantityControl({ quantity, onMinus, onPlus }: { quantity: number; onMinus: () => void; onPlus: () => void }) {
  return (
    <div className="inline-flex items-center rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
      <button onClick={onMinus} className="h-10 w-10 rounded-xl bg-slate-100 text-lg font-black text-slate-700">−</button>
      <span className="min-w-12 px-3 text-center font-bold">{quantity}</span>
      <button onClick={onPlus} className="h-10 w-10 rounded-xl bg-[#0b2e59] text-lg font-black text-white">+</button>
    </div>
  );
}

function StatusBadge({ entry }: { entry: Entry }) {
  return entry.matchedPrizes.length
    ? <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">ถูกรางวัล</span>
    : <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500">รอตรวจ</span>;
}

function KeyButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return <button onClick={onClick} className="h-16 rounded-2xl border border-slate-200 bg-white text-2xl font-black text-slate-900 shadow-sm transition active:scale-95 active:bg-blue-50">{children}</button>;
}

function ChipButton({ active, onClick, children }: { active?: boolean; onClick: () => void; children: ReactNode }) {
  return <button onClick={onClick} className={`rounded-xl px-3 py-3 text-sm font-bold transition ${active ? "bg-[#0b2e59] text-white" : "bg-slate-100 text-slate-700 hover:bg-blue-50"}`}>{children}</button>;
}

function InfoCard({ title, text }: { title: string; text: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600"><p className="mb-1 font-semibold text-[#0b2e59]">{title}</p>{text}</div>;
}

function SectionTitle({ title, description }: { title: string; description: string }) {
  return <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#c9973d]">Field record mode</p><h2 className="mt-1 text-xl font-semibold text-[#0b2e59]">{title}</h2><p className="mt-1 text-sm text-slate-600">{description}</p></div>;
}

function StatCard({ title, value, highlight }: { title: string; value: string; highlight?: boolean }) {
  return <div className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm"><p className="text-sm text-slate-500">{title}</p><p className={`mt-2 text-2xl font-bold ${highlight ? "text-[#0b6b4f]" : "text-slate-900"}`}>{value}</p></div>;
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return <button onClick={onClick} className={`rounded-2xl px-2 py-3 text-xs font-semibold shadow-sm transition sm:px-4 sm:text-sm ${active ? "bg-[#0b2e59] text-white" : "border border-slate-200 bg-white text-slate-700 hover:bg-blue-50"}`}>{children}</button>;
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
