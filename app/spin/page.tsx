"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Prompt } from "next/font/google";

const appFont = Prompt({ subsets: ["thai", "latin"], weight: ["400", "500", "600", "700", "800"] });

// ต้องตรงกับ EMP_CODE_LENGTH ใน lib/tickets.ts
const EMP_LEN = 7;
const SHOW_MAX = 60; // จำนวนตั๋วสูงสุดที่วาดหล่นในโหล (ตัวเลข "เหลือ ... ใบ" นับจริงทั้งหมด)
const FIRST_STOP_MS = 1200; // เวลาก่อนหยุดหลักแรก (นับจากได้ผลจากเซิร์ฟเวอร์)
const STEP_MS = 1000; // ระยะห่างระหว่างการหยุดแต่ละหลัก
const POLL_MS = 3000; // รีเฟรชโหลสด: ตั๋วที่ admin เพิ่งอนุมัติจะหล่นเข้าโหลเอง
const BULBS = 20; // จำนวนหลอดไฟประดับตู้
const STRIP = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9]; // แถบตัวเลขที่เลื่อนวนในแต่ละหลัก

type PoolTicket = { code: string; empCode: string };
type Winner = { code: string; empCode: string; name: string; wonAt: string | null };
type Gate = "loading" | "ok" | "unauth" | "forbidden" | "locked";

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "-";

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

function ticketStyle(code: string) {
  return {
    left: 3 + r01(code, 1) * 80,
    bottom: r01(code, 2) * 48,
    rot: -45 + r01(code, 3) * 90,
    delay: r01(code, 4) * 1.6,
    dur: 0.9 + r01(code, 5) * 0.7,
  };
}

export default function SpinPage() {
  const [gate, setGate] = useState<Gate>("loading");
  const [note, setNote] = useState("");
  const [pool, setPool] = useState<PoolTicket[]>([]);
  const [total, setTotal] = useState(0);
  const [winners, setWinners] = useState<Winner[]>([]);
  const [digits, setDigits] = useState<string[]>(Array(EMP_LEN).fill("-"));
  const [stopped, setStopped] = useState<boolean[]>(Array(EMP_LEN).fill(false));
  const [spinning, setSpinning] = useState(false);
  const [winner, setWinner] = useState<Winner | null>(null);

  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fwRaf = useRef(0);

  // รีเฟรชสด: ไม่เขียนทับตอนกำลังสุ่ม และทิ้งผลที่ขอไว้ก่อนเริ่ม/จบการสุ่ม (กันตั๋วที่ถูกตัดแล้วกลับมาในโหล)
  const spinningRef = useRef(false);
  const seqRef = useRef(0);
  // ตั๋วที่อยู่ในโหลตอนเปิดหน้า: หล่นตามจังหวะสุ่ม / ตั๋วที่เพิ่งเข้ามาทีหลังหล่นทันที
  const initialRef = useRef<Set<string> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/spin", { cache: "no-store" });
      if (res.status === 401) return setGate("unauth");
      if (res.status === 403) {
        // เป็น admin แต่ยังไม่กรอกรหัส admin (หรือหมดอายุ 12 ชั่วโมง)
        const st = (await fetch("/api/admin/login", { cache: "no-store" })
          .then((r) => r.json())
          .catch(() => null)) as { isAdmin?: boolean; unlocked?: boolean } | null;
        return setGate(st?.isAdmin && !st.unlocked ? "locked" : "forbidden");
      }
      if (!res.ok) return setNote("โหลดข้อมูลไม่ได้ ลองใหม่อีกครั้ง");
      const data = (await res.json()) as { total: number; pool: PoolTicket[]; winners: Winner[] };
      setGate("ok");
      setNote("");
      if (initialRef.current === null) initialRef.current = new Set(data.pool.map((p) => p.code));
      setPool(data.pool);
      setTotal(data.total);
      setWinners(data.winners);
    } catch {
      setNote("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง");
    }
  }, []);

  const refresh = useCallback(async () => {
    if (spinningRef.current) return;
    const seq = seqRef.current;
    try {
      const res = await fetch("/api/spin", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { total: number; pool: PoolTicket[]; winners: Winner[] };
      if (spinningRef.current || seq !== seqRef.current) return;
      setPool(data.pool);
      setTotal(data.total);
      setWinners(data.winners);
    } catch {
      /* เน็ตหลุดชั่วคราว รอบถัดไปลองใหม่เอง */
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // โหลสด: ดึงทุก POLL_MS วินาที
  useEffect(() => {
    if (gate !== "ok") return;
    const t = setInterval(refresh, POLL_MS);
    return () => clearInterval(t);
  }, [gate, refresh]);

  // ล้าง timer / animation ตอนออกจากหน้า
  useEffect(() => {
    const timers = timersRef;
    return () => {
      timers.current.forEach(clearTimeout);
      cancelAnimationFrame(fwRaf.current);
    };
  }, []);

  /* ---------- พลุ ---------- */
  const fireworks = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    cancelAnimationFrame(fwRaf.current);

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = window.innerWidth;
    const H = window.innerHeight;
    cv.width = W * dpr;
    cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    type P = { x: number; y: number; vx: number; vy: number; life: number; color: string };
    const ps: P[] = [];
    const colors = ["#ffd54a", "#ff4d4d", "#4dd2ff", "#7dff6b", "#ff7ad9", "#ffffff", "#ffb300"];
    const end = performance.now() + 6000;
    let nextBurst = 0;

    const burst = () => {
      const cx = W * (0.15 + Math.random() * 0.7);
      const cy = H * (0.12 + Math.random() * 0.4);
      const color = colors[Math.floor(Math.random() * colors.length)];
      const n = 70 + Math.floor(Math.random() * 40);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 1.5 + Math.random() * 4.5;
        ps.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, color });
      }
    };

    const frame = (t: number) => {
      // ค่อย ๆ จางของเดิมให้เกิดรอยหาง
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = "lighter";

      if (t < end && t >= nextBurst) {
        burst();
        nextBurst = t + 280 + Math.random() * 350;
      }
      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.045;
        p.vx *= 0.99;
        p.life -= 0.011;
        if (p.life <= 0) {
          ps.splice(i, 1);
          continue;
        }
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      if (t < end || ps.length > 0) fwRaf.current = requestAnimationFrame(frame);
      else {
        ctx.globalCompositeOperation = "source-over";
        ctx.clearRect(0, 0, W, H);
      }
    };
    fwRaf.current = requestAnimationFrame(frame);
  }, []);

  /* ---------- สุ่ม ---------- */
  function finish(w: Winner, remaining: number) {
    spinningRef.current = false;
    seqRef.current += 1;
    setSpinning(false);
    setWinner(w);
    setPool((p) => p.filter((t) => t.code !== w.code)); // ตัดตั๋วที่ถูกออกจากโหล
    setTotal(remaining);
    setWinners((ws) => [w, ...ws]);
    fireworks();
  }

  async function spin() {
    if (spinning || total === 0) return;
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    cancelAnimationFrame(fwRaf.current);
    canvasRef.current?.getContext("2d")?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

    setNote("");
    setWinner(null);
    spinningRef.current = true;
    seqRef.current += 1;
    setSpinning(true);
    setStopped(Array(EMP_LEN).fill(false));

    // เซิร์ฟเวอร์เลือกผู้ถูกรางวัลและตัดตั๋วออกจากโหลก่อน ฝั่งหน้าเว็บแค่เล่นแอนิเมชันให้ตรงผล
    const res = await fetch("/api/spin", { method: "POST" }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};

    if (!res || !res.ok) {
      spinningRef.current = false;
      seqRef.current += 1;
      setSpinning(false);
      setDigits(Array(EMP_LEN).fill("-"));
      setNote(data.error ?? "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง");
      if (res?.status === 401) setGate("unauth");
      if (res?.status === 403) load();
      if (res?.status === 404) load();
      return;
    }

    const w = data.winner as Winner;
    const remaining = Number(data.remaining ?? 0);

    // หยุดทีละหลักจากซ้ายไปขวา
    for (let i = 0; i < EMP_LEN; i++) {
      timersRef.current.push(
        setTimeout(
          () => {
            setDigits((prev) => {
              const n = [...prev];
              n[i] = w.empCode[i] ?? "0";
              return n;
            });
            setStopped((prev) => {
              const n = [...prev];
              n[i] = true;
              return n;
            });
            if (i === EMP_LEN - 1) finish(w, remaining);
          },
          FIRST_STOP_MS + i * STEP_MS,
        ),
      );
    }
  }

  // แสดงตั๋วล่าสุด SHOW_MAX ใบ (ตั๋วที่เพิ่งเข้าโหลอยู่ท้ายรายการ จึงเห็นตอนหล่นลงมา)
  const shown = useMemo(() => pool.slice(-SHOW_MAX), [pool]);

  const shell = `min-h-screen overflow-x-clip bg-[#141414] text-white [color-scheme:dark] ${appFont.className}`;

  if (gate !== "ok") {
    return (
      <div className={shell}>
        <main className="mx-auto max-w-md px-5 py-16 text-center">
          <h1 className="text-2xl font-bold">Lucky Draw</h1>
          <p className="mt-3 text-sm text-white/60">
            {gate === "loading" && (note || "กำลังโหลด...")}
            {gate === "unauth" && "เข้าสู่ระบบด้วยบัญชี admin ที่หน้าแรกก่อน แล้วกลับมาหน้านี้"}
            {gate === "forbidden" && "บัญชีนี้ไม่มีสิทธิ์ admin"}
            {gate === "locked" && "ไปกรอกรหัสผ่าน admin ที่หน้า /admin ก่อน แล้วกลับมาหน้านี้"}
          </p>
          {gate === "locked" && (
            <a href="/admin" className="mt-5 inline-block rounded-full bg-[#e50914] px-6 py-3 font-semibold text-white">
              ไปหน้า admin
            </a>
          )}
          {(gate === "unauth" || gate === "forbidden") && (
            <a href="/" className="mt-5 inline-block rounded-full bg-[#e50914] px-6 py-3 font-semibold text-white">
              ไปหน้าแรก
            </a>
          )}
        </main>
      </div>
    );
  }

  const idle = !spinning && !winner;
  const spinLabel = spinning ? "กำลังสุ่ม..." : winner ? "สุ่มรอบถัดไป" : "เริ่มสุ่ม";

  return (
    <div className={shell}>
      <style>{`
        @keyframes pdDrop {
          0% { transform: translateY(-460px) rotate(calc(var(--rot) - 140deg)); opacity: 0; }
          12% { opacity: 1; }
          100% { transform: translateY(0) rotate(var(--rot)); opacity: 1; }
        }
        @keyframes pdShake {
          0%, 100% { transform: translate(0, 0) rotate(0deg); }
          20% { transform: translate(-3px, 1px) rotate(-0.6deg); }
          40% { transform: translate(3px, -1px) rotate(0.6deg); }
          60% { transform: translate(-2px, -1px) rotate(-0.4deg); }
          80% { transform: translate(2px, 1px) rotate(0.4deg); }
        }
        @keyframes pdStrip {
          0% { transform: translateY(0); }
          100% { transform: translateY(-50%); }
        }
        @keyframes pdPop {
          0% { transform: scale(1.5); }
          60% { transform: scale(0.92); }
          100% { transform: scale(1); }
        }
        @keyframes pdGold {
          0% { background-position: 0% 50%; }
          100% { background-position: 200% 50%; }
        }
        @keyframes pdGlow {
          0%, 100% { box-shadow: 0 0 18px 2px rgba(255, 200, 40, 0.55), 0 0 40px 6px rgba(255, 170, 0, 0.3); }
          50% { box-shadow: 0 0 30px 6px rgba(255, 225, 90, 0.95), 0 0 70px 14px rgba(255, 190, 0, 0.55); }
        }
        @keyframes pdLive {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.25; }
        }
        @keyframes pdBulb {
          0%, 100% { background: #ffe27a; box-shadow: 0 0 8px 2px rgba(255, 220, 90, 0.9); }
          50% { background: #5a3a00; box-shadow: none; }
        }
        @keyframes pdJackpot {
          0%, 100% { filter: brightness(1); }
          50% { filter: brightness(1.35); }
        }
        .pd-strip { animation: pdStrip 0.3s linear infinite; filter: blur(1.4px); will-change: transform; }
        .pd-reel-stop { animation: pdPop 0.45s ease-out both; }
        .pd-shake { animation: pdShake 0.3s linear infinite; }
        .pd-live { animation: pdLive 1.4s ease-in-out infinite; }
        .pd-bulb { animation: pdBulb 1s steps(1) infinite; }
        .pd-bulb-fast { animation-duration: 0.28s; }
        .pd-jackpot { animation: pdJackpot 0.5s ease-in-out 6; }
        .pd-gold-frame {
          background: linear-gradient(110deg, #b8860b, #ffe27a, #fff6c9, #ffd54a, #b8860b, #ffe27a, #b8860b);
          background-size: 200% 100%;
          animation: pdGold 2.2s linear infinite, pdGlow 1.4s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .pd-strip, .pd-shake, .pd-bulb, .pd-jackpot { animation: none; }
        }
      `}</style>

      <canvas ref={canvasRef} aria-hidden className="pointer-events-none fixed inset-0 z-50 h-full w-full" />

      <main className="mx-auto w-full max-w-5xl px-3 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-4 sm:px-5 sm:pt-6">
        <header className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-extrabold sm:text-3xl md:text-4xl">Lucky Draw</h1>
            <p className="mt-0.5 text-xs text-white/60 sm:text-sm">สุ่มรหัสพนักงานจากตั๋วในโหล</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={load}
              disabled={spinning}
              className="min-h-11 rounded-full border border-white/25 px-3 py-2 text-xs font-semibold disabled:opacity-40 sm:px-4 sm:text-sm"
            >
              รีเฟรชโหล
            </button>
            <a
              href="/admin"
              className="flex min-h-11 items-center rounded-full bg-white/10 px-3 py-2 text-xs font-semibold sm:px-4 sm:text-sm"
            >
              หน้า admin
            </a>
          </div>
        </header>

        {note && (
          <p role="alert" className="mt-4 text-sm font-medium text-red-500">
            {note}
          </p>
        )}

        <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] lg:items-start">
          {/* ===== คอลัมน์ซ้าย: ตู้ slot + ผู้ถูกรางวัล ===== */}
          <div className="min-w-0">
            {/* ===== ตู้ slot machine ===== */}
            <section
              aria-label="ตู้สุ่มรหัสพนักงาน"
              className={`relative rounded-[1.75rem] border-4 border-[#ffd54a] bg-gradient-to-b from-[#d2191f] via-[#9a1016] to-[#4a070a] p-3 shadow-[0_20px_60px_rgba(0,0,0,0.6)] sm:rounded-[2.25rem] sm:p-5 ${
                spinning ? "pd-shake" : ""
              } ${winner && !spinning ? "pd-jackpot" : ""}`}
            >
              {/* หลอดไฟประดับ */}
              <div aria-hidden className="mb-3 flex justify-between px-1 sm:mb-4">
                {Array.from({ length: BULBS }).map((_, i) => (
                  <span
                    key={i}
                    className={`pd-bulb h-2 w-2 rounded-full sm:h-2.5 sm:w-2.5 ${spinning ? "pd-bulb-fast" : ""}`}
                    style={{ animationDelay: i % 2 ? "0s" : "-0.5s" }}
                  />
                ))}
              </div>

              {/* ป้ายชื่อตู้ */}
              <div className="mx-auto w-fit rounded-xl border-2 border-[#ffd54a] bg-gradient-to-b from-[#ffe27a] to-[#d89b00] px-5 py-1.5 shadow-inner sm:px-8 sm:py-2">
                <p className="text-center text-base font-extrabold tracking-[0.2em] text-[#5a1a00] sm:text-xl">
                  LUCKY SLOT
                </p>
              </div>

              {/* หน้าต่างวงล้อ + คันโยก */}
              <div className="mt-3 flex items-center gap-2 sm:mt-4 sm:gap-4">
                <div className="relative min-w-0 flex-1 rounded-2xl border-4 border-[#ffd54a]/80 bg-black p-1.5 shadow-[inset_0_0_18px_rgba(0,0,0,0.9)] sm:p-2.5">
                  <p className="pb-1 text-center text-[10px] font-bold tracking-widest text-[#ffd54a] sm:text-xs">
                    รหัสพนักงาน
                  </p>
                  <div className="relative">
                    <div className="flex gap-1 sm:gap-2" aria-live="polite">
                      {digits.map((d, i) => {
                        const rolling = spinning && !stopped[i];
                        return (
                          <div
                            key={i}
                            className={`relative min-w-0 flex-1 overflow-hidden rounded-md bg-gradient-to-b from-[#bdbdbd] via-white to-[#bdbdbd] font-extrabold text-black sm:rounded-lg ${
                              stopped[i] ? "ring-2 ring-[#ffd54a] sm:ring-4" : ""
                            }`}
                            style={{ aspectRatio: "3 / 4.2", fontSize: "clamp(1.5rem, 7.6vw, 4.2rem)" }}
                          >
                            {rolling ? (
                              <div
                                className="pd-strip absolute inset-x-0 top-0 flex flex-col"
                                style={{
                                  height: `${STRIP.length * 100}%`,
                                  animationDuration: `${0.3 + i * 0.03}s`,
                                  animationDelay: `-${i * 0.07}s`,
                                }}
                              >
                                {STRIP.map((n, k) => (
                                  <span
                                    key={k}
                                    className="flex items-center justify-center leading-none"
                                    style={{ height: `${100 / STRIP.length}%` }}
                                  >
                                    {n}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span
                                className={`absolute inset-0 flex items-center justify-center leading-none ${
                                  stopped[i] ? "pd-reel-stop" : ""
                                } ${d === "-" ? "text-black/25" : ""}`}
                              >
                                {d}
                              </span>
                            )}
                            {/* เงาโค้งแบบวงล้อ */}
                            <span
                              aria-hidden
                              className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/45 via-transparent to-black/45"
                            />
                          </div>
                        );
                      })}
                    </div>
                    {/* เส้นเพย์ไลน์ */}
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-[#ff2a2a]/80 shadow-[0_0_8px_2px_rgba(255,40,40,0.7)]"
                    />
                    <span
                      aria-hidden
                      className="pointer-events-none absolute -left-1.5 top-1/2 -translate-y-1/2 border-y-[6px] border-l-[8px] border-y-transparent border-l-[#ff2a2a] sm:-left-2"
                    />
                    <span
                      aria-hidden
                      className="pointer-events-none absolute -right-1.5 top-1/2 -translate-y-1/2 border-y-[6px] border-r-[8px] border-y-transparent border-r-[#ff2a2a] sm:-right-2"
                    />
                  </div>
                </div>

                {/* คันโยก (แสดงตั้งแต่จอ md ขึ้นไป) */}
                <button
                  type="button"
                  onClick={spin}
                  disabled={spinning || total === 0}
                  aria-label="ดึงคันโยกเพื่อสุ่ม"
                  className="hidden h-36 w-12 shrink-0 flex-col items-center justify-start disabled:cursor-not-allowed disabled:opacity-60 md:flex"
                >
                  <span
                    className="h-9 w-9 rounded-full bg-gradient-to-br from-[#ff6b6b] to-[#b00010] shadow-[0_4px_10px_rgba(0,0,0,0.5)] transition-transform duration-300"
                    style={{ transform: spinning ? "translateY(78px)" : "translateY(0)" }}
                  />
                  <span
                    className="-mt-1 w-2.5 rounded-full bg-gradient-to-r from-[#8a8a8a] via-[#e6e6e6] to-[#8a8a8a] transition-all duration-300"
                    style={{ height: spinning ? 6 : 84, transform: spinning ? "translateY(78px)" : "translateY(0)" }}
                  />
                  <span className="mt-auto h-5 w-9 rounded-md bg-[#2a0a0e] ring-2 ring-[#ffd54a]/70" />
                </button>
              </div>

              {/* แผงควบคุมด้านล่าง */}
              <div className="mt-3 flex items-stretch gap-2 sm:mt-5 sm:gap-3">
                <div className="flex min-w-[6.5rem] flex-col items-center justify-center rounded-xl border-2 border-[#ffd54a]/60 bg-black px-3 py-2 sm:min-w-[8rem]">
                  <span className="text-[10px] font-bold tracking-widest text-[#ffd54a]/80">เหลือ</span>
                  <span className="font-mono text-2xl font-extrabold leading-none text-[#ff3b3b] sm:text-3xl">
                    <span aria-hidden className="pd-live mr-1 text-base text-green-400">
                      ●
                    </span>
                    {total}
                  </span>
                  <span className="text-[10px] font-bold tracking-widest text-[#ffd54a]/80">ใบ</span>
                </div>
                <button
                  type="button"
                  onClick={spin}
                  disabled={spinning || total === 0}
                  className="min-h-14 flex-1 rounded-2xl border-b-4 border-[#7a0008] bg-gradient-to-b from-[#ff3b3b] to-[#e50914] text-lg font-extrabold text-white shadow-lg transition active:translate-y-0.5 active:border-b-2 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-16 sm:text-xl"
                >
                  {total === 0 ? "โหลว่างเปล่า" : spinLabel}
                </button>
              </div>

              {idle && (
                <p className="mt-2 text-center text-[11px] text-white/60 sm:text-xs">
                  กดปุ่ม{`"เริ่มสุ่ม"`}
                  <span className="hidden md:inline"> หรือดึงคันโยกด้านขวา</span> เพื่อสุ่มผู้ถูกรางวัล
                </p>
              )}
            </section>

            {/* ===== ผู้ถูกรางวัล ===== */}
            {winner && !spinning && (
              <section aria-label="ผู้ถูกรางวัล" className="pd-gold-frame mt-6 rounded-3xl p-1">
                <div className="rounded-[1.35rem] bg-[#1b1408] px-4 py-7 text-center sm:px-5 sm:py-8">
                  <p className="text-xs font-bold tracking-widest text-[#ffd54a]">ยินดีด้วย! ผู้ถูกรางวัล</p>
                  <p className="mt-3 break-words text-3xl font-extrabold text-[#ffe27a] md:text-5xl">{winner.name}</p>
                  <p className="mt-3 text-sm text-white/70">
                    รหัสพนักงาน <span className="font-mono font-bold text-white">{winner.empCode}</span>
                  </p>
                  <p className="mt-1 break-all font-mono text-xs text-white/40">{winner.code}</p>
                </div>
              </section>
            )}
          </div>

          {/* ===== คอลัมน์ขวา: โหลตั๋ว + ประวัติ ===== */}
          <div className="min-w-0">
            {/* ===== โหลตั๋ว ===== */}
            <section aria-label="โหลตั๋ว Lucky Draw" className="flex flex-col items-center">
              <div className="h-3 w-32 rounded-t-xl bg-white/30 sm:w-40" />
              <div className="relative h-56 w-full max-w-md overflow-hidden rounded-b-[2.5rem] rounded-t-2xl border-4 border-white/25 bg-gradient-to-b from-white/10 to-white/[0.03] sm:h-64">
                {shown.map((t) => {
                  const s = ticketStyle(t.code);
                  // ตั๋วที่อยู่ตั้งแต่เปิดหน้า: หล่นตามจังหวะสุ่ม / ตั๋วที่เพิ่งเข้าโหล (admin เพิ่งอนุมัติ): หล่นทันที
                  const delay = initialRef.current?.has(t.code) ? s.delay : 0;
                  return (
                    <div
                      key={t.code}
                      className="absolute flex h-8 w-14 flex-col items-center justify-center rounded-md border border-dashed border-white/50 bg-[#6b1d24] text-[8px] font-bold leading-tight text-white shadow-md"
                      style={
                        {
                          left: `${s.left}%`,
                          bottom: `${s.bottom}%`,
                          "--rot": `${s.rot}deg`,
                          animation: `pdDrop ${s.dur}s cubic-bezier(.3,1.2,.5,1) ${delay}s both`,
                        } as CSSProperties
                      }
                    >
                      <span className="tracking-widest">LUCKY</span>
                      <span className="font-mono text-[7px] opacity-80">{t.empCode}</span>
                    </div>
                  );
                })}
                {total === 0 && (
                  <p className="absolute inset-0 flex items-center justify-center text-sm text-white/50">โหลว่างเปล่า</p>
                )}
                <div className="pointer-events-none absolute inset-x-0 bottom-3 text-center">
                  <span className="rounded-full bg-black/60 px-4 py-1.5 text-sm font-bold">
                    <span aria-hidden className="pd-live mr-1.5 text-green-400">
                      ●
                    </span>
                    เหลือ {total} ใบ
                  </span>
                </div>
              </div>
            </section>

            {/* ===== ประวัติผู้ถูกรางวัล ===== */}
            <section aria-label="ผู้ถูกรางวัลแล้ว" className="mt-8">
              <h2 className="text-lg font-bold">ผู้ถูกรางวัลแล้ว ({winners.length})</h2>
              {winners.length === 0 ? (
                <p className="mt-3 rounded-2xl border border-dashed border-white/20 p-5 text-center text-sm text-white/50">
                  ยังไม่มีผู้ถูกรางวัล
                </p>
              ) : (
                <ul className="mt-3 max-h-[28rem] divide-y divide-white/10 overflow-y-auto rounded-2xl bg-[#1f1f1f]">
                  {winners.map((w, i) => (
                    <li key={w.code} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold">
                          {winners.length - i}. {w.name}
                        </p>
                        <p className="font-mono text-xs text-white/50">{w.empCode}</p>
                      </div>
                      <p className="shrink-0 text-xs text-white/50">{fmt(w.wonAt)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}