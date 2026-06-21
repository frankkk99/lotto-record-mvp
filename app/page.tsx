"use client";

import { useEffect, useMemo, useState } from "react";
import type { Entry, NumberType, ResultInput } from "@/src/types";
import {
  buildCustomerReport,
  buildLineSummary,
  calculateEntries,
  defaultPayoutRate,
  formatMoney,
  normalizeNumber,
  numberTypeLabel,
  validateNumber
} from "@/src/lib/calculation";
import { loadFromStorage, saveToStorage } from "@/src/lib/storage";

type Tab = "add" | "report" | "calculate" | "entries";

const entriesKey = "lotto-record:entries";
const userKey = "lotto-record:user";
const today = new Date().toISOString().slice(0, 10);

const numberTypes: NumberType[] = ["2_digit", "3_digit", "6_digit"];

function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random()}`;
}

export default function HomePage() {
  const [userName, setUserName] = useState("");
  const [loginName, setLoginName] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("add");
  const [roundDate, setRoundDate] = useState(today);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [form, setForm] = useState({
    customerName: "",
    number: "",
    numberType: "2_digit" as NumberType,
    amount: "",
    payoutRate: String(defaultPayoutRate["2_digit"]),
    note: ""
  });
  const [result, setResult] = useState<ResultInput>({
    result2Digit: "",
    result3Digit: "",
    result6Digit: ""
  });
  const [message, setMessage] = useState("");

  useEffect(() => {
    setEntries(loadFromStorage<Entry[]>(entriesKey, []));
    setUserName(loadFromStorage<string>(userKey, ""));
  }, []);

  useEffect(() => {
    saveToStorage(entriesKey, entries);
  }, [entries]);

  const roundEntries = useMemo(
    () => entries.filter((entry) => entry.roundDate === roundDate),
    [entries, roundDate]
  );

  const report = useMemo(() => buildCustomerReport(roundEntries), [roundEntries]);

  const totals = useMemo(() => {
    const totalAmount = roundEntries.reduce((sum, item) => sum + item.amount, 0);
    const totalPrize = roundEntries.reduce((sum, item) => sum + item.prizeAmount, 0);
    return {
      totalAmount,
      totalPrize,
      net: totalPrize - totalAmount,
      customers: report.length,
      entries: roundEntries.length
    };
  }, [roundEntries, report.length]);

  function login() {
    const name = loginName.trim();
    if (!name) {
      setMessage("กรุณาใส่ชื่อผู้ใช้งาน");
      return;
    }
    setUserName(name);
    saveToStorage(userKey, name);
  }

  function updateNumberType(type: NumberType) {
    setForm((prev) => ({ ...prev, numberType: type, payoutRate: String(defaultPayoutRate[type]) }));
  }

  function addQuickAmount(value: number) {
    setForm((prev) => ({ ...prev, amount: String((Number(prev.amount) || 0) + value) }));
  }

  function addEntry() {
    const number = normalizeNumber(form.number);
    const amount = Number(form.amount);
    const payoutRate = Number(form.payoutRate);
    const error = validateNumber(number, form.numberType);

    if (!form.customerName.trim()) return setMessage("กรุณาใส่ชื่อ");
    if (error) return setMessage(error);
    if (!amount || amount <= 0) return setMessage("กรุณาใส่จำนวนเงินให้ถูกต้อง");
    if (!payoutRate || payoutRate <= 0) return setMessage("กรุณาใส่อัตราจ่ายให้ถูกต้อง");

    const newEntry: Entry = {
      id: makeId(),
      roundDate,
      customerName: form.customerName.trim(),
      number,
      numberType: form.numberType,
      amount,
      payoutRate,
      note: form.note.trim(),
      isWin: false,
      prizeAmount: 0,
      netAmount: -amount,
      createdAt: new Date().toISOString()
    };

    setEntries((prev) => [newEntry, ...prev]);
    setForm((prev) => ({ ...prev, number: "", amount: "", note: "" }));
    setMessage(`บันทึก ${newEntry.customerName} เลข ${newEntry.number} สำเร็จ`);
  }

  function deleteEntry(id: string) {
    setEntries((prev) => prev.filter((entry) => entry.id !== id));
  }

  function calculateRound() {
    const cleanResult: ResultInput = {
      result2Digit: normalizeNumber(result.result2Digit),
      result3Digit: normalizeNumber(result.result3Digit),
      result6Digit: normalizeNumber(result.result6Digit)
    };

    const updatedRoundEntries = calculateEntries(roundEntries, cleanResult);
    const updatedMap = new Map(updatedRoundEntries.map((item) => [item.id, item]));
    setEntries((prev) => prev.map((entry) => updatedMap.get(entry.id) ?? entry));
    setResult(cleanResult);
    setMessage("คำนวณผลเรียบร้อยแล้ว");
  }

  async function copySummary() {
    const text = buildLineSummary(roundDate, report, roundEntries);
    await navigator.clipboard.writeText(text);
    setMessage("คัดลอกสรุปแล้ว นำไปวางใน LINE ได้เลย");
  }

  async function shareLine() {
    const text = buildLineSummary(roundDate, report, roundEntries);
    if (navigator.share) {
      await navigator.share({ title: `สรุปงวด ${roundDate}`, text });
      return;
    }
    await navigator.clipboard.writeText(text);
    setMessage("เครื่องนี้ไม่รองรับ Share โดยตรง เลยคัดลอกข้อความให้แล้ว");
  }

  if (!userName) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#1f2937,#050608_55%)] px-5">
        <section className="w-full max-w-md rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/40 backdrop-blur">
          <p className="mb-3 text-sm font-medium text-emerald-300">Lotto Record MVP</p>
          <h1 className="text-3xl font-semibold tracking-tight text-white">ระบบบันทึกและคำนวณรายงวด</h1>
          <p className="mt-4 text-sm leading-6 text-slate-400">
            ใช้สำหรับบันทึกชื่อ เลข จำนวนเงิน หมายเหตุ ดู Report คำนวณผล และแชร์สรุปออก LINE เท่านั้น
          </p>
          <div className="mt-6 space-y-3">
            <input className="field" placeholder="ชื่อผู้ใช้งาน" value={loginName} onChange={(e) => setLoginName(e.target.value)} />
            <button onClick={login} className="w-full rounded-2xl bg-emerald-400 px-5 py-4 font-semibold text-black">
              เข้าระบบ
            </button>
          </div>
          <p className="mt-5 rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4 text-xs leading-5 text-amber-100">
            ระบบนี้เป็นเครื่องมือบันทึกและคำนวณข้อมูลเท่านั้น ไม่มีระบบรับซื้อ-ขายสลาก ไม่มีระบบรับแทง ไม่มีฝากถอน และไม่มีระบบจ่ายรางวัล
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#050608] px-4 py-6 text-white">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex flex-col gap-4 rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm text-emerald-300">Lotto Record MVP</p>
            <h1 className="mt-1 text-2xl font-semibold">สวัสดี, {userName}</h1>
            <p className="mt-1 text-sm text-slate-400">เลือกงวด เพิ่มรายการ คำนวณผล และแชร์สรุปได้จากหน้านี้</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input type="date" className="field sm:w-auto" value={roundDate} onChange={(e) => setRoundDate(e.target.value)} />
            <button onClick={() => { setUserName(""); saveToStorage(userKey, ""); }} className="rounded-2xl border border-white/10 px-4 py-3 text-sm text-slate-300">
              ออกจากระบบ
            </button>
          </div>
        </header>

        <section className="mb-6 grid gap-3 md:grid-cols-5">
          <Stat title="ยอดรวม" value={formatMoney(totals.totalAmount)} />
          <Stat title="ยอดถูก" value={formatMoney(totals.totalPrize)} />
          <Stat title="สุทธิ" value={`${totals.net >= 0 ? "+" : ""}${formatMoney(totals.net)}`} highlight />
          <Stat title="รายการ" value={`${totals.entries}`} />
          <Stat title="รายชื่อ" value={`${totals.customers}`} />
        </section>

        <nav className="mb-6 grid grid-cols-2 gap-2 md:grid-cols-4">
          <TabButton active={activeTab === "add"} onClick={() => setActiveTab("add")}>+ เพิ่มรายการ</TabButton>
          <TabButton active={activeTab === "report"} onClick={() => setActiveTab("report")}>Report</TabButton>
          <TabButton active={activeTab === "calculate"} onClick={() => setActiveTab("calculate")}>คำนวณผล</TabButton>
          <TabButton active={activeTab === "entries"} onClick={() => setActiveTab("entries")}>รายการทั้งหมด</TabButton>
        </nav>

        {message && <div className="mb-5 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-100">{message}</div>}

        {activeTab === "add" && (
          <section className="grid gap-5 lg:grid-cols-[1fr_0.8fr]">
            <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5">
              <h2 className="text-xl font-semibold">เพิ่มรายการเร็ว</h2>
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                <input className="field" placeholder="ชื่อ" value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} />
                <input className="field" inputMode="numeric" placeholder="เลข" value={form.number} onChange={(e) => setForm({ ...form, number: normalizeNumber(e.target.value) })} />
                <select className="field" value={form.numberType} onChange={(e) => updateNumberType(e.target.value as NumberType)}>
                  {numberTypes.map((type) => <option key={type} value={type}>{numberTypeLabel[type]}</option>)}
                </select>
                <input className="field" inputMode="decimal" placeholder="จำนวนเงิน" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                <input className="field" inputMode="decimal" placeholder="อัตราจ่าย" value={form.payoutRate} onChange={(e) => setForm({ ...form, payoutRate: e.target.value })} />
                <input className="field" placeholder="หมายเหตุ" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {[10, 20, 50, 100].map((amount) => (
                  <button key={amount} onClick={() => addQuickAmount(amount)} className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-300">+{amount}</button>
                ))}
              </div>
              <button onClick={addEntry} className="mt-5 w-full rounded-2xl bg-emerald-400 px-5 py-4 font-semibold text-black">บันทึกแล้วเพิ่มต่อ</button>
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5">
              <h2 className="text-xl font-semibold">รายการล่าสุด</h2>
              <div className="mt-4 space-y-3">
                {roundEntries.slice(0, 8).map((entry) => (
                  <EntryCard key={entry.id} entry={entry} onDelete={() => deleteEntry(entry.id)} />
                ))}
                {roundEntries.length === 0 && <p className="text-sm text-slate-500">ยังไม่มีรายการในงวดนี้</p>}
              </div>
            </div>
          </section>
        )}

        {activeTab === "report" && (
          <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <h2 className="text-xl font-semibold">Report ตามรายชื่อ</h2>
              <div className="flex gap-2">
                <button onClick={copySummary} className="rounded-2xl border border-white/10 px-4 py-3 text-sm">Copy Summary</button>
                <button onClick={shareLine} className="rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-black">Share LINE</button>
              </div>
            </div>
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="text-slate-400">
                  <tr className="border-b border-white/10">
                    <th className="py-3">ชื่อ</th>
                    <th>รายการ</th>
                    <th>ยอดรวม</th>
                    <th>ยอดถูก</th>
                    <th>ครั้งที่ถูก</th>
                    <th>สุทธิ</th>
                  </tr>
                </thead>
                <tbody>
                  {report.map((item) => (
                    <tr key={item.customerName} className="border-b border-white/5">
                      <td className="py-4 font-medium">{item.customerName}</td>
                      <td>{item.totalEntries}</td>
                      <td>{formatMoney(item.totalAmount)}</td>
                      <td>{formatMoney(item.totalPrize)}</td>
                      <td>{item.wins}</td>
                      <td className={item.netAmount >= 0 ? "text-emerald-300" : "text-rose-300"}>{item.netAmount >= 0 ? "+" : ""}{formatMoney(item.netAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {report.length === 0 && <p className="py-8 text-center text-sm text-slate-500">ยังไม่มี Report</p>}
            </div>
          </section>
        )}

        {activeTab === "calculate" && (
          <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5">
            <h2 className="text-xl font-semibold">คำนวณผลหลังหวยออก</h2>
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <input className="field" inputMode="numeric" maxLength={2} placeholder="เลขท้าย 2 ตัว" value={result.result2Digit} onChange={(e) => setResult({ ...result, result2Digit: normalizeNumber(e.target.value) })} />
              <input className="field" inputMode="numeric" maxLength={3} placeholder="เลข 3 ตัว" value={result.result3Digit} onChange={(e) => setResult({ ...result, result3Digit: normalizeNumber(e.target.value) })} />
              <input className="field" inputMode="numeric" maxLength={6} placeholder="เลข 6 หลัก" value={result.result6Digit} onChange={(e) => setResult({ ...result, result6Digit: normalizeNumber(e.target.value) })} />
            </div>
            <button onClick={calculateRound} className="mt-5 rounded-2xl bg-emerald-400 px-6 py-4 font-semibold text-black">คำนวณผลทั้งงวด</button>
          </section>
        )}

        {activeTab === "entries" && (
          <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5">
            <h2 className="text-xl font-semibold">รายการทั้งหมดในงวดนี้</h2>
            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {roundEntries.map((entry) => <EntryCard key={entry.id} entry={entry} onDelete={() => deleteEntry(entry.id)} />)}
              {roundEntries.length === 0 && <p className="text-sm text-slate-500">ยังไม่มีรายการ</p>}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

function Stat({ title, value, highlight = false }: { title: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4">
      <p className="text-xs text-slate-500">{title}</p>
      <p className={`mt-2 text-xl font-semibold ${highlight ? "text-emerald-300" : "text-white"}`}>{value}</p>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`rounded-2xl px-4 py-3 text-sm font-medium ${active ? "bg-white text-black" : "border border-white/10 text-slate-300"}`}>
      {children}
    </button>
  );
}

function EntryCard({ entry, onDelete }: { entry: Entry; onDelete: () => void }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{entry.customerName}</p>
          <p className="mt-1 text-sm text-slate-400">{numberTypeLabel[entry.numberType]} · เลข {entry.number}</p>
        </div>
        <button onClick={onDelete} className="text-xs text-rose-300">ลบ</button>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
        <div><p className="text-slate-500">เงิน</p><p>{formatMoney(entry.amount)}</p></div>
        <div><p className="text-slate-500">ถูก</p><p>{formatMoney(entry.prizeAmount)}</p></div>
        <div><p className="text-slate-500">สุทธิ</p><p className={entry.netAmount >= 0 ? "text-emerald-300" : "text-rose-300"}>{entry.netAmount >= 0 ? "+" : ""}{formatMoney(entry.netAmount)}</p></div>
      </div>
      {entry.note && <p className="mt-3 rounded-xl bg-white/5 px-3 py-2 text-xs text-slate-400">{entry.note}</p>}
    </div>
  );
}
