"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Prompt } from "next/font/google";

const appFont = Prompt({ subsets: ["thai", "latin"], weight: ["400", "500", "600", "700", "800"] });

type Tab = "reviewing" | "approved" | "rejected";
type SlipCheck = {
  amount: number | null;
  amountOk: boolean;
  receiverOk: boolean;
  timeOk: boolean;
  transferAt: string | null;
  ok: boolean;
  rawText?: string;
  error?: string | null;
};
type Item = {
  id: string;
  ref: string;
  name: string;
  phone: string;
  amount: number;
  status: string;
  createdAt: string;
  slipAt: string | null;
  booth: number;
  lucky: number;
  rejectReason: string | null;
  slip: { transRef: string; sendingBank: string; check: SlipCheck | null } | null;
};
type Counts = Record<Tab, number>;
type Gate = "loading" | "ok" | "unauth" | "forbidden";

const POLL_MS = 10_000;
const RECEIVER_LABEL = "บริษัท คอมเซเว่น จำกัด (มหาชน)";
const REASONS = ["ยอดเงินไม่ตรง", "ไม่พบรายการเข้าบัญชี", "สลีปไม่ชัด/อ่านไม่ได้", "สลีปไม่ใช่ของรายการนี้"];
const BANKS: Record<string, string> = {
  "002": "กรุงเทพ",
  "004": "กสิกรไทย",
  "006": "กรุงไทย",
  "011": "ทีทีบี",
  "014": "ไทยพาณิชย์",
  "025": "กรุงศรี",
  "030": "ออมสิน",
  "034": "ธ.ก.ส.",
  "069": "เกียรตินาคินภัทร",
};

const baht = (n: number) => `฿${n.toLocaleString("th-TH")}`;
const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "-";

function beep() {
  try {
    const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new C();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc.start();
    osc.stop(ctx.currentTime + 0.6);
  } catch {
    /* เบราว์เซอร์ไม่อนุญาตเสียง ข้ามได้ */
  }
}

// แถวในรายละเอียด (ตอนกดขยาย)
function Row({ ok, label, value }: { ok: boolean; label: string; value: string }) {
  return (
    <li className="flex items-start gap-2 text-xs sm:text-sm">
      <span
        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-extrabold sm:h-5 sm:w-5 sm:text-xs ${
          ok ? "bg-green-600 text-white" : "bg-yellow-400 text-[#14402c]"
        }`}
      >
        {ok ? "✓" : "!"}
      </span>
      <span className="min-w-0 break-words">
        <span className="font-semibold">{label}</span> <span className="text-[#4d6652]">{value}</span>
      </span>
    </li>
  );
}

// เครื่องหมายย่อด้านขวาของรายการ: ok = ✓ เขียว / false = ! เหลือง / null = ยังไม่ได้ตรวจ (เทา)
function Mark({ ok, label }: { ok: boolean | null; label: string }) {
  const cls =
    ok === null ? "bg-[#e3ecd6] text-[#6b7f6f]" : ok ? "bg-green-600 text-white" : "bg-yellow-400 text-[#14402c]";
  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-extrabold sm:h-7 sm:w-7 sm:text-sm ${cls}`}
      >
        {ok === null ? "?" : ok ? "✓" : "!"}
      </span>
      <span className="text-[11px] font-semibold leading-none text-[#4d6652] sm:text-xs">{label}</span>
    </div>
  );
}

export default function AdminPage() {
  const [gate, setGate] = useState<Gate>("loading");
  const [tab, setTab] = useState<Tab>("reviewing");
  const [items, setItems] = useState<Item[]>([]);
  const [counts, setCounts] = useState<Counts>({ reviewing: 0, approved: 0, rejected: 0 });
  const [sound, setSound] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [zoom, setZoom] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const prevReviewing = useRef<number | null>(null);
  const soundRef = useRef(true);
  const tabRef = useRef<Tab>("reviewing");
  soundRef.current = sound;
  tabRef.current = tab;

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/payments?status=${tabRef.current}`, { cache: "no-store" });
      if (res.status === 401) return setGate("unauth");
      if (res.status === 403) return setGate("forbidden");
      if (!res.ok) return setNote("โหลดข้อมูลไม่ได้ กำลังลองใหม่");
      const data = (await res.json()) as { counts: Counts; payments: Item[] };
      setGate("ok");
      setNote("");
      setItems(data.payments);
      setCounts(data.counts);
      if (prevReviewing.current !== null && data.counts.reviewing > prevReviewing.current && soundRef.current) beep();
      prevReviewing.current = data.counts.reviewing;
    } catch {
      setNote("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กำลังลองใหม่");
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load, tab]);

  useEffect(() => {
    document.title = counts.reviewing > 0 ? `(${counts.reviewing}) รอตรวจสลีป · Admin` : "Admin · Payday Park";
  }, [counts.reviewing]);

  // กด Esc ปิดรูปสลีปขนาดใหญ่ (คอมพิวเตอร์)
  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setZoom(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoom]);

  async function act(id: string, body: { action: "approve" } | { action: "reject"; reason: string }) {
    setBusyId(id);
    setNote("");
    try {
      const res = await fetch(`/api/admin/payments/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setNote(data.error ?? "ทำรายการไม่สำเร็จ");
    } catch {
      setNote("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้");
    }
    setBusyId(null);
    setConfirmId(null);
    setRejectId(null);
    setReason("");
    load();
  }

  const shell = `min-h-screen bg-[#f1f7e9] text-[#14402c] ${appFont.className}`;

  if (gate !== "ok") {
    return (
      <div className={shell}>
        <main className="mx-auto max-w-md px-4 py-16 text-center sm:px-5">
          <h1 className="text-2xl font-bold">หน้าเจ้าหน้าที่</h1>
          <p className="mt-3 text-sm text-[#4d6652]">
            {gate === "loading" && "กำลังโหลด..."}
            {gate === "unauth" && "เข้าสู่ระบบด้วยบัญชี admin ที่หน้าแรกก่อน แล้วกลับมาหน้านี้"}
            {gate === "forbidden" && "บัญชีนี้ไม่มีสิทธิ์ admin"}
          </p>
          {gate !== "loading" && (
            <a href="/" className="mt-5 inline-block rounded-full bg-[#14402c] px-6 py-3 font-semibold text-white">
              ไปหน้าแรก
            </a>
          )}
        </main>
      </div>
    );
  }

  const tabs: [Tab, string][] = [
    ["reviewing", "รอตรวจ"],
    ["approved", "อนุมัติแล้ว"],
    ["rejected", "ปฏิเสธ"],
  ];

  return (
    <div className={shell}>
      <main className="mx-auto w-full max-w-md px-4 pb-16 pt-5 sm:max-w-3xl sm:px-6 sm:pt-8">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold sm:text-3xl">ตรวจสลีป</h1>
            <p className="mt-1 text-xs leading-relaxed text-[#4d6652] sm:text-sm">
              ระบบอ่านสลีปให้เบื้องต้น ✓ = ตรงกับรายการ / ! = ต้องตรวจเอง ดูเครื่องหมายด้านขวาของแต่ละรายการ กดที่รายการเพื่อดูรายละเอียด เทียบ “ยอด” และ “Ref1” กับรายการเข้าบัญชีก่อนกดอนุมัติ
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSound((s) => !s)}
            aria-pressed={sound}
            className={`min-h-11 shrink-0 self-start rounded-full px-5 py-2.5 text-xs font-bold sm:text-sm ${sound ? "bg-[#d9f27a]" : "bg-white text-[#6b7f6f]"}`}
          >
            เสียงเตือน: {sound ? "เปิด" : "ปิด"}
          </button>
        </header>

        <div role="tablist" className="mt-5 grid grid-cols-3 rounded-2xl bg-[#e3ecd6] p-1 sm:mt-6">
          {tabs.map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => {
                setTab(id);
                setItems([]);
                setDetailId(null);
              }}
              className={`relative min-h-11 rounded-xl px-1 py-2.5 text-xs font-bold transition sm:text-sm ${tab === id ? "bg-[#14402c] text-white" : "text-[#4d6652]"}`}
            >
              {label} ({counts[id]})
              {id === "reviewing" && counts.reviewing > 0 && tab !== "reviewing" && (
                <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-red-500" />
              )}
            </button>
          ))}
        </div>

        {note && (
          <p role="alert" className="mt-3 text-sm font-medium text-red-600">
            {note}
          </p>
        )}

        {items.length === 0 ? (
          <div className="mt-6 rounded-3xl border border-dashed border-[#b9cba6] bg-white/60 p-8 text-center text-sm text-[#4d6652] sm:text-base">
            {tab === "reviewing" ? "ไม่มีสลีปรอตรวจ" : "ยังไม่มีรายการ"}
          </div>
        ) : (
          <ul className="mt-5 space-y-4 sm:mt-6">
            {items.map((p) => {
              const check = p.slip?.check ?? null;
              const passed = check?.ok === true;
              const open = detailId === p.id;
              const toggle = () => p.slip && setDetailId(open ? null : p.id);
              return (
                <li key={p.id} className="min-w-0 overflow-hidden rounded-3xl border border-[#e3ecd6] bg-white">
                  <div className="flex gap-3 p-3 sm:gap-4 sm:p-4">
                    <button
                      type="button"
                      onClick={() => setZoom(p.id)}
                      aria-label="ดูสลีปขนาดใหญ่"
                      className="h-32 w-20 shrink-0 overflow-hidden rounded-xl bg-[#e3ecd6] sm:h-44 sm:w-32"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/admin/payments/${p.id}/slip-image`}
                        alt={`สลีป ${p.ref}`}
                        loading="lazy"
                        className="h-full w-full object-cover object-top"
                      />
                    </button>

                    {/* ข้อมูลออเดอร์ + เครื่องหมายตรวจสอบด้านขวา กดตรงนี้เพื่อเปิดรายละเอียด */}
                    <div
                      role={p.slip ? "button" : undefined}
                      tabIndex={p.slip ? 0 : undefined}
                      aria-expanded={p.slip ? open : undefined}
                      aria-label={p.slip ? (passed ? "ระบบตรวจสลีปผ่าน กดดูรายละเอียด" : "ต้องตรวจสลีปเอง กดดูรายละเอียด") : undefined}
                      onClick={toggle}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggle();
                        }
                      }}
                      className={`flex min-w-0 flex-1 gap-3 rounded-xl ${p.slip ? "cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[#14402c]" : ""}`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-2xl font-extrabold sm:text-3xl">{baht(p.amount)}</p>
                        <p className="mt-1 text-sm">
                          Ref1 <span className="break-all font-mono font-bold">{p.ref}</span>
                        </p>
                        <p className="mt-2 truncate text-sm font-semibold">{p.name}</p>
                        <p className="text-xs text-[#4d6652] sm:text-sm">{p.phone}</p>
                        <p className="mt-2 text-xs text-[#4d6652] sm:text-sm">
                          เข้าซุ้ม {p.booth} · Lucky Draw {p.lucky}
                        </p>
                        <p className="mt-1 text-xs text-[#6b7f6f] sm:text-sm">
                          ส่งสลีป {fmt(p.slipAt)}
                          {p.slip && ` · ${BANKS[p.slip.sendingBank] ?? `ธนาคาร ${p.slip.sendingBank}`}`}
                        </p>
                        {p.slip && <p className="mt-0.5 break-all font-mono text-[11px] text-[#6b7f6f]">{p.slip.transRef}</p>}
                        {p.rejectReason && <p className="mt-2 text-xs font-semibold text-red-600 sm:text-sm">ปฏิเสธ: {p.rejectReason}</p>}
                        {p.slip && (
                          <p className="mt-2 text-[11px] font-semibold text-[#4d6652] sm:text-xs">
                            {open ? "▲ ซ่อนรายละเอียด" : "▼ ดูผลตรวจสลีป"}
                          </p>
                        )}
                      </div>

                      {p.slip && (
                        <div
                          aria-hidden="true"
                          className="flex shrink-0 flex-col justify-center gap-2.5 border-l border-[#e3ecd6] pl-3 sm:gap-3 sm:pl-4"
                        >
                          <Mark ok={check ? check.amountOk : null} label="ยอด" />
                          <Mark ok={check ? check.receiverOk : null} label="ผู้รับ" />
                          <Mark ok={check ? check.timeOk : null} label="เวลา" />
                        </div>
                      )}
                    </div>
                  </div>

                  {open && p.slip && (
                    <div className="border-t border-[#e3ecd6] bg-[#fffbe6] px-3 py-3 sm:px-4">
                      {check ? (
                        <ul className="space-y-2">
                          <Row
                            ok={check.amountOk}
                            label="ยอดเงิน"
                            value={
                              check.amount === null
                                ? `อ่านยอดจากสลีปไม่ได้ (ต้องเป็น ${baht(p.amount)})`
                                : check.amountOk
                                  ? `${baht(check.amount)} ตรงกับรายการ`
                                  : `สลีป ${baht(check.amount)} ≠ รายการ ${baht(p.amount)}`
                            }
                          />
                          <Row
                            ok={check.receiverOk}
                            label="ผู้รับ"
                            value={
                              check.receiverOk
                                ? `ตรงกับ ${RECEIVER_LABEL}`
                                : `ไม่ตรงหรืออ่านไม่ได้ (ต้องเป็น ${RECEIVER_LABEL})`
                            }
                          />
                          <Row
                            ok={check.timeOk}
                            label="วันเวลาโอน"
                            value={
                              check.transferAt
                                ? `${fmt(check.transferAt)}${check.timeOk ? "" : " (ก่อนสร้างรายการ หรืออ่านผิด)"}`
                                : "อ่านวันเวลาจากสลีปไม่ได้"
                            }
                          />
                          <Row ok label="เลขอ้างอิง" value="ไม่ซ้ำกับสลีปอื่น" />
                        </ul>
                      ) : (
                        <p className="text-xs text-[#4d6652] sm:text-sm">สลีปนี้ยังไม่ได้ตรวจอัตโนมัติ กรุณาตรวจเอง</p>
                      )}
                      {check && (check.error || check.rawText !== undefined) && (
                        <details className="mt-3 text-[11px] text-[#6b7f6f] sm:text-xs">
                          <summary className="min-h-8 cursor-pointer py-1 font-semibold">ข้อความที่ระบบอ่านได้ (ไว้ตรวจปัญหา)</summary>
                          {check.error && <p className="mt-1 break-words font-semibold text-red-600">error: {check.error}</p>}
                          <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-white p-2">
                            {check.rawText || "(ว่าง)"}
                          </pre>
                        </details>
                      )}
                      <p className="mt-2 text-[11px] text-[#6b7f6f] sm:text-xs">
                        ระบบอ่านจากรูปด้วย OCR อาจคลาดเคลื่อนได้ ควรเทียบกับรายการเข้าบัญชีทุกครั้ง
                      </p>
                    </div>
                  )}

                  {tab === "reviewing" && (
                    <div className="border-t border-[#e3ecd6] bg-[#f8fbf3] p-3 sm:p-4">
                      {rejectId === p.id ? (
                        <div>
                          <div className="flex flex-wrap gap-2">
                            {REASONS.map((r) => (
                              <button
                                key={r}
                                type="button"
                                onClick={() => setReason(r)}
                                className={`min-h-10 rounded-full px-3.5 py-2 text-xs font-semibold sm:text-sm ${reason === r ? "bg-[#14402c] text-white" : "bg-white"}`}
                              >
                                {r}
                              </button>
                            ))}
                          </div>
                          <input
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="เหตุผล (ผู้ซื้อจะเห็นข้อความนี้)"
                            maxLength={200}
                            className="mt-3 min-h-12 w-full rounded-xl border border-[#cfdcc0] bg-white px-4 py-3 text-base outline-none focus:border-[#14402c] focus:ring-2 focus:ring-[#d9f27a] sm:text-sm"
                          />
                          <div className="mt-3 flex gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setRejectId(null);
                                setReason("");
                              }}
                              className="min-h-12 flex-1 rounded-2xl border border-[#14402c] py-3 text-sm font-semibold"
                            >
                              ยกเลิก
                            </button>
                            <button
                              type="button"
                              disabled={busyId === p.id || reason.trim().length < 2}
                              onClick={() => act(p.id, { action: "reject", reason })}
                              className="min-h-12 flex-1 rounded-2xl bg-red-600 py-3 text-sm font-bold text-white disabled:opacity-50"
                            >
                              ปฏิเสธสลีป
                            </button>
                          </div>
                        </div>
                      ) : confirmId === p.id ? (
                        <div>
                          {!passed && (
                            <p className="mb-2 text-xs font-semibold text-yellow-700 sm:text-sm">
                              ! ระบบยังไม่ยืนยันสลีปนี้ ตรวจกับรายการเข้าบัญชีแล้วใช่ไหม
                            </p>
                          )}
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => setConfirmId(null)}
                              className="min-h-12 flex-1 rounded-2xl border border-[#14402c] py-3 text-sm font-semibold"
                            >
                              ยกเลิก
                            </button>
                            <button
                              type="button"
                              disabled={busyId === p.id}
                              onClick={() => act(p.id, { action: "approve" })}
                              className="min-h-12 flex-[1.4] rounded-2xl bg-[#14402c] px-2 py-3 text-sm font-bold text-white disabled:opacity-60"
                            >
                              {busyId === p.id ? "กำลังออกตั๋ว..." : `ยืนยัน อนุมัติ ${baht(p.amount)}`}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setRejectId(p.id);
                              setConfirmId(null);
                            }}
                            className="min-h-12 flex-1 rounded-2xl border border-red-300 py-3 text-sm font-semibold text-red-600"
                          >
                            ปฏิเสธ
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setConfirmId(p.id);
                              setRejectId(null);
                            }}
                            className="min-h-12 flex-1 rounded-2xl bg-[#14402c] py-3 text-sm font-bold text-white"
                          >
                            อนุมัติ
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </main>

      {zoom && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="สลีปขนาดใหญ่"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 sm:p-6"
          onClick={() => setZoom(null)}
        >
          <button
            type="button"
            onClick={() => setZoom(null)}
            aria-label="ปิด"
            className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full bg-white text-xl font-bold text-[#14402c] shadow sm:right-6 sm:top-6"
          >
            ×
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/admin/payments/${zoom}/slip-image`}
            alt="สลีป"
            className="max-h-[92vh] max-w-full rounded-2xl bg-white object-contain"
          />
        </div>
      )}
    </div>
  );
}