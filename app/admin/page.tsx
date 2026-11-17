"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Prompt } from "next/font/google";

const appFont = Prompt({ subsets: ["thai", "latin"], weight: ["400", "500", "600", "700", "800"] });

type Tab = "reviewing" | "approved" | "rejected";
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
  slip: { transRef: string; sendingBank: string } | null;
};
type Counts = Record<Tab, number>;
type Gate = "loading" | "ok" | "unauth" | "forbidden";

const POLL_MS = 10_000;
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

export default function AdminPage() {
  const [gate, setGate] = useState<Gate>("loading");
  const [tab, setTab] = useState<Tab>("reviewing");
  const [items, setItems] = useState<Item[]>([]);
  const [counts, setCounts] = useState<Counts>({ reviewing: 0, approved: 0, rejected: 0 });
  const [sound, setSound] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
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
        <main className="mx-auto max-w-md px-5 py-16 text-center">
          <h1 className="text-2xl font-bold">หน้าเจ้าหน้าที่</h1>
          <p className="mt-3 text-sm text-[#4d6652]">
            {gate === "loading" && "กำลังโหลด..."}
            {gate === "unauth" && "เข้าสู่ระบบด้วยบัญชี admin ที่หน้าแรกก่อน แล้วกลับมาหน้านี้"}
            {gate === "forbidden" && "บัญชีนี้ไม่มีสิทธิ์ admin"}
          </p>
          {gate !== "loading" && (
            <a href="/" className="mt-5 inline-block rounded-full bg-[#14402c] px-6 py-2.5 font-semibold text-white">
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
      <main className="mx-auto w-full max-w-3xl px-5 pb-16 pt-6">
        <header className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">ตรวจสลีป</h1>
            <p className="mt-1 text-xs text-[#4d6652]">เทียบ “ยอด” และ “Ref1” กับรายการเข้าบัญชีธนาคาร แล้วกดอนุมัติ</p>
          </div>
          <button
            type="button"
            onClick={() => setSound((s) => !s)}
            aria-pressed={sound}
            className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold ${sound ? "bg-[#d9f27a]" : "bg-white text-[#6b7f6f]"}`}
          >
            เสียงเตือน: {sound ? "เปิด" : "ปิด"}
          </button>
        </header>

        <div role="tablist" className="mt-5 grid grid-cols-3 rounded-2xl bg-[#e3ecd6] p-1">
          {tabs.map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => {
                setTab(id);
                setItems([]);
              }}
              className={`relative rounded-xl py-2.5 text-sm font-bold transition ${tab === id ? "bg-[#14402c] text-white" : "text-[#4d6652]"}`}
            >
              {label} ({counts[id]})
              {id === "reviewing" && counts.reviewing > 0 && tab !== "reviewing" && (
                <span className="absolute right-2 top-1.5 h-2.5 w-2.5 rounded-full bg-red-500" />
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
          <div className="mt-6 rounded-3xl border border-dashed border-[#b9cba6] bg-white/60 p-8 text-center text-[#4d6652]">
            {tab === "reviewing" ? "ไม่มีสลีปรอตรวจ" : "ยังไม่มีรายการ"}
          </div>
        ) : (
          <ul className="mt-5 space-y-4">
            {items.map((p) => (
              <li key={p.id} className="overflow-hidden rounded-3xl border border-[#e3ecd6] bg-white">
                <div className="flex gap-4 p-4">
                  <button
                    type="button"
                    onClick={() => setZoom(p.id)}
                    aria-label="ดูสลีปขนาดใหญ่"
                    className="h-40 w-28 shrink-0 overflow-hidden rounded-xl bg-[#e3ecd6]"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/admin/payments/${p.id}/slip-image`}
                      alt={`สลีป ${p.ref}`}
                      loading="lazy"
                      className="h-full w-full object-cover object-top"
                    />
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="text-3xl font-extrabold">{baht(p.amount)}</p>
                    <p className="mt-1 text-sm">
                      Ref1 <span className="font-mono font-bold">{p.ref}</span>
                    </p>
                    <p className="mt-2 truncate text-sm font-semibold">{p.name}</p>
                    <p className="text-xs text-[#4d6652]">{p.phone}</p>
                    <p className="mt-2 text-xs text-[#4d6652]">
                      เข้าซุ้ม {p.booth} · Lucky Draw {p.lucky}
                    </p>
                    <p className="mt-1 text-xs text-[#6b7f6f]">
                      ส่งสลีป {fmt(p.slipAt)}
                      {p.slip && ` · ${BANKS[p.slip.sendingBank] ?? `ธนาคาร ${p.slip.sendingBank}`}`}
                    </p>
                    {p.slip && <p className="mt-0.5 break-all font-mono text-[11px] text-[#6b7f6f]">{p.slip.transRef}</p>}
                    {p.rejectReason && <p className="mt-2 text-xs font-semibold text-red-600">ปฏิเสธ: {p.rejectReason}</p>}
                  </div>
                </div>

                {tab === "reviewing" && (
                  <div className="border-t border-[#e3ecd6] bg-[#f8fbf3] p-4">
                    {rejectId === p.id ? (
                      <div>
                        <div className="flex flex-wrap gap-2">
                          {REASONS.map((r) => (
                            <button
                              key={r}
                              type="button"
                              onClick={() => setReason(r)}
                              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${reason === r ? "bg-[#14402c] text-white" : "bg-white"}`}
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
                          className="mt-3 w-full rounded-xl border border-[#cfdcc0] bg-white px-4 py-3 text-sm outline-none focus:border-[#14402c] focus:ring-2 focus:ring-[#d9f27a]"
                        />
                        <div className="mt-3 flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setRejectId(null);
                              setReason("");
                            }}
                            className="flex-1 rounded-2xl border border-[#14402c] py-3 text-sm font-semibold"
                          >
                            ยกเลิก
                          </button>
                          <button
                            type="button"
                            disabled={busyId === p.id || reason.trim().length < 2}
                            onClick={() => act(p.id, { action: "reject", reason })}
                            className="flex-1 rounded-2xl bg-red-600 py-3 text-sm font-bold text-white disabled:opacity-50"
                          >
                            ปฏิเสธสลีป
                          </button>
                        </div>
                      </div>
                    ) : confirmId === p.id ? (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setConfirmId(null)}
                          className="flex-1 rounded-2xl border border-[#14402c] py-3 text-sm font-semibold"
                        >
                          ยกเลิก
                        </button>
                        <button
                          type="button"
                          disabled={busyId === p.id}
                          onClick={() => act(p.id, { action: "approve" })}
                          className="flex-1 rounded-2xl bg-[#14402c] py-3 text-sm font-bold text-white disabled:opacity-60"
                        >
                          {busyId === p.id ? "กำลังออกตั๋ว..." : `ยืนยัน อนุมัติ ${baht(p.amount)}`}
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setRejectId(p.id);
                            setConfirmId(null);
                          }}
                          className="flex-1 rounded-2xl border border-red-300 py-3 text-sm font-semibold text-red-600"
                        >
                          ปฏิเสธ
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmId(p.id);
                            setRejectId(null);
                          }}
                          className="flex-1 rounded-2xl bg-[#14402c] py-3 text-sm font-bold text-white"
                        >
                          อนุมัติ
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </main>

      {zoom && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="สลีปขนาดใหญ่"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setZoom(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/admin/payments/${zoom}/slip-image`}
            alt="สลีป"
            className="max-h-full max-w-full rounded-2xl bg-white object-contain"
          />
        </div>
      )}
    </div>
  );
}