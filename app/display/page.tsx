"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { Prompt } from "next/font/google";

const appFont = Prompt({ subsets: ["thai", "latin"], weight: ["400", "500", "600", "700", "800"] });

const SHOW_MAX = 240; // จำนวนตั๋วสูงสุดที่วาดในโหล (ตัวเลขรวมนับจริงทั้งหมด)
const JAR_COLS = 7; // จำนวนตั๋วต่อ 1 ชั้นในโหล
const JAR_ROW_MAX = 7; // ระยะห่างชั้นสูงสุด (% ของความสูงโหล) ตอนตั๋วน้อย
const JAR_FILL = 90; // ตอนตั๋วเยอะ กองจะสูงถึงกี่ % ของโหล
const TICKET_W = 13; // ความกว้างตั๋ว (% ของความกว้างโหล)
const POLL_MS = 2000; // ดึงข้อมูลสดทุกกี่ ms
const TOAST_MS = 3500; // ป้าย "+N ใบใหม่" แสดงกี่ ms
const CURSOR_HIDE_MS = 5000; // ไม่ขยับเมาส์กี่ ms แล้วซ่อนเมาส์
const LOGO_SRC = "/img/com.png";

type PoolTicket = { code: string; empCode: string };
type Gate = "loading" | "ok" | "locked";

// ค่าสุ่มคงที่ต่อรหัสตั๋ว (ตั๋วแต่ละใบอยู่ตำแหน่งเดิมทุกครั้งที่วาดใหม่)
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
const r01 = (s: string, k: number) => (hash(`${s}:${k}`) % 1000) / 1000;

function ticketStyle(code: string, idx: number, n: number) {
  const rows = Math.max(1, Math.ceil(n / JAR_COLS));
  const row = Math.floor(idx / JAR_COLS);
  const inRow = row === rows - 1 ? n - row * JAR_COLS : JAR_COLS;
  const pos = idx - row * JAR_COLS;
  const rowH = rows > 1 ? Math.min(JAR_ROW_MAX, JAR_FILL / (rows - 1)) : JAR_ROW_MAX;
  const colW = (100 - TICKET_W) / inRow;
  return {
    left: Math.min(100 - TICKET_W, Math.max(0, (pos + 0.5) * colW + (r01(code, 1) - 0.5) * colW * 0.9)),
    bottom: Math.max(-2, -1 + row * rowH + (r01(code, 2) - 0.5) * rowH * 1.3),
    rot: -50 + r01(code, 3) * 100,
    delay: r01(code, 4) * 1.6,
    dur: 0.9 + r01(code, 5) * 0.7,
  };
}

export default function DisplayPage() {
  const [gate, setGate] = useState<Gate>("loading");
  const [note, setNote] = useState("");
  const [pw, setPw] = useState("");
  const [pwErr, setPwErr] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pool, setPool] = useState<PoolTicket[]>([]);
  const [total, setTotal] = useState(0);
  const [toast, setToast] = useState<{ n: number; id: number } | null>(null);

  const initialRef = useRef<Set<string> | null>(null); // ตั๋วที่อยู่ในโหลตอนเปิดหน้า (หล่นตามจังหวะ)
  const knownRef = useRef<Set<string>>(new Set()); // ตั๋วที่เคยเห็นแล้ว (ใช้หาตั๋วใหม่)
  const toastN = useRef(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((n: number) => {
    toastN.current = (toastTimer.current ? toastN.current : 0) + n;
    setToast({ n: toastN.current, id: Date.now() });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => {
      toastTimer.current = null;
      toastN.current = 0;
      setToast(null);
    }, TOAST_MS);
  }, []);

  const fetchPool = useCallback(async () => {
    try {
      const res = await fetch("/api/spin", { cache: "no-store" });
      if (res.status === 401 || res.status === 403) return setGate("locked");
      if (!res.ok) return setNote("โหลดข้อมูลไม่ได้ กำลังลองใหม่...");
      const data = (await res.json()) as { total: number; pool: PoolTicket[] };
      const codes = data.pool.map((p) => p.code);
      if (initialRef.current === null) {
        initialRef.current = new Set(codes);
        knownRef.current = new Set(codes);
      } else {
        const fresh = codes.filter((c) => !knownRef.current.has(c));
        if (fresh.length > 0) {
          fresh.forEach((c) => knownRef.current.add(c));
          showToast(fresh.length);
        }
      }
      setGate("ok");
      setNote("");
      setPool(data.pool);
      setTotal(data.total);
    } catch {
      setNote("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กำลังลองใหม่...");
    }
  }, [showToast]);

  useEffect(() => {
    fetchPool();
  }, [fetchPool]);

  // โหลสด: ดึงทุก POLL_MS
  useEffect(() => {
    if (gate !== "ok") return;
    const t = setInterval(fetchPool, POLL_MS);
    return () => clearInterval(t);
  }, [gate, fetchPool]);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  // กด F สลับเต็มหน้าจอ
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "KeyF") return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      e.preventDefault();
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
      else void document.documentElement.requestFullscreen().catch(() => {});
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ไม่ขยับเมาส์ CURSOR_HIDE_MS แล้วซ่อนเมาส์
  useEffect(() => {
    const cls = "pd-nocursor";
    let t: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      document.body.classList.remove(cls);
      if (t) clearTimeout(t);
      t = setTimeout(() => document.body.classList.add(cls), CURSOR_HIDE_MS);
    };
    arm();
    window.addEventListener("mousemove", arm);
    window.addEventListener("mousedown", arm);
    return () => {
      window.removeEventListener("mousemove", arm);
      window.removeEventListener("mousedown", arm);
      if (t) clearTimeout(t);
      document.body.classList.remove(cls);
    };
  }, []);

  async function unlock(e: FormEvent) {
    e.preventDefault();
    if (!pw || pwBusy) return;
    setPwBusy(true);
    setPwErr("");
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPwErr(data.error ?? "เข้าสู่ระบบไม่สำเร็จ");
      } else {
        setPw("");
        await fetchPool();
      }
    } catch {
      setPwErr("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้");
    }
    setPwBusy(false);
  }

  // แสดงตั๋วล่าสุด SHOW_MAX ใบ (ตั๋วที่เพิ่งเข้าโหลอยู่ท้ายรายการ)
  const shown = useMemo(() => pool.slice(-SHOW_MAX), [pool]);

  const shell = `min-h-screen overflow-x-clip bg-[#0b0a12] text-white [color-scheme:dark] ${appFont.className}`;

  if (gate === "locked") {
    return (
      <div className={shell}>
        <main className="mx-auto max-w-md px-5 py-16 text-center">
          <h1 className="text-2xl font-bold">Lucky Draw Display</h1>
          <p className="mt-3 text-sm text-white/60">กรอกรหัสผ่าน admin เพื่อเข้าใช้งาน</p>
          <form onSubmit={unlock} className="mt-5">
            <input
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="รหัสผ่าน admin"
              autoComplete="current-password"
              autoFocus
              maxLength={200}
              className="min-h-12 w-full rounded-xl border border-white/15 bg-[#2a2a2a] px-4 py-3 text-base text-white outline-none focus:border-white/60 focus:ring-2 focus:ring-white/20"
            />
            {pwErr && (
              <p role="alert" className="mt-3 text-sm font-medium text-red-500">
                {pwErr}
              </p>
            )}
            <button
              type="submit"
              disabled={pwBusy || pw.length === 0}
              className="mt-4 min-h-12 w-full rounded-2xl bg-[#e50914] py-3 text-sm font-bold text-white disabled:opacity-60"
            >
              {pwBusy ? "กำลังตรวจสอบ..." : "เข้าสู่หน้าจอแสดงผล"}
            </button>
          </form>
        </main>
      </div>
    );
  }

  if (gate !== "ok") {
    return (
      <div className={shell}>
        <main className="mx-auto max-w-md px-5 py-16 text-center">
          <h1 className="text-2xl font-bold">Lucky Draw Display</h1>
          <p className="mt-3 text-sm text-white/60">{note || "กำลังโหลด..."}</p>
        </main>
      </div>
    );
  }

  return (
    <div className={`${shell} flex h-screen items-center justify-center overflow-hidden`}>
      <style>{`
        @keyframes pdDrop {
          0% { transform: translateY(-100cqw) rotate(calc(var(--rot) - 140deg)); opacity: 0; }
          12% { opacity: 1; }
          100% { transform: translateY(0) rotate(var(--rot)); opacity: 1; }
        }
        @keyframes pdNewGlow {
          0% { filter: brightness(1.9) drop-shadow(0 0 1.6cqw #ffd54a); }
          100% { filter: brightness(1) drop-shadow(0 0 0 transparent); }
        }
        @keyframes pdPop {
          0% { transform: scale(1.35); }
          60% { transform: scale(0.95); }
          100% { transform: scale(1); }
        }
        @keyframes pdToast {
          0% { transform: translateY(-40%) scale(0.7); opacity: 0; }
          60% { transform: translateY(0) scale(1.08); opacity: 1; }
          100% { transform: translateY(0) scale(1); opacity: 1; }
        }
        @keyframes pdLive {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.25; }
        }

        .pd-nocursor,
        .pd-nocursor * { cursor: none !important; }

        .pd-stage {
          background:
            radial-gradient(circle at 12% 14%, rgba(255, 179, 71, 0.35) 0, transparent 22%),
            radial-gradient(circle at 90% 30%, rgba(255, 122, 69, 0.3) 0, transparent 26%),
            radial-gradient(circle at 8% 72%, rgba(255, 210, 122, 0.25) 0, transparent 24%),
            radial-gradient(circle at 88% 88%, rgba(255, 90, 90, 0.25) 0, transparent 22%),
            radial-gradient(ellipse at 50% 0%, #3d1c14 0%, #1d0e13 45%, #0b0a12 100%);
        }
        .pd-gold {
          background: #ffc83d;
          box-shadow: inset 0 0.5cqw 0 rgba(255, 255, 255, 0.5), inset 0 -0.5cqw 0 rgba(178, 125, 0, 0.55), 0 1cqw 0 #b27d00;
        }
        .pd-title {
          color: #ffe27a;
          text-shadow: -0.05em 0 0 #e0243c;
        }
        .pd-count-plate {
          background: #2a0a12;
          box-shadow: inset 0 1cqw 0 rgba(0, 0, 0, 0.45);
        }
        .pd-num {
          color: #ffe27a;
          text-shadow: 0 0.6cqw 0 #b27d00, 0 1.2cqw 0 #6e4a00, 0 0 4cqw rgba(255, 200, 60, 0.45);
        }
        .pd-jar {
          background: rgba(255, 255, 255, 0.06);
          box-shadow: 0 1.4cqw 0 rgba(255, 255, 255, 0.14);
        }
        .pd-ticket {
          box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.25), 0 3px 0 #3a0a10;
        }
        .pd-pop { animation: pdPop 0.5s cubic-bezier(0.3, 1.5, 0.5, 1) both; }
        .pd-toast { animation: pdToast 0.5s cubic-bezier(0.3, 1.5, 0.5, 1) both; }
        .pd-live { animation: pdLive 1.4s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .pd-pop, .pd-toast, .pd-live { animation: none; }
        }
      `}</style>

      {/* เวที 9:16 แนวตั้ง: พอดีจอทั้งแนวตั้งและแนวนอน (จอแนวตั้งเต็มจอ / จอแนวนอนมีขอบข้าง) */}
      <div
        className="pd-stage relative flex flex-col items-center overflow-hidden"
        style={{ width: "min(100vw, 56.25vh)", height: "min(100vh, 177.78vw)", containerType: "size" }}
      >
        <h1 className="sr-only">Lucky Draw Display</h1>

        {/* หัวป้าย */}
        <header className="flex flex-none flex-col items-center" style={{ paddingTop: "4cqw" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO_SRC} alt="" draggable={false} className="block w-auto object-contain" style={{ height: "15cqw" }} />
          <p
            className="pd-title font-extrabold"
            style={{ fontSize: "11cqw", letterSpacing: "0.1em", lineHeight: 1.1, marginTop: "1.5cqw" }}
          >
            LUCKY DRAW
          </p>
        </header>

        {/* จำนวนตั๋วทั้งหมด */}
        <section aria-live="polite" aria-label="จำนวนตั๋วทั้งหมด" className="relative flex-none" style={{ width: "80cqw", marginTop: "3cqw" }}>
          <div className="pd-gold" style={{ borderRadius: "6cqw", padding: "1cqw" }}>
            <div className="pd-count-plate text-center" style={{ borderRadius: "5cqw", padding: "2.5cqw 2cqw 3cqw" }}>
              <p className="font-bold text-[#ffd54a]" style={{ fontSize: "4cqw", letterSpacing: "0.2em" }}>
                <span aria-hidden className="pd-live text-green-400" style={{ marginRight: "1.5cqw" }}>
                  ●
                </span>
                ตั๋วทั้งหมดในโหล
              </p>
              <p className="pd-num font-extrabold leading-none" style={{ fontSize: "22cqw", margin: "1cqw 0" }}>
                <span key={total} className="pd-pop inline-block">
                  {total.toLocaleString("th-TH")}
                </span>
              </p>
              <p className="font-bold text-[#ffd54a]" style={{ fontSize: "4.5cqw", letterSpacing: "0.3em" }}>
                ใบ
              </p>
            </div>
          </div>

          {/* ป้าย +N ใบใหม่ เมื่อมีคนซื้อ */}
          {toast && (
            <div
              key={toast.id}
              className="pd-toast pointer-events-none absolute left-1/2 z-30 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#58cc02] font-extrabold text-white"
              style={{
                top: "-2cqw",
                fontSize: "5cqw",
                padding: "1cqw 5cqw",
                border: "0.6cqw solid #fff6c9",
                boxShadow: "0 1cqw 0 #3a8f00, 0 0 5cqw rgba(125, 255, 107, 0.6)",
              }}
            >
              +{toast.n} ใบใหม่
            </div>
          )}
        </section>

        {/* โหลตั๋ว */}
        <section
          aria-label="โหลตั๋ว Lucky Draw"
          className="flex min-h-0 w-full flex-1 flex-col items-center"
          style={{ padding: "3cqw 6cqw 5cqw" }}
        >
          <div className="pd-gold flex-none" style={{ height: "3cqw", width: "30cqw", borderRadius: "2cqw 2cqw 0 0" }} />
          <div
            className="pd-jar relative min-h-0 w-full flex-1 overflow-hidden"
            style={{ borderRadius: "3cqw 3cqw 12cqw 12cqw", border: "1cqw solid rgba(255,255,255,0.3)" }}
          >
            {shown.map((t, idx) => {
              const s = ticketStyle(t.code, idx, shown.length);
              const isNew = initialRef.current ? !initialRef.current.has(t.code) : false;
              const delay = isNew ? 0 : s.delay; // ตั๋วใหม่หล่นทันที / ตั๋วตอนเปิดหน้าหล่นเรียงตามจังหวะ
              const anim = `pdDrop ${s.dur}s cubic-bezier(.3,1.2,.5,1) ${delay}s both${
                isNew ? ", pdNewGlow 1.8s ease-out 0s both" : ""
              }`;
              return (
                <div
                  key={t.code}
                  className="pd-ticket absolute flex flex-col items-center justify-center border border-dashed border-white/50 bg-[#6b1d24] font-bold leading-tight text-white"
                  style={
                    {
                      left: `${s.left}%`,
                      bottom: `${s.bottom}%`,
                      width: `${TICKET_W}%`,
                      aspectRatio: "56 / 32",
                      borderRadius: "0.8cqw",
                      fontSize: "1.7cqw",
                      "--rot": `${s.rot}deg`,
                      animation: anim,
                      transition: "left 0.6s ease, bottom 0.6s ease",
                    } as CSSProperties
                  }
                >
                  <span style={{ letterSpacing: "0.15em" }}>LUCKY</span>
                  <span className="font-mono opacity-80" style={{ fontSize: "1.5cqw" }}>
                    {t.empCode}
                  </span>
                </div>
              );
            })}

            {total === 0 && (
              <p className="absolute inset-0 flex items-center justify-center text-white/50" style={{ fontSize: "5cqw" }}>
                โหลว่างเปล่า
              </p>
            )}

            {/* แสงสะท้อนบนแก้วโหล */}
            <span
              aria-hidden
              className="pointer-events-none absolute rounded-full bg-white/15 blur-[1px]"
              style={{ left: "3cqw", top: "4cqw", bottom: "14cqw", width: "2cqw" }}
            />
            <span
              aria-hidden
              className="pointer-events-none absolute rounded-full bg-white/10"
              style={{ left: "8cqw", top: "10cqw", bottom: "20cqw", width: "0.8cqw" }}
            />
          </div>
        </section>

        {note && (
          <p
            role="alert"
            className="absolute inset-x-0 bottom-0 text-center font-medium text-red-400"
            style={{ fontSize: "2.4cqw", padding: "1cqw" }}
          >
            {note}
          </p>
        )}
      </div>
    </div>
  );
}