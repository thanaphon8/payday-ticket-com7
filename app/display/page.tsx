"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { Prompt } from "next/font/google";

const appFont = Prompt({ subsets: ["thai", "latin"], weight: ["400", "500", "600", "700", "800"] });

const SHOW_MAX = 120; // จำนวนตั๋วสูงสุดที่วาดในโหล (ตัวเลขรวมนับจริงทั้งหมด)
const JAR_COLS = 7; // จำนวนตั๋วต่อ 1 ชั้นในโหล
const JAR_ROW_MAX = 5; // ระยะห่างชั้นสูงสุด (% ของความสูงโหล) ตอนตั๋วน้อย
const JAR_FILL = 20; // ตอนตั๋วเยอะ กองจะสูงถึงกี่ % ของโหล
const TICKET_W = 13; // ความกว้างตั๋ว (% ของความกว้างโหล)
const POLL_MS = 2000; // ดึงข้อมูลสดทุกกี่ ms
const TOAST_MS = 3500; // ป้าย "+N ใบใหม่" แสดงกี่ ms
const CURSOR_HIDE_MS = 5000; // ไม่ขยับเมาส์กี่ ms แล้วซ่อนเมาส์
const LOGO_SRC = "/img/com.png";
const QR_SRC = "/img/qr.png"; // รูป QR code เข้าเว็บซื้อตั๋ว (ใส่ไฟล์ที่ public/img/qr.png)
const END_AT = new Date("2026-12-11T00:00:00+07:00").getTime(); // นับถอยหลังถึง 00:00 น. 11 ธ.ค. 2569 (เวลาไทย)

type PoolTicket = { code: string; empCode: string };
type Sold = { booth: number; lucky: number }; // booth = ชุด / lucky = ใบ (อนุมัติแล้ว จาก /api/stats)
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
    rot: -80 + r01(code, 3) * 160,
    delay: r01(code, 4) * 1.6,
    dur: 0.9 + r01(code, 5) * 0.7,
  };
}

// ขอบตัวหนังสือมนด้วย text-shadow รอบทิศ (ใช้กับชื่องาน)
const ring = (r: number, c: string, dy = 0) =>
  Array.from({ length: 16 }, (_, i) => {
    const a = (i / 16) * Math.PI * 2;
    return `${(Math.cos(a) * r).toFixed(2)}cqw ${(Math.sin(a) * r + dy).toFixed(2)}cqw 0 ${c}`;
  }).join(",");
const TITLE_OUTLINE = [ring(0.8, "#c8101c"), ring(0.8, "#7a0610", 0.8), "0 2.4cqw 2cqw rgba(0,0,0,0.45)"].join(",");

function Star({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" className={className} style={style} aria-hidden>
      <path
        d="M12 1.8l3 6.6 7.2.8-5.4 4.9 1.5 7.1L12 17.6l-6.3 3.6 1.5-7.1L1.8 9.2 9 8.4z"
        fill="#ffd54a"
        stroke="#fff3b0"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Sparkle({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" className={className} style={style} aria-hidden>
      <path d="M12 0C12.8 7 17 11.2 24 12C17 12.8 12.8 17 12 24C11.2 17 7 12.8 0 12C7 11.2 11.2 7 12 0Z" fill="#ffffff" />
    </svg>
  );
}

function Crown({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 64 48" className={className} style={style} aria-hidden>
      <path d="M4 40 L2 12 L18 26 L32 4 L46 26 L62 12 L60 40 Z" fill="#ffc83d" stroke="#b27d00" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M4 40 H60 V46 H4 Z" fill="#e0a010" stroke="#b27d00" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="2" cy="12" r="3.2" fill="#ffe9a0" />
      <circle cx="32" cy="4" r="3.2" fill="#ffe9a0" />
      <circle cx="62" cy="12" r="3.2" fill="#ffe9a0" />
    </svg>
  );
}

// ตัวเลขแบบดิจิทัล 7 ส่วน
const SEG_SHAPES = [
  "9,2 51,2 43,12 17,12", // a บน
  "53,4 53,47 48,51 43,45 43,14", // b ขวาบน
  "53,53 53,96 43,86 43,55 48,49", // c ขวาล่าง
  "17,88 43,88 51,98 9,98", // d ล่าง
  "7,53 12,49 17,55 17,86 7,96", // e ซ้ายล่าง
  "7,4 17,14 17,45 12,51 7,47", // f ซ้ายบน
  "14,50 19,45 41,45 46,50 41,55 19,55", // g กลาง
];
const SEG_ON = ["abcdef", "bc", "abdeg", "abcdg", "bcfg", "acdfg", "acdefg", "abc", "abcdefg", "abcdfg"];

function SegNumber({ value }: { value: string }) {
  return (
    <span className="flex justify-center" style={{ gap: "0.8cqw" }}>
      <span className="sr-only">{value}</span>
      {value.split("").map((ch, i) => (
        <svg key={i} viewBox="0 0 60 100" aria-hidden className="pd-seg" style={{ width: "6cqw", height: "10cqw" }}>
          <g transform="skewX(-5) translate(4 0)">
            {SEG_SHAPES.map((p, k) => (
              <polygon key={k} points={p} fill="#ffe680" opacity={SEG_ON[Number(ch)]?.includes("abcdefg"[k]) ? 1 : 0.08} />
            ))}
          </g>
        </svg>
      ))}
    </span>
  );
}

function AlarmClock({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 100 100" className={className} style={style} aria-hidden>
      <path d="M26 82 L18 96 M74 82 L82 96" stroke="#b3101c" strokeWidth="8" strokeLinecap="round" />
      <path d="M8 34 A18 18 0 0 1 36 12 Z M92 34 A18 18 0 0 0 64 12 Z" fill="#e0262c" stroke="#ffb03a" strokeWidth="2" />
      <circle cx="50" cy="55" r="38" fill="#d71b25" stroke="#ffb03a" strokeWidth="2.5" />
      <circle cx="50" cy="55" r="29" fill="#fff6e4" />
      {Array.from({ length: 12 }, (_, i) => (
        <path key={i} d="M50 30 V35" stroke="#6b1018" strokeWidth="2.5" strokeLinecap="round" transform={`rotate(${i * 30} 50 55)`} />
      ))}
      <path d="M50 55 V34" stroke="#3a0a10" strokeWidth="4" strokeLinecap="round" />
      <circle cx="50" cy="55" r="4" fill="#d71b25" />
    </svg>
  );
}

function Burst({ flip }: { flip?: boolean }) {
  return (
    <svg viewBox="0 0 30 40" aria-hidden className="pd-chev flex-none" style={{ width: "4.5cqw", height: "6cqw", transform: flip ? "scaleX(-1)" : undefined }}>
      <path d="M24 10 L8 2 M22 20 H3 M24 30 L8 38" stroke="#ffd54a" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}

function PeopleIcon() {
  return (
    <svg viewBox="0 0 48 32" aria-hidden style={{ width: "9cqw", height: "6cqw" }} fill="#ffd54a">
      <circle cx="9" cy="10" r="5" />
      <circle cx="39" cy="10" r="5" />
      <path d="M0 28c0-7 4-11 9-11 3 0 5 1 6 3-3 2-4 5-4 8zM48 28c0-7-4-11-9-11-3 0-5 1-6 3 3 2 4 5 4 8z" />
      <circle cx="24" cy="8" r="7" />
      <path d="M12 31c0-9 5-14 12-14s12 5 12 14z" />
    </svg>
  );
}

function TicketIcon() {
  return (
    <svg viewBox="0 0 48 32" aria-hidden style={{ width: "9cqw", height: "6cqw", transform: "rotate(-14deg)" }}>
      <path d="M3 4H45V12a4 4 0 0 0 0 8V28H3V20a4 4 0 0 0 0-8Z" fill="#d71b25" stroke="#ff8a7a" strokeWidth="2" strokeLinejoin="round" />
      <rect x="11" y="9" width="26" height="14" rx="2" fill="none" stroke="#ffb0a0" strokeWidth="1.5" />
    </svg>
  );
}

// หลอดไฟรอบป้ายชื่องาน (x/y = % ของป้าย)
const BULBS = [
  ...Array.from({ length: 17 }, (_, i) => ({ x: 7 + i * 5.375, y: 8 })),
  ...Array.from({ length: 17 }, (_, i) => ({ x: 7 + i * 5.375, y: 92 })),
  { x: 2.4, y: 33 }, { x: 2.4, y: 67 }, { x: 97.6, y: 33 }, { x: 97.6, y: 67 },
];

// ดาว (l = % แนวนอน, t/s = cqw, r = องศา, d = หน่วงวินาที)
const STARS = [
  { l: 3, t: 17, s: 7.5, r: -15, d: 0, pale: false },
  { l: 12, t: 6, s: 5, r: 10, d: 0.5, pale: true },
  { l: 91, t: 22, s: 5.5, r: 12, d: 0.3, pale: true },
  { l: 11, t: 98, s: 6, r: -12, d: 0.9, pale: false },
  { l: 83, t: 91, s: 7, r: 14, d: 0.2, pale: false },
  { l: 0.5, t: 154, s: 5.5, r: -10, d: 0.7, pale: false },
  { l: 93.5, t: 154, s: 5.5, r: 10, d: 0.4, pale: false },
];
const SPARKLES = [
  { l: 7, t: 19, s: 7, d: 0 },
  { l: 12, t: 16, s: 3, d: 0.7 },
  { l: 92, t: 23, s: 3, d: 0.4 },
  { l: 28, t: 3, s: 3.5, d: 1.1 },
  { l: 70, t: 8, s: 3, d: 0.2 },
  { l: 50, t: 92, s: 3, d: 0.9 },
];
// ตั๋วลอยตกแต่ง (l/t/w = cqw, r = องศา, o = ความโปร่ง, z = ลำดับชั้น)
const FLOATERS = [
  { l: 80.5, t: 5, w: 16, r: 18, o: 1, z: 25 },
];
// ประกายไฟลอยขึ้นจากด้านล่าง (l = %, s = cqw, u = วินาทีต่อรอบ, d = หน่วง)
const EMBERS = Array.from({ length: 16 }, (_, i) => ({
  l: (i * 37) % 100,
  s: 0.8 + ((i * 7) % 5) * 0.35,
  u: 7 + ((i * 3) % 6),
  d: -((i * 1.3) % 9),
}));

// ตัวเลขไล่ขึ้น/ลงนุ่ม ๆ เมื่อค่าเปลี่ยน
function useCountUp(target: number, ms = 900) {
  const [val, setVal] = useState(0);
  const ref = useRef(0);
  useEffect(() => {
    const from = ref.current;
    if (from === target) return;
    let raf = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / ms);
      const v = Math.round(from + (target - from) * (1 - Math.pow(1 - p, 3)));
      ref.current = v;
      setVal(v);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return val;
}

// ขนาดตัวเลขในช่องสรุป (cqw) ลดลงตามจำนวนหลัก
const statFs = (text: string) => (text.length <= 3 ? 9 : text.length <= 5 ? 7 : 5.4);

export default function DisplayPage() {
  const [gate, setGate] = useState<Gate>("loading");
  const [note, setNote] = useState("");
  const [pw, setPw] = useState("");
  const [pwErr, setPwErr] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pool, setPool] = useState<PoolTicket[]>([]);
  const [total, setTotal] = useState(0);
  const [toast, setToast] = useState<{ n: number; id: number } | null>(null);
  const [sold, setSold] = useState<Sold | null>(null);
  const [qrFailed, setQrFailed] = useState(false);
  const [now, setNow] = useState(0); // 0 = ยังไม่ได้อ่านเวลา (อ่านเฉพาะฝั่งเบราว์เซอร์)

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
      try {
        const st = await fetch("/api/stats", { cache: "no-store" });
        if (st.ok) {
          const v = (await st.json()) as Partial<Sold>;
          setSold({ booth: v.booth ?? 0, lucky: v.lucky ?? 0 });
        }
      } catch {
        /* ข้ามได้ รอบหน้าลองใหม่ */
      }
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

  // นาฬิกานับถอยหลัง อัปเดตทุกวินาที
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);
  const boothShown = useCountUp(sold?.booth ?? 0);
  const luckyShown = useCountUp(sold?.lucky ?? 0);

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

  const left = now === 0 ? 0 : Math.max(0, END_AT - now);
  const cd = [
    { v: Math.floor(left / 86400000), l: "วัน" },
    { v: Math.floor(left / 3600000) % 24, l: "ชั่วโมง" },
    { v: Math.floor(left / 60000) % 60, l: "นาที" },
    { v: Math.floor(left / 1000) % 60, l: "วินาที" },
  ];
  const statCard = (icon: ReactNode, title: string, shownVal: number, target: number | undefined, unit: string) => {
    const text = target === undefined ? "___" : shownVal.toLocaleString("th-TH");
    return (
      <div className="pd-flat flex min-w-0 flex-col items-center justify-center text-center" style={{ padding: "1cqw 0.8cqw" }}>
        {icon}
        <p className="whitespace-nowrap font-bold text-[#fff1c4]" style={{ fontSize: "2.45cqw", marginTop: "1cqw" }}>
          {title}
        </p>
        <p className="flex items-baseline justify-center font-extrabold leading-none text-[#ffd54a]" style={{ gap: "1.6cqw", height: "11cqw", marginTop: "0.5cqw", alignItems: "center" }}>
          <span key={target ?? "none"} className="pd-pop inline-block" style={{ fontSize: `${statFs(text)}cqw`, fontVariantNumeric: "tabular-nums" }}>
            {text}
          </span>
          <span style={{ fontSize: "5.4cqw" }}>{unit}</span>
        </p>
      </div>
    );
  };

  return (
    <div className={`${shell} flex h-screen items-center justify-center overflow-hidden`}>
      <style>{`
        @keyframes pdDrop {
          0% { transform: translateY(-100cqw) rotate(calc(var(--rot) - 140deg)); opacity: 0; }
          12% { opacity: 1; }
          100% { transform: translateY(0) rotate(var(--rot)); opacity: 1; }
        }
        @keyframes pdNewGlow {
          0% { filter: brightness(2) drop-shadow(0 0 2cqw #ffd54a); }
          100% { filter: brightness(1) drop-shadow(0 0 0 transparent); }
        }
        @keyframes pdPop {
          0% { transform: scale(1.3); }
          60% { transform: scale(0.96); }
          100% { transform: scale(1); }
        }
        @keyframes pdToast {
          0% { transform: translate(-50%, -40%) scale(0.7); opacity: 0; }
          60% { transform: translate(-50%, 0) scale(1.08); opacity: 1; }
          100% { transform: translate(-50%, 0) scale(1); opacity: 1; }
        }
        @keyframes pdSpin { to { transform: rotate(360deg); } }
        @keyframes pdTwinkle {
          0% { opacity: 0.15; transform: scale(0.55) rotate(0deg); }
          100% { opacity: 1; transform: scale(1.15) rotate(25deg); }
        }
        @keyframes pdBob {
          0% { transform: translateY(0) rotate(var(--r)); }
          100% { transform: translateY(-1.6cqw) rotate(calc(var(--r) + 8deg)); }
        }
        @keyframes pdRise {
          0% { transform: translateY(0) translateX(0); opacity: 0; }
          10% { opacity: 0.9; }
          100% { transform: translateY(-175cqw) translateX(4cqw); opacity: 0; }
        }
        @keyframes pdBulb {
          0%, 100% { background: #fff6c0; box-shadow: 0 0 1.8cqw 0.6cqw rgba(255, 226, 110, 0.95); }
          50% { background: #9a6200; box-shadow: none; }
        }
        @keyframes pdTextShine {
          0% { background-position: 160% 0, 0 0; }
          55%, 100% { background-position: -60% 0, 0 0; }
        }
        @keyframes pdChev {
          0%, 100% { opacity: 0.55; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.18); }
        }
        @keyframes pdPulse {
          0% { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes pdGlassShine {
          0% { transform: translateX(-45cqw) skewX(-18deg); }
          60%, 100% { transform: translateX(140cqw) skewX(-18deg); }
        }
        @keyframes pdPodium {
          0% { box-shadow: 0 -1cqw 5cqw rgba(255, 190, 60, 0.55), inset 0 1cqw 3cqw rgba(255, 230, 150, 0.4); }
          100% { box-shadow: 0 -1.5cqw 9cqw rgba(255, 200, 70, 0.95), inset 0 1cqw 4cqw rgba(255, 230, 150, 0.7); }
        }
        @keyframes pdLidGlow {
          0% { filter: brightness(1); }
          100% { filter: brightness(1.18); }
        }

        .pd-nocursor,
        .pd-nocursor * { cursor: none !important; }

        .pd-stage {
          background:
            radial-gradient(ellipse at 50% 18%, rgba(255, 190, 70, 0.9) 0%, rgba(255, 110, 30, 0) 42%),
            radial-gradient(ellipse at 50% 30%, #ee5a1c 0%, #c81a18 34%, #8e0a12 66%, #5a040c 100%);
        }
        .pd-rays {
          position: absolute;
          left: 50%;
          top: 22cqw;
          width: 330cqw;
          height: 330cqw;
          margin: -165cqw 0 0 -165cqw;
          pointer-events: none;
          background: repeating-conic-gradient(from 0deg, rgba(255, 170, 60, 0.24) 0deg 7deg, transparent 7deg 15deg);
          -webkit-mask-image: radial-gradient(circle, #000 0, transparent 52%);
          mask-image: radial-gradient(circle, #000 0, transparent 52%);
          animation: pdSpin 90s linear infinite;
        }
        .pd-vignette {
          position: absolute;
          inset: 0;
          z-index: 3;
          pointer-events: none;
          background: radial-gradient(ellipse at 50% 50%, transparent 62%, rgba(40, 0, 0, 0.4) 100%);
        }
        .pd-ember {
          position: absolute;
          bottom: -2cqw;
          z-index: 4;
          border-radius: 50%;
          pointer-events: none;
          background: #ffd54a;
          box-shadow: 0 0 1.5cqw 0.4cqw rgba(255, 200, 60, 0.9);
          opacity: 0;
          animation: pdRise linear infinite;
        }
        .pd-star { position: absolute; z-index: 6; pointer-events: none; filter: drop-shadow(0 0 1.2cqw rgba(255, 200, 60, 0.8)); animation: pdBob 3s ease-in-out infinite alternate; }
        .pd-spark { position: absolute; z-index: 6; pointer-events: none; filter: drop-shadow(0 0 1cqw #fff3b0); animation: pdTwinkle 1.6s ease-in-out infinite alternate; }

        /* ตั๋ว: ขอบหยักซ้ายขวา + กรอบขาวด้านใน */
        .pd-ticket {
          background: linear-gradient(160deg, #d0202c, #a80d1c 60%, #8c0814);
          color: #fff;
          box-shadow: inset 0 0.2cqw 0 rgba(255, 150, 150, 0.6), 0 0.4cqw 0.6cqw rgba(50, 0, 5, 0.6);
          clip-path: polygon(0 0, 100% 0, 96% 12.5%, 100% 25%, 96% 37.5%, 100% 50%, 96% 62.5%, 100% 75%, 96% 87.5%, 100% 100%, 0 100%, 4% 87.5%, 0 75%, 4% 62.5%, 0 50%, 4% 37.5%, 0 25%, 4% 12.5%);
        }
        .pd-ticket::before {
          content: "";
          position: absolute;
          inset: 0.55cqw 0.9cqw;
          border: 0.2cqw solid rgba(255, 220, 215, 0.75);
          border-radius: 0.6cqw;
        }
        .pd-float { z-index: 25; pointer-events: none; transform: rotate(var(--r)); animation: pdBob 3.4s ease-in-out infinite alternate; }

        /* ตัวหนังสือทองเงา */
        .pd-gold-text {
          background-image:
            linear-gradient(105deg, transparent 42%, rgba(255, 255, 255, 0.95) 50%, transparent 58%),
            linear-gradient(180deg, #fffbd6 0%, #ffe27a 34%, #ffb800 62%, #ffd54a 100%);
          background-size: 250% 100%, 100% 100%;
          background-repeat: no-repeat;
          background-position: 160% 0, 0 0;
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          color: transparent;
          animation: pdTextShine 3.2s ease-in-out infinite;
        }
        .pd-title-front { filter: drop-shadow(0 0.25cqw 0 #c27a00); }

        .pd-sign {
          background: linear-gradient(180deg, #e8252b 0%, #b80f1c 55%, #8d0712 100%);
          border: 0.8cqw solid #ffbe3a;
          border-radius: 9cqw;
          box-shadow: 0 1cqw 0 #8a0a10, 0 0 5cqw rgba(255, 190, 60, 0.8), inset 0 0 0 0.5cqw #ff6a2a;
        }
        .pd-badge {
          background: radial-gradient(circle at 50% 35%, #2b4a86, #14234a 75%);
          border: 0.7cqw solid #ffbe3a;
          box-shadow: 0 0 3cqw rgba(255, 190, 60, 0.7);
        }
        .pd-timer {
          background: radial-gradient(ellipse at 50% 40%, #6e0c16 0%, #43050d 75%, #2e0308 100%);
          border: 0.7cqw solid #ffc23a;
          border-radius: 4.5cqw;
          box-shadow: 0 0 0 0.5cqw #c9151d, 0 0 4cqw rgba(255, 190, 60, 0.8), inset 0 0 3cqw rgba(0, 0, 0, 0.5);
        }
        .pd-seg { filter: drop-shadow(0 0 0.8cqw rgba(255, 190, 50, 0.95)); }
        .pd-pill-red {
          background: linear-gradient(180deg, #d81f27, #9c0a16);
          border: 0.6cqw solid #ffc23a;
          box-shadow: 0 0 3cqw rgba(255, 180, 60, 0.6), inset 0 0.4cqw 0 rgba(255, 255, 255, 0.25);
        }
        .pd-pill-gold {
          background: linear-gradient(180deg, #fff3b0 0%, #ffd54a 50%, #ffb81f 100%);
          border: 0.4cqw solid #fff3b0;
          box-shadow: 0 0.6cqw 0 #a86f00, 0 0 3cqw rgba(255, 200, 60, 0.6);
        }
        .pd-bulb { position: absolute; width: 1.5cqw; height: 1.5cqw; border-radius: 50%; transform: translate(-50%, -50%); animation: pdBulb 1.2s ease-in-out infinite; }
        .pd-chev { animation: pdChev 1s ease-in-out infinite; }

        .pd-lid {
          background: linear-gradient(90deg, #c77800, #ffd54a 18%, #fff3b0 38%, #ffc22e 62%, #fff0a0 82%, #c77800);
          border-bottom: 1.2cqw solid #d98f0a;
          box-shadow: 0 0.8cqw 0 #9a5c00, 0 0 3cqw rgba(255, 200, 60, 0.6);
          animation: pdLidGlow 2s ease-in-out infinite alternate;
        }
        .pd-jar {
          background:
            repeating-conic-gradient(from 3deg at 50% 100%, rgba(255, 200, 100, 0.1) 0deg 6deg, transparent 6deg 14deg),
            radial-gradient(ellipse at 50% 92%, rgba(255, 175, 70, 0.8) 0%, rgba(215, 70, 30, 0.55) 35%, rgba(150, 14, 22, 0.6) 70%, rgba(150, 20, 28, 0.5) 100%);
          box-shadow: 0 0 6cqw rgba(255, 170, 70, 0.65);
        }
        .pd-glass {
          position: absolute;
          inset: 0;
          z-index: 20;
          overflow: hidden;
          pointer-events: none;
          border-radius: inherit;
          border: 0.9cqw solid rgba(255, 225, 205, 0.75);
          box-shadow: inset 0 0 5cqw rgba(255, 255, 255, 0.18), inset 0 -3cqw 6cqw rgba(255, 150, 80, 0.25);
          background:
            linear-gradient(135deg, rgba(255, 255, 255, 0.24) 0%, rgba(255, 255, 255, 0) 24%),
            linear-gradient(315deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0) 30%);
        }
        .pd-glass-shine {
          position: absolute;
          top: 0;
          bottom: 0;
          left: 0;
          width: 14cqw;
          background: linear-gradient(100deg, transparent, rgba(255, 255, 255, 0.3), transparent);
          animation: pdGlassShine 5.5s ease-in-out infinite;
        }
        .pd-podium {
          position: absolute;
          left: -4cqw;
          right: -4cqw;
          bottom: 22cqw;
          height: 17cqw;
          z-index: 5;
          border-radius: 50%;
          background: radial-gradient(ellipse at 50% 35%, #ff6a2a 0%, #d51d20 55%, #a30c17 100%);
          border: 0.8cqw solid #ffc23a;
          animation: pdPodium 2.4s ease-in-out infinite alternate;
        }
        .pd-base {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          height: 30.5cqw;
          z-index: 5;
          background: linear-gradient(180deg, #c8141c 0%, #9a0914 60%, #6c030c 100%);
        }
        .pd-flat {
          background: radial-gradient(ellipse at 50% 30%, #6e0c16, #3a040b 80%);
          border: 0.6cqw solid #ffc23a;
          border-radius: 3.5cqw;
          box-shadow: 0 0 0 0.4cqw #c9151d, 0 0 2.5cqw rgba(255, 190, 60, 0.6);
        }
        .pd-tick { animation: pdPop 0.35s ease-out both; }
        @media (prefers-reduced-motion: reduce) { .pd-tick { animation: none; } }
        .pd-pop { animation: pdPop 0.5s cubic-bezier(0.3, 1.5, 0.5, 1) both; }
        .pd-toast { animation: pdToast 0.5s cubic-bezier(0.3, 1.5, 0.5, 1) both; }
        @media (prefers-reduced-motion: reduce) {
          .pd-rays, .pd-ember, .pd-star, .pd-spark, .pd-float, .pd-gold-text, .pd-bulb, .pd-chev, .pd-glass-shine, .pd-podium, .pd-lid, .pd-pop, .pd-toast { animation: none; }
        }
      `}</style>

      {/* เวที 9:16 แนวตั้ง: พอดีจอทั้งแนวตั้งและแนวนอน */}
      <div
        className="pd-stage relative flex flex-col items-center overflow-hidden"
        style={{ width: "min(100vw, 56.25vh)", height: "min(100vh, 177.78vw)", containerType: "size" }}
      >
        <h1 className="sr-only">Lucky Draw Display</h1>

        <div aria-hidden className="pd-rays" />
        <div aria-hidden className="pd-vignette" />
        <div aria-hidden className="pd-base" />
        <div aria-hidden className="pd-podium" />

        {/* ประกายไฟลอยขึ้น */}
        {EMBERS.map((e, i) => (
          <span
            key={`e${i}`}
            aria-hidden
            className="pd-ember"
            style={{ left: `${e.l}%`, width: `${e.s}cqw`, height: `${e.s}cqw`, animationDuration: `${e.u}s`, animationDelay: `${e.d}s` }}
          />
        ))}

        {/* ดาว + ประกายระยิบ */}
        {STARS.map((s, i) => (
          <Star
            key={`s${i}`}
            className="pd-star"
            style={{ left: `${s.l}%`, top: `${s.t}cqw`, width: `${s.s}cqw`, height: `${s.s}cqw`, opacity: s.pale ? 0.7 : 1, animationDelay: `${s.d}s`, "--r": `${s.r}deg` } as CSSProperties}
          />
        ))}
        {SPARKLES.map((s, i) => (
          <Sparkle
            key={`k${i}`}
            className="pd-spark"
            style={{ left: `${s.l}%`, top: `${s.t}cqw`, width: `${s.s}cqw`, height: `${s.s}cqw`, animationDelay: `${s.d}s` }}
          />
        ))}

        {/* ตั๋วลอยตกแต่ง */}
        {FLOATERS.map((f, i) => (
          <div
            key={`f${i}`}
            aria-hidden
            className="pd-ticket pd-float absolute flex flex-col items-center justify-center font-bold leading-none"
            style={
              {
                left: `${f.l}cqw`,
                top: `${f.t}cqw`,
                width: `${f.w}cqw`,
                aspectRatio: "56 / 32",
                fontSize: `${f.w * 0.17}cqw`,
                opacity: f.o,
                zIndex: f.z,
                "--r": `${f.r}deg`,
                animationDelay: `${-i * 0.7}s`,
              } as CSSProperties
            }
          >
            <span>LUCKY</span>
            <span>DRAW</span>
            <span className="text-[0.8em]">★</span>
          </div>
        ))}

        {/* โลโก้ + ป้ายไฟชื่องาน (อยู่เหนือโหล) */}
        <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col items-center" style={{ paddingTop: "2cqw" }}>
          <div className="pd-badge relative z-10 flex items-center justify-center rounded-full" style={{ height: "12cqw", minWidth: "26cqw", padding: "0 3cqw", marginBottom: "-2.5cqw" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={LOGO_SRC} alt="" draggable={false} className="block w-auto object-contain" style={{ height: "8.5cqw", maxWidth: "30cqw" }} />
          </div>
          <div className="pd-sign relative flex items-center justify-center" style={{ width: "82cqw", height: "20cqw" }}>
            {BULBS.map((b, i) => (
              <span key={i} aria-hidden className="pd-bulb" style={{ left: `${b.x}%`, top: `${b.y}%`, animationDelay: `${(i % 2) * 0.6}s` }} />
            ))}
            <Crown className="pd-star absolute" style={{ left: "6cqw", top: "-8.5cqw", width: "13cqw", height: "10cqw", "--r": "-14deg" } as CSSProperties} />
            <div className="relative whitespace-nowrap font-extrabold" style={{ fontSize: "10.6cqw", lineHeight: 1.1 }}>
              <span aria-hidden className="inline-block" style={{ color: "#c8101c", textShadow: TITLE_OUTLINE }}>
                LUCKY DRAW
              </span>
              <span className="pd-gold-text pd-title-front absolute inset-0">LUCKY DRAW</span>
            </div>
          </div>
        </header>

        {/* โหลแก้วเกือบเต็มจอ: ตั๋วกองอยู่ก้นโหล / ข้อความนับถอยหลังอยู่บนโหล */}
        <section
          aria-label="โหลตั๋ว Lucky Draw"
          className="relative z-10 flex min-h-0 w-full flex-1 flex-col items-center"
          style={{ padding: "1cqw 5cqw 2cqw" }}
        >
          <div className="pd-lid relative z-20 flex-none" style={{ width: "58cqw", height: "6.5cqw", borderRadius: "2.4cqw", marginBottom: "-1.2cqw" }} />
          <div className="pd-jar relative min-h-0 w-full flex-1 overflow-hidden" style={{ borderRadius: "13cqw 13cqw 10cqw 10cqw" }}>
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
                  className="pd-ticket absolute flex flex-col items-center justify-center font-bold leading-none"
                  style={
                    {
                      left: `${s.left}%`,
                      bottom: `${s.bottom}%`,
                      width: `${TICKET_W}%`,
                      aspectRatio: "56 / 36",
                      fontSize: "1.8cqw",
                      "--rot": `${s.rot}deg`,
                      animation: anim,
                      transition: "left 0.6s ease, bottom 0.6s ease",
                    } as CSSProperties
                  }
                >
                  <span>LUCKY</span>
                  <span>DRAW</span>
                  <span className="font-mono opacity-90" style={{ fontSize: "1.35cqw", marginTop: "0.15cqw" }}>
                    {t.empCode}
                  </span>
                </div>
              );
            })}

            {total === 0 && (
              <p className="absolute inset-x-0 text-center text-white/60" style={{ bottom: "8cqw", fontSize: "5cqw" }}>
                โหลว่างเปล่า
              </p>
            )}

            {/* ข้อความบนโหล: เหลือเวลา + นับถอยหลัง + วันสิ้นสุด */}
            <div className="absolute inset-x-0 z-30 flex flex-col items-center" style={{ top: "31cqw" }}>
              <div className="relative z-10 flex items-center" style={{ gap: "1.5cqw", marginBottom: "-1.5cqw" }}>
                <Burst />
                <div className="pd-pill-red relative flex items-center justify-center rounded-full" style={{ width: "50cqw", height: "10cqw", marginLeft: "4cqw" }}>
                  <AlarmClock className="absolute" style={{ left: "-7cqw", top: "-3cqw", width: "15cqw", height: "15cqw" }} />
                  <span className="font-extrabold leading-none text-[#fff6dc]" style={{ fontSize: "6cqw", paddingLeft: "6cqw" }}>
                    เหลือเวลา
                  </span>
                </div>
                <Burst flip />
              </div>
              <div className="pd-timer flex items-center justify-center" style={{ width: "80cqw", height: "22cqw", paddingTop: "1cqw" }} role="timer" aria-live="off">
                {now === 0 || left > 0 ? (
                  <div className="flex items-start justify-center" style={{ gap: "0.6cqw" }}>
                    {cd.flatMap((c, i) => [
                      <div key={c.l} className="flex flex-col items-center" style={{ width: "15cqw" }}>
                        <span key={c.v} className="pd-tick inline-block">
                          <SegNumber value={String(c.v).padStart(2, "0")} />
                        </span>
                        <p className="font-bold leading-none text-[#ffe9a0]" style={{ fontSize: "3cqw", marginTop: "1.6cqw" }}>
                          {c.l}
                        </p>
                      </div>,
                      i < 3 ? (
                        <span key={`c${i}`} aria-hidden className="flex flex-col items-center" style={{ width: "2.6cqw" }}>
                          <span className="pd-chev font-extrabold leading-none text-[#ffe680]" style={{ fontSize: "9cqw", height: "10cqw" }}>
                            :
                          </span>
                          <span className="bg-[#ffd54a]/70" style={{ width: "0.3cqw", height: "3cqw", marginTop: "1.6cqw" }} />
                        </span>
                      ) : null,
                    ])}
                  </div>
                ) : (
                  <p className="font-extrabold text-[#ffe27a]" style={{ fontSize: "8cqw" }}>
                    หมดเวลาแล้ว
                  </p>
                )}
              </div>
              <div className="pd-pill-gold flex items-center whitespace-nowrap rounded-full font-bold text-[#7a1008]" style={{ marginTop: "2.2cqw", gap: "3cqw", padding: "0.5cqw 5cqw", fontSize: "3.8cqw" }}>
                <Star style={{ width: "3.6cqw", height: "3.6cqw", filter: "brightness(0.82)" }} />
                ถึงวันที่ 11 ธันวาคม
                <Star style={{ width: "3.6cqw", height: "3.6cqw", filter: "brightness(0.82)" }} />
              </div>
            </div>

            {/* ป้าย +N ใบใหม่ เมื่อมีคนซื้อ */}
            {toast && (
              <div
                key={toast.id}
                className="pd-toast pointer-events-none absolute left-1/2 z-30 whitespace-nowrap rounded-full bg-[#58cc02] font-extrabold text-white"
                style={{
                  bottom: "34%",
                  fontSize: "5cqw",
                  padding: "1cqw 5cqw",
                  border: "0.6cqw solid #fff6c9",
                  boxShadow: "0 1cqw 0 #3a8f00, 0 0 5cqw rgba(125, 255, 107, 0.6)",
                }}
              >
                +{toast.n} ใบใหม่
              </div>
            )}

            {/* กระจกโหล: ขอบ + แสงสะท้อน + แสงวิ่งผ่าน */}
            <div aria-hidden className="pd-glass">
              <span className="pd-glass-shine" />
              <span className="absolute rounded-full bg-white/25 blur-[1px]" style={{ left: "4cqw", top: "6cqw", bottom: "30cqw", width: "2.4cqw" }} />
              <span className="absolute rounded-full bg-white/15" style={{ left: "9cqw", top: "14cqw", bottom: "40cqw", width: "0.9cqw" }} />
            </div>
          </div>
        </section>

        {/* 3 ช่องด้านล่าง: ตั๋วเข้าซุ้ม / Lucky Draw / QR code */}
        <section
          aria-label="สรุปการขายตั๋ว"
          aria-live="polite"
          className="relative z-10 grid w-full flex-none"
          style={{ gridTemplateColumns: "1.08fr 1.18fr 0.94fr", gap: "2.8cqw", padding: "0 5cqw 4cqw", height: "31cqw" }}
        >
          {statCard(<PeopleIcon />, "ผู้ซื้อเข้าซุ้มทั้งหมด", boothShown, sold?.booth, "ชุด")}
          {statCard(<TicketIcon />, "ตั๋ว LUCKY DRAW ทั้งหมด", luckyShown, sold?.lucky, "ใบ")}

          <div className="pd-flat flex min-w-0 flex-col items-center" style={{ padding: "0.8cqw 0.8cqw 0.8cqw" }}>
            <div className="relative min-h-0 w-full flex-1">
              {!qrFailed && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={QR_SRC} alt="QR code เข้าเว็บซื้อตั๋ว" onError={() => setQrFailed(true)} className="absolute inset-0 h-full w-full object-contain" />
              )}
            </div>
            <p className="whitespace-nowrap text-center font-bold text-[#fff1c4]" style={{ fontSize: "3cqw", marginTop: "0.8cqw" }}>
              สแกนเพื่อซื้อ
            </p>
          </div>
        </section>

        {note && (
          <p
            role="alert"
            className="absolute inset-x-0 bottom-0 z-40 text-center font-medium text-red-300"
            style={{ fontSize: "2.4cqw", padding: "1cqw" }}
          >
            {note}
          </p>
        )}
      </div>
    </div>
  );
}