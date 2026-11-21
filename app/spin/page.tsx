"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { Prompt } from "next/font/google";

const appFont = Prompt({ subsets: ["thai", "latin"], weight: ["400", "500", "600", "700", "800"] });

// ต้องตรงกับ EMP_CODE_LENGTH ใน lib/tickets.ts (จำนวนหลักสูงสุด / รหัสสั้นกว่านี้ช่องหน้าแสดง x)
const EMP_LEN = 7;
const SHOW_MAX = 60; // จำนวนตั๋วสูงสุดที่วาดหล่นในโหล (ตัวเลข "เหลือ ... ใบ" นับจริงทั้งหมด)
const FIRST_STOP_MS = 3000; // ตัวเลขสปินกี่ ms (นับจากกดเริ่ม) ก่อนหยุดหลักแรก
const ZOOM_CENTER_Y = 0.6; // ตอนซูม ตัวเลขอยู่สูงจากบนจอกี่ส่วน (0.5 = กลางจอ / มากกว่า = ตัวตู้ต่ำลง)
const STEP_MS = 1000; // ระยะห่างระหว่างการหยุดแต่ละหลัก (รอ 1 วิก่อนแสดงเลขถัดไป)
const POLL_MS = 3000; // รีเฟรชโหลสด: ตั๋วที่ admin เพิ่งอนุมัติจะหล่นเข้าโหลเอง
const BULBS = 22; // จำนวนหลอดไฟประดับตู้
const WIN_BULBS_X = 16; // จำนวนหลอดไฟขอบบน/ล่างของการ์ดผู้ถูกรางวัล
const WIN_BULBS_Y = 6; // จำนวนหลอดไฟขอบซ้าย/ขวาของการ์ดผู้ถูกรางวัล
const CURSOR_HIDE_MS = 5000; // ไม่ขยับเมาส์กี่ ms แล้วซ่อนเมาส์
const LOGO_SRC = "/img/logo.png"; // โลโก้ที่แปะเป็นเทปบนหัวตู้และโหลตั๋ว
const STRIP = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9]; // แถบตัวเลขที่เลื่อนวนในแต่ละหลัก

const MAX_BATCH = 20; // สุ่มทีเดียวได้สูงสุดกี่คน (ต้องตรงกับ MAX_BATCH ใน app/api/spin/route.ts)
const BATCH_SPIN_MS = 4500; // โหมดสุ่มหลายคน: เครื่องทำงานกี่ ms (นับจากกดเริ่ม) แล้ว "ตู้ม" ออกพร้อมกัน

// ไฟรั่วออกจากตัวตู้ตอนสุ่ม (l/t = ตำแหน่ง %, r = หมุนองศา, d = หน่วงวินาที, u = ความเร็วกะพริบวินาที)
const BOLTS = [
  { l: -6, t: 6, r: -35, d: 0, u: 0.31 },
  { l: 98, t: 14, r: 30, d: 0.1, u: 0.27 },
  { l: -7, t: 48, r: -70, d: 0.17, u: 0.36 },
  { l: 99, t: 52, r: 75, d: 0.05, u: 0.29 },
  { l: 20, t: -6, r: 10, d: 0.22, u: 0.33 },
  { l: 72, t: -7, r: -15, d: 0.12, u: 0.25 },
  { l: -5, t: 80, r: -110, d: 0.28, u: 0.34 },
  { l: 97, t: 82, r: 105, d: 0.08, u: 0.3 },
  { l: 45, t: 96, r: 170, d: 0.19, u: 0.28 },
  { l: 8, t: 30, r: -50, d: 0.25, u: 0.26 },
  { l: 92, t: 34, r: 55, d: 0.14, u: 0.35 },
  { l: 58, t: -5, r: 5, d: 0.3, u: 0.32 },
  { l: 28, t: 95, r: 160, d: 0.04, u: 0.37 },
  { l: 82, t: 94, r: -165, d: 0.2, u: 0.24 },
  { l: -4, t: 64, r: -90, d: 0.11, u: 0.38 },
  { l: 96, t: 66, r: 95, d: 0.26, u: 0.23 },
];

const HIT_MS = 380; // เวลาที่ค้อนกระทบปุ่ม (ต้องตรงกับ keyframes pdHammer ที่ 38%)
// เศษปุ่มที่แตกกระจาย (ทิศทาง x/y หน่วย px, หมุน r องศา, ขนาด s px)
const SHARDS = [
  { x: -150, y: -80, r: -220, s: 26 },
  { x: -90, y: -120, r: 160, s: 20 },
  { x: -30, y: -140, r: 300, s: 24 },
  { x: 40, y: -130, r: -180, s: 18 },
  { x: 100, y: -110, r: 240, s: 26 },
  { x: 160, y: -70, r: -300, s: 22 },
  { x: -160, y: 50, r: 200, s: 20 },
  { x: -100, y: 90, r: -140, s: 24 },
  { x: -20, y: 110, r: 260, s: 18 },
  { x: 60, y: 100, r: -240, s: 22 },
  { x: 120, y: 80, r: 180, s: 26 },
  { x: 170, y: 40, r: -160, s: 18 },
];

// แสงโบเก้ไฟร้านอาหารด้านหลัง (ตำแหน่ง l/t เป็น %, ขนาด s px, สี c, ความสว่าง o, หน่วงแอนิเมชัน d วินาที)
const BOKEH = [
  { l: 2, t: 8, s: 190, c: "#ffb347", o: 0.55, d: 0 },
  { l: 14, t: 38, s: 120, c: "#ff7a45", o: 0.45, d: -1.2 },
  { l: 6, t: 68, s: 210, c: "#ffd27a", o: 0.4, d: -2.1 },
  { l: 22, t: 6, s: 100, c: "#ffe0a0", o: 0.5, d: -0.6 },
  { l: 30, t: 82, s: 160, c: "#ff5a5a", o: 0.35, d: -3 },
  { l: 40, t: 2, s: 140, c: "#ffb347", o: 0.45, d: -1.8 },
  { l: 48, t: 60, s: 90, c: "#ffd27a", o: 0.35, d: -2.6 },
  { l: 56, t: 90, s: 200, c: "#ff7a45", o: 0.4, d: -0.3 },
  { l: 62, t: 14, s: 170, c: "#ffe0a0", o: 0.4, d: -3.4 },
  { l: 70, t: 46, s: 110, c: "#ff5a5a", o: 0.35, d: -1.5 },
  { l: 78, t: 4, s: 130, c: "#ffd27a", o: 0.5, d: -2.4 },
  { l: 84, t: 72, s: 220, c: "#ffb347", o: 0.45, d: -0.9 },
  { l: 92, t: 28, s: 180, c: "#ff7a45", o: 0.45, d: -3.1 },
  { l: 94, t: 88, s: 120, c: "#ffe0a0", o: 0.4, d: -1.9 },
  { l: 36, t: 44, s: 80, c: "#ffd27a", o: 0.25, d: -2.8 },
  { l: 66, t: 78, s: 90, c: "#ff5a5a", o: 0.3, d: -0.7 },
];

type PoolTicket = { code: string; empCode: string };
type Winner = {
  code: string;
  empCode: string;
  name: string;
  wonAt: string | null;
  company: string | null; // บริษัทที่เลือกตอนสมัคร (บัญชีเก่า = null)
  department: string | null; // แผนก (สำนักงานใหญ่) หรือสาขา (หน้าร้าน)
  userId: string | null; // ไอดีผู้ใช้ ใช้ดึงรูปโปรไฟล์จาก /api/avatar/[id]
  avatarAt: string | null; // เวลาที่อัปโหลดรูปโปรไฟล์ (null = ไม่มีรูป)
};
// เข้าด้วยรหัสผ่าน admin อย่างเดียว (ไม่ต้อง login บัญชีผู้ใช้) ใช้ cookie ปลดล็อกเดียวกับหน้า /admin
type Gate = "loading" | "ok" | "locked";

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "-";

// รูปโปรไฟล์ผู้ถูกรางวัล: มีรูปแสดงรูป / ไม่มีหรือโหลดไม่ได้ แสดงตัวอักษรแรกของชื่อ
// className = ขนาด + ขนาดตัวอักษร + ring
function WinnerAvatar({ w, className }: { w: Winner; className: string }) {
  const [failed, setFailed] = useState(false);
  const src = w.userId && w.avatarAt ? `/api/avatar/${w.userId}?v=${encodeURIComponent(w.avatarAt)}` : "";

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (src && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        aria-hidden
        onError={() => setFailed(true)}
        className={`block flex-none rounded-full bg-[#2a2a2a] object-cover ${className}`}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={`flex flex-none items-center justify-center rounded-full bg-[#e50914] font-bold uppercase text-white [text-shadow:none] ${className}`}
    >
      {Array.from(w.name.trim())[0] ?? "?"}
    </span>
  );
}

// โลโก้แปะเป็นเทปที่มุม (className = ตำแหน่ง/การหมุน)
function LogoTape({ className, imgClassName }: { className: string; imgClassName: string }) {
  return (
    <div aria-hidden className={`pd-tape pointer-events-none absolute z-20 ${className}`}>
      <div className="pd-tape-in">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={LOGO_SRC} alt="" draggable={false} className={`block w-auto object-contain ${imgClassName}`} />
      </div>
    </div>
  );
}

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

/* ---------- เสียงจากไฟล์ของผู้ใช้ (public/sound) ---------- */
const SPIN_SRC = "/sound/spin.mp3"; // เสียงตอนสุ่ม (วนลูปจนเลขหลักสุดท้ายหยุด)
const NUMBER_SRC = "/sound/number.mp3"; // เสียงตอนเลขหยุดทีละหลัก
const VICTORY_SRC = "/sound/victory.mp3"; // เสียงตอนสุ่มครบทุกหลักแล้ว (ประกาศผู้ถูกรางวัล)

let spinAudio: HTMLAudioElement | null = null;
function prepareSpin() {
  if (typeof window === "undefined") return;
  if (!spinAudio) {
    spinAudio = new Audio(SPIN_SRC);
    spinAudio.loop = true;
    spinAudio.preload = "auto";
  }
}
function playSpin() {
  prepareSpin();
  if (!spinAudio) return;
  try {
    spinAudio.currentTime = 0;
  } catch {
    /* ยังโหลดไม่เสร็จ เล่นจากต้นอยู่แล้ว */
  }
  void spinAudio.play().catch(() => {});
}
function stopSpin() {
  if (!spinAudio) return;
  spinAudio.pause();
  try {
    spinAudio.currentTime = 0;
  } catch {
    /* ไม่เป็นไร */
  }
}
function playNumber() {
  if (typeof window === "undefined") return;
  const a = new Audio(NUMBER_SRC); // สร้างใหม่ทุกครั้ง เสียงซ้อนกันได้ถ้าเลขหยุดถี่
  void a.play().catch(() => {});
}

let victoryAudio: HTMLAudioElement | null = null;
function prepareVictory() {
  if (typeof window === "undefined") return;
  if (!victoryAudio) {
    victoryAudio = new Audio(VICTORY_SRC);
    victoryAudio.preload = "auto";
  }
}
function playVictory() {
  prepareVictory();
  if (!victoryAudio) return;
  try {
    victoryAudio.currentTime = 0;
  } catch {
    /* ยังโหลดไม่เสร็จ เล่นจากต้นอยู่แล้ว */
  }
  void victoryAudio.play().catch(() => {});
}
function stopVictory() {
  if (!victoryAudio) return;
  victoryAudio.pause();
  try {
    victoryAudio.currentTime = 0;
  } catch {
    /* ไม่เป็นไร */
  }
}

/* ---------- เอฟเฟคเสียงสังเคราะห์ (WebAudio ไม่ต้องใช้ไฟล์เสียง) ---------- */
let audioCtx: AudioContext | null = null;
function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    try {
      audioCtx = new AC();
    } catch {
      return null;
    }
  }
  if (audioCtx.state === "suspended") void audioCtx.resume().catch(() => {});
  return audioCtx;
}

function tone(freq: number, dur: number, o: { type?: OscillatorType; vol?: number; at?: number; to?: number } = {}) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + (o.at ?? 0);
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = o.type ?? "sine";
  osc.frequency.setValueAtTime(freq, t);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(o.vol ?? 0.2, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g);
  g.connect(c.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noise(dur: number, o: { vol?: number; at?: number; freq?: number; sweepTo?: number } = {}) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + (o.at ?? 0);
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = "bandpass";
  f.Q.value = 0.8;
  f.frequency.setValueAtTime(o.freq ?? 2000, t);
  if (o.sweepTo) f.frequency.exponentialRampToValueAtTime(o.sweepTo, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(o.vol ?? 0.2, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f);
  f.connect(g);
  g.connect(c.destination);
  src.start(t);
  src.stop(t + dur + 0.02);
}

const sfx = {
  // ค้อนเหวี่ยง
  swing() {
    noise(0.38, { vol: 0.16, freq: 400, sweepTo: 3200 });
  },
  // ค้อนกระทบปุ่ม ปุ่มแตก
  hit() {
    tone(180, 0.38, { type: "sine", vol: 0.55, to: 35 });
    noise(0.28, { vol: 0.5, freq: 1800, sweepTo: 600 });
    tone(950, 0.14, { type: "square", vol: 0.12, to: 200 });
    noise(0.5, { vol: 0.14, at: 0.08, freq: 5200 }); // เสียงเศษกระจาย
  },
  // การ์ดเลื่อนลอยไปรายชื่อ
  whoosh() {
    noise(0.6, { vol: 0.14, freq: 2500, sweepTo: 300 });
  },
  // ไฟรั่ว: level ยิ่งสูงยิ่งดัง (หลักท้าย ๆ แรงกว่าหลักแรก)
  zap(level: number) {
    noise(0.22, { vol: 0.08 + level * 0.025, freq: 6500, sweepTo: 900 });
    tone(140 + level * 30, 0.18, { type: "sawtooth", vol: 0.05 + level * 0.015, to: 60 });
  },
  // แถวเด้งเข้ารายชื่อ
  pop() {
    tone(300, 0.18, { type: "sine", vol: 0.3, to: 700 });
    tone(880, 0.14, { type: "triangle", vol: 0.16, at: 0.12 });
  },
};

export default function SpinPage() {
  const [gate, setGate] = useState<Gate>("loading");
  const [note, setNote] = useState("");
  const [pw, setPw] = useState("");
  const [pwErr, setPwErr] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pool, setPool] = useState<PoolTicket[]>([]);
  const [total, setTotal] = useState(0);
  const [winners, setWinners] = useState<Winner[]>([]);
  const [digits, setDigits] = useState<string[]>(Array(EMP_LEN).fill("-"));
  const [stopped, setStopped] = useState<boolean[]>(Array(EMP_LEN).fill(false));
  const [spinning, setSpinning] = useState(false);
  const [winner, setWinner] = useState<Winner | null>(null);
  const [goldFlash, setGoldFlash] = useState(false);
  const [hiddenCodes, setHiddenCodes] = useState<string[]>([]); // แถวผู้ถูกรางวัลที่ซ่อนไว้ รอการ์ดลอยมาถึง
  const [popCodes, setPopCodes] = useState<string[]>([]); // แถวที่เพิ่งโผล่ (เด้งเข้ารายชื่อ)
  const [shake, setShake] = useState(false); // จอสั่นตอนผลออก
  const [winnerClosing, setWinnerClosing] = useState(false); // กำลังเล่นแอนิเมชันเลื่อนการ์ดผู้ถูกรางวัลลง
  const [hammer, setHammer] = useState(false);
  const [quake, setQuake] = useState(false);
  const [zoom, setZoom] = useState(false); // ซูมเข้าหาตัวเลขตอนสุ่ม
  const [zoomT, setZoomT] = useState({ x: 0, y: 0, ox: 50, oy: 36 }); // ตำแหน่งเลื่อนตัวเลขเข้ากลางจอ + จุดซูม
  const [batch, setBatch] = useState(1); // สุ่มทีเดียวกี่คน (ตั้งค่าที่ปุ่มเฟืองข้างปุ่มเริ่มสุ่ม)
  const [showSettings, setShowSettings] = useState(false);
  const [batchWin, setBatchWin] = useState<Winner[]>([]); // ผู้ถูกรางวัลรอบล่าสุด (หลายคนถ้าตั้งค่าไว้)
  const [heat, setHeat] = useState(0); // ระดับความแรงของเครื่องตอนสุ่ม 0–7 (ยิ่งหลักหลัง ยิ่งสั่นแรง + ไฟรั่วเยอะ)
  const [kick, setKick] = useState(0); // นับครั้งที่เครื่องสะดุ้ง (สลับ class เพื่อเริ่มแอนิเมชันใหม่ทุกครั้ง)
  const [zapOn, setZapOn] = useState(false); // ไฟรั่วโชว์แวบเดียวตามจังหวะสั่น
  const zapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fxRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const winRef = useRef<HTMLDivElement>(null); // หน้าต่างตัวเลข
  const rowRef = useRef<HTMLDivElement>(null); // กล่องตู้ทั้งตัว (ใช้คำนวณซูม)
  const fwRaf = useRef(0);
  const winnerCardRef = useRef<HTMLElement>(null); // การ์ดทองลอยประกาศผู้ถูกรางวัล
  const winnerListRef = useRef<HTMLElement>(null); // กล่องรายชื่อผู้ถูกรางวัล (จุดที่การ์ดลอยเข้าไป)
  const confettiRef = useRef<HTMLCanvasElement>(null); // แคนวาสกระดาษทอง (แยกจากพลุ จะได้ไม่มีรอยหาง)
  const cfRaf = useRef(0);
  const fwActive = useRef(false); // true = พลุยิงต่อเรื่อย ๆ จนกว่าจะปิดการ์ดผู้ถูกรางวัล

  // รีเฟรชสด: ไม่เขียนทับตอนกำลังสุ่ม และทิ้งผลที่ขอไว้ก่อนเริ่ม/จบการสุ่ม (กันตั๋วที่ถูกตัดแล้วกลับมาในโหล)
  const spinningRef = useRef(false);
  const seqRef = useRef(0);
  // ตั๋วที่อยู่ในโหลตอนเปิดหน้า: หล่นตามจังหวะสุ่ม / ตั๋วที่เพิ่งเข้ามาทีหลังหล่นทันที
  const initialRef = useRef<Set<string> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/spin", { cache: "no-store" });
      // ยังไม่กรอกรหัส admin (หรือหมดอายุ 12 ชั่วโมง) → หน้ากรอกรหัส
      if (res.status === 401 || res.status === 403) return setGate("locked");
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
      if (res.status === 401 || res.status === 403) {
        if (!spinningRef.current) setGate("locked"); // cookie หมดอายุระหว่างเปิดหน้า
        return;
      }
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

  // โหลดไฟล์เสียงไว้ล่วงหน้า จะได้เล่นทันทีตอนกดสุ่ม
  useEffect(() => {
    prepareSpin();
    prepareVictory();
    const n = new Audio(NUMBER_SRC);
    n.preload = "auto";
  }, []);

  // ล้าง timer / animation ตอนออกจากหน้า
  useEffect(() => {
    const timers = timersRef;
    const fx = fxRef;
    return () => {
      timers.current.forEach(clearTimeout);
      fx.current.forEach(clearTimeout);
      stopSpin();
      stopVictory();
      fwActive.current = false;
      cancelAnimationFrame(fwRaf.current);
      cancelAnimationFrame(cfRaf.current);
    };
  }, []);

  // กด F สลับโหมดเต็มหน้าจอ (เหมือน F11)
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

  // ไม่ขยับเมาส์ CURSOR_HIDE_MS แล้วซ่อนเมาส์ (ขยับเมื่อไหร่โผล่กลับมา)
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
        await load();
      }
    } catch {
      setPwErr("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้");
    }
    setPwBusy(false);
  }

  /* ---------- พลุ ---------- */
  const fireworks = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    cancelAnimationFrame(fwRaf.current);
    fwActive.current = true;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = window.innerWidth;
    const H = window.innerHeight;
    cv.width = W * dpr;
    cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    type P = { x: number; y: number; vx: number; vy: number; life: number; color: string };
    const ps: P[] = [];
    const colors = ["#ffd54a", "#ff4d4d", "#4dd2ff", "#7dff6b", "#ff7ad9", "#ffffff", "#ffb300"];
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

      if (fwActive.current && t >= nextBurst) {
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

      if (fwActive.current || ps.length > 0) fwRaf.current = requestAnimationFrame(frame);
      else {
        ctx.globalCompositeOperation = "source-over";
        ctx.clearRect(0, 0, W, H);
      }
    };
    fwRaf.current = requestAnimationFrame(frame);
  }, []);

  /* ---------- พลุกระดาษสีทอง ---------- */
  // ยิงจากมุมล่างซ้าย/ขวา + กลางจอ แล้วโปรยจากด้านบนต่อเรื่อย ๆ จนกว่าจะปิดการ์ดผู้ถูกรางวัล (fwActive = false)
  const confetti = useCallback(() => {
    const cv = confettiRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    cancelAnimationFrame(cfRaf.current);

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = window.innerWidth;
    const H = window.innerHeight;
    cv.width = W * dpr;
    cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    type C = { x: number; y: number; vx: number; vy: number; w: number; h: number; rot: number; vr: number; ph: number; color: string };
    const ps: C[] = [];
    const colors = ["#ffd54a", "#ffc83d", "#ffe27a", "#fff3b0", "#e0a010", "#b8860b", "#fff6c9"];
    const spawn = (x: number, y: number, vx: number, vy: number) =>
      ps.push({
        x,
        y,
        vx,
        vy,
        w: 6 + Math.random() * 8,
        h: 10 + Math.random() * 10,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.35,
        ph: Math.random() * Math.PI * 2,
        color: colors[Math.floor(Math.random() * colors.length)],
      });

    for (let i = 0; i < 90; i++) {
      spawn(W * 0.02, H * 0.95, 6 + Math.random() * 9, -(12 + Math.random() * 12));
      spawn(W * 0.98, H * 0.95, -(6 + Math.random() * 9), -(12 + Math.random() * 12));
    }
    for (let i = 0; i < 60; i++) spawn(W * 0.5, H * 0.3, (Math.random() - 0.5) * 16, -(4 + Math.random() * 10));

    let nextRain = 0;
    const frame = (t: number) => {
      ctx.clearRect(0, 0, W, H);
      if (fwActive.current && t >= nextRain) {
        for (let k = 0; k < 4; k++) spawn(Math.random() * W, -20, (Math.random() - 0.5) * 2, 1 + Math.random() * 2);
        nextRain = t + 60;
      }
      for (let i = ps.length - 1; i >= 0; i--) {
        const c = ps[i];
        c.vx *= 0.992;
        c.vy = Math.min(c.vy + 0.22, 5);
        c.x += c.vx + Math.sin(c.ph) * 0.6;
        c.y += c.vy;
        c.rot += c.vr;
        c.ph += 0.08;
        if (c.y > H + 30) {
          ps.splice(i, 1);
          continue;
        }
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.rotate(c.rot);
        ctx.scale(1, Math.cos(c.ph * 1.3)); // พลิกวูบวาบเหมือนกระดาษ
        ctx.fillStyle = c.color;
        ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
        ctx.restore();
      }
      if (fwActive.current || ps.length > 0) cfRaf.current = requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, W, H);
    };
    cfRaf.current = requestAnimationFrame(frame);
  }, []);

  /* ---------- สุ่ม ---------- */
  // เครื่องสะดุ้งแวบเดียว + ไฟรั่ว (level ยิ่งสูงยิ่งแรง)
  function kickMachine(level: number) {
    setHeat(level);
    setKick((n) => n + 1);
    setZapOn(true);
    if (zapTimer.current) clearTimeout(zapTimer.current);
    zapTimer.current = setTimeout(() => setZapOn(false), 750);
  }

  function finish(ws: Winner[], remaining: number) {
    const w = ws[0];
    spinningRef.current = false;
    seqRef.current += 1;
    stopSpin(); // เลขหลักสุดท้ายหยุดแล้ว หยุดเสียงสุ่ม
    setSpinning(false);
    // ผลออกแล้ว: ค่อย ๆ ซูมกลับเป็นปกติอย่างนุ่มนวล
    timersRef.current.push(setTimeout(() => setZoom(false), 900));
    setWinner(w);
    setBatchWin(ws);
    setHiddenCodes(ws.map((x) => x.code)); // ซ่อนแถวไว้ก่อน จนกว่าการ์ดจะลอยมาถึงรายชื่อ
    setPopCodes([]);
    setPool((p) => p.filter((t) => !ws.some((x) => x.code === t.code))); // ตัดตั๋วที่ถูกออกจากโหล
    setTotal(remaining);
    setWinners((prev) => [...[...ws].reverse(), ...prev]); // รายชื่อเรียงใหม่สุดก่อน (คนที่สุ่มได้ทีหลังอยู่บน)
    setWinnerClosing(false);
    fireworks(); // พลุ + หน้าจอทองค้างอยู่จนกว่าจะกดปิดการ์ด (closeWinner)
    confetti(); // กระดาษสีทอง
    playVictory(); // เสียงประกาศผู้ถูกรางวัล (victory.mp3)
    setShake(true); // ผลออกปุ๊บ จอสั่น
    timersRef.current.push(setTimeout(() => setShake(false), 1300));
    setGoldFlash(true);
  }

  // ปิดการ์ดผู้ถูกรางวัล: หยุดยิงพลุ แล้วการ์ดลอยเข้าไปที่รายชื่อผู้ถูกรางวัล (เด้งเล็กน้อย) พร้อมจางหน้าจอทอง
  function closeWinner() {
    if (winnerClosing || !winner) return;
    fwActive.current = false;
    sfx.whoosh();
    const codes = batchWin.length > 0 ? batchWin.map((x) => x.code) : [winner.code];
    const card = winnerCardRef.current;
    const list = winnerListRef.current;
    if (card && list) {
      // วัดตำแหน่งการ์ดกับกล่องรายชื่อ แล้วส่งระยะ/ขนาดปลายทางให้แอนิเมชัน pdCardFly ผ่านตัวแปร CSS
      const c = card.getBoundingClientRect();
      const l = list.getBoundingClientRect();
      const tx = l.left + l.width / 2;
      const ty = l.top + Math.min(70, l.height / 2);
      const fs = Math.min(0.5, Math.max(0.15, (l.width * 0.7) / c.width));
      card.style.setProperty("--fx", `${tx - (c.left + c.width / 2)}px`);
      card.style.setProperty("--fy", `${ty - (c.top + c.height / 2)}px`);
      card.style.setProperty("--fs", String(fs));
    }
    setWinnerClosing(true);
    timersRef.current.push(
      // การ์ดลอยมาถึง: แถวของผู้ถูกรางวัลเด้งขึ้นในรายชื่อ
      setTimeout(() => {
        setHiddenCodes([]);
        setPopCodes(codes);
        sfx.pop();
      }, 640),
      setTimeout(() => {
        setWinner(null);
        setGoldFlash(false);
        setWinnerClosing(false);
      }, 950),
    );
  }

  async function spin() {
    if (spinning || total === 0) return;
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    fwActive.current = false;
    stopVictory(); // กันเสียงชนะรอบก่อนค้างอยู่
    setWinnerClosing(false);
    setHiddenCodes([]);
    setPopCodes([]);
    setShake(false);
    setShowSettings(false);
    cancelAnimationFrame(fwRaf.current);
    cancelAnimationFrame(cfRaf.current);
    confettiRef.current?.getContext("2d")?.clearRect(0, 0, confettiRef.current.width, confettiRef.current.height);
    canvasRef.current?.getContext("2d")?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

    setNote("");
    setWinner(null);
    setBatchWin([]);
    setGoldFlash(false);
    spinningRef.current = true;
    seqRef.current += 1;
    setSpinning(true);
    playSpin(); // เสียงสุ่ม (spin.mp3) วนลูป
    // วัดตำแหน่งตัวเลขก่อนซูม แล้วเลื่อนให้ตัวเลขมาอยู่กลางจอ
    const wEl = winRef.current;
    const rEl = rowRef.current;
    if (wEl && rEl) {
      const a = wEl.getBoundingClientRect();
      const b = rEl.getBoundingClientRect();
      const cx = a.left + a.width / 2;
      const cy = a.top + a.height / 2;
      setZoomT({
        x: window.innerWidth / 2 - cx,
        y: window.innerHeight * ZOOM_CENTER_Y - cy,
        ox: ((cx - b.left) / b.width) * 100,
        oy: ((cy - b.top) / b.height) * 100,
      });
    }
    setZoom(true);
    setHeat(0);
    setKick(0);
    setZapOn(false);
    setStopped(Array(EMP_LEN).fill(false));

    // เซิร์ฟเวอร์เลือกผู้ถูกรางวัลและตัดตั๋วออกจากโหลก่อน ฝั่งหน้าเว็บแค่เล่นแอนิเมชันให้ตรงผล
    const t0 = Date.now();
    const want = Math.max(1, Math.min(batch, MAX_BATCH, total)); // จำนวนที่ตั้งค่าไว้ (ไม่เกินตั๋วที่เหลือในโหล)
    const res = await fetch("/api/spin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ count: want }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};

    if (!res || !res.ok) {
      spinningRef.current = false;
      seqRef.current += 1;
      stopSpin();
      setSpinning(false);
      setZoom(false);
      setHeat(0);
      setDigits(Array(EMP_LEN).fill("-"));
      setNote(data.error ?? "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง");
      if (res?.status === 401 || res?.status === 403) setGate("locked");
      if (res?.status === 404) load();
      return;
    }

    // เซิร์ฟเวอร์ส่ง winners (หลายคน) มา / เผื่อเวอร์ชันเก่าส่ง winner คนเดียว
    const list: Winner[] = Array.isArray(data.winners) && data.winners.length > 0 ? data.winners : [data.winner as Winner];
    const w = list[0];
    // รหัสต่ำกว่า EMP_LEN หลัก: เติม x ด้านหน้า (เลขชิดขวา) เช่น 12345 → xx12345
    const shownCode = String(w.empCode ?? "")
      .slice(-EMP_LEN)
      .padStart(EMP_LEN, "x");
    const remaining = Number(data.remaining ?? 0);
    // ให้ตัวเลขสปินครบ FIRST_STOP_MS (นับจากกดเริ่ม) ก่อนเริ่มหยุดหลักแรก
    const wait = Math.max(0, FIRST_STOP_MS - (Date.now() - t0));

    // สุ่มหลายคน: เครื่องทำงานรวดเดียวแรงขึ้นเรื่อย ๆ แล้ว "ตู้ม" ทุกหลักหยุดพร้อมกัน โชว์ทุกรายชื่อทีเดียว
    if (list.length > 1) {
      const left = Math.max(0, BATCH_SPIN_MS - (Date.now() - t0));
      // ใกล้ออกผล: เครื่องโยกแรงขึ้นเป็นช่วง ๆ + ไฟรั่ว
      [0.55, 0.7, 0.82, 0.92].forEach((f, k) => {
        timersRef.current.push(
          setTimeout(() => {
            sfx.zap(k + 2);
            kickMachine(k + 2);
          }, left * f),
        );
      });
      timersRef.current.push(
        setTimeout(() => {
          sfx.hit();
          sfx.zap(EMP_LEN);
          playNumber();
          kickMachine(EMP_LEN); // สั่นแวบเดียวตอนตู้ม
          setDigits(Array(EMP_LEN).fill("x")); // หลายคน: ไม่โชว์รหัสคนใดคนหนึ่ง
          setStopped(Array(EMP_LEN).fill(true));
          finish(list, remaining);
        }, left),
      );
      return;
    }

    // หยุดทีละหลักจากซ้ายไปขวา
    for (let i = 0; i < EMP_LEN; i++) {
      timersRef.current.push(
        setTimeout(
          () => {
            playNumber(); // เสียงเลขหยุด (number.mp3) ทุกหลัก
            kickMachine(i + 1); // หลักที่หยุดยิ่งหลังยิ่งสั่นแรงขึ้น (สั่นแวบเดียว) + ไฟรั่ว
            sfx.zap(i + 1);
            setDigits((prev) => {
              const n = [...prev];
              n[i] = shownCode[i] ?? "x"; // ช่องที่ไม่มีเลข (รหัสสั้นกว่า 7 หลัก) = x
              return n;
            });
            setStopped((prev) => {
              const n = [...prev];
              n[i] = true;
              return n;
            });
            if (i === EMP_LEN - 1) finish([w], remaining);
          },
          wait + i * STEP_MS,
        ),
      );
    }
  }

  // กดเริ่มสุ่ม: ค้อนทุบปุ่ม → จอสั่น + ปุ่มหักเป็น 2 ท่อน → เริ่มสุ่ม (ปุ่มกลับเป็นปกติเมื่อสุ่มเสร็จ)
  function pressSpin() {
    if (spinning || hammer || total === 0) return;
    fxRef.current.forEach(clearTimeout);
    prepareSpin(); // เตรียมไฟล์เสียงตอนผู้ใช้กด (ผ่านนโยบาย autoplay ของเบราว์เซอร์)
    prepareVictory();
    sfx.swing(); // สร้าง/ปลุก AudioContext ตอนผู้ใช้กด + เสียงค้อนเหวี่ยง
    setHammer(true);
    fxRef.current = [
      setTimeout(() => {
        sfx.hit();
        setQuake(true);
        spin();
      }, HIT_MS),
      setTimeout(() => setQuake(false), HIT_MS + 860),
      setTimeout(() => setHammer(false), 1100),
    ];
  }

  // กด Space: ยังไม่มีผู้ถูกรางวัล = เริ่มสุ่ม / ผลออกแล้ว = ปิดการ์ดผู้ถูกรางวัล (พิธีกรไม่ต้องแตะเมาส์)
  // (ไม่ใส่ deps เพื่อให้ได้ state ล่าสุดทุกครั้งที่เรนเดอร์)
  useEffect(() => {
    const isTyping = (el: HTMLElement | null) =>
      !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Escape" && showSettings) {
        setShowSettings(false);
        return;
      }
      if (e.code !== "Space") return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTyping(e.target as HTMLElement | null)) return;
      e.preventDefault(); // กันหน้าเลื่อน / กันปุ่มที่โฟกัสอยู่ถูกกดซ้ำ
      if (e.repeat || gate !== "ok") return;
      if (showSettings) {
        setShowSettings(false); // กด Space ตอนเปิดหน้าตั้งค่า = ปิดหน้าตั้งค่า (ไม่เริ่มสุ่ม)
        return;
      }
      (document.activeElement as HTMLElement | null)?.blur?.();
      if (winner && !spinning) {
        if (!winnerClosing) closeWinner();
      } else if (!winner && !spinning) {
        pressSpin();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== "Space" || isTyping(e.target as HTMLElement | null)) return;
      e.preventDefault(); // Firefox กดปุ่มด้วย Space ตอนปล่อยปุ่ม
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  });

  // แสดงตั๋วล่าสุด SHOW_MAX ใบ (ตั๋วที่เพิ่งเข้าโหลอยู่ท้ายรายการ จึงเห็นตอนหล่นลงมา)
  const shown = useMemo(() => pool.slice(-SHOW_MAX), [pool]);

  const shell = `min-h-screen overflow-x-clip bg-[#141414] text-white [color-scheme:dark] ${appFont.className}`;

  if (gate === "locked") {
    return (
      <div className={shell}>
        <main className="mx-auto max-w-md px-5 py-16 text-center">
          <h1 className="text-2xl font-bold">Lucky Draw</h1>
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
              {pwBusy ? "กำลังตรวจสอบ..." : "เข้าสู่หน้าสุ่มรางวัล"}
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
          <h1 className="text-2xl font-bold">Lucky Draw</h1>
          <p className="mt-3 text-sm text-white/60">{note || "กำลังโหลด..."}</p>
        </main>
      </div>
    );
  }

  const idle = !spinning && !winner;
  const maxBatch = Math.max(1, Math.min(MAX_BATCH, total));
  const spinLabel = spinning
    ? "กำลังสุ่ม..."
    : winner
      ? "สุ่มรอบถัดไป"
      : batch > 1
        ? `สุ่ม ${Math.min(batch, maxBatch)} คน`
        : "เริ่มสุ่ม";
  const btnLabel = total === 0 ? "โหลว่างเปล่า" : spinLabel;
  const latest = winners[0] ?? null; // ผู้ถูกรางวัลล่าสุด (แสดงบนตู้หลังปิดการ์ด)

  return (
    <div className={`${shell} pd-room flex flex-col lg:h-screen lg:overflow-hidden`}>
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
        @keyframes pdSlideUp {
          0% { transform: translateY(140%); opacity: 0; }
          100% { transform: translateY(0); opacity: 1; }
        }
        @keyframes pdLive {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.25; }
        }
        @keyframes pdBulb {
          0%, 100% { background: #fff0a0; box-shadow: 0 0 10px 3px rgba(255, 225, 100, 0.95); }
          50% { background: #5a3a00; box-shadow: none; }
        }
        @keyframes pdLamp {
          0%, 100% { filter: brightness(1.25); }
          50% { filter: brightness(0.55); }
        }
        @keyframes pdJackpot {
          0%, 100% { filter: brightness(1); }
          50% { filter: brightness(1.3); }
        }

        .pd-room { background-color: #10131c; --pd-side: #172848; }

        /* ซ่อนเมาส์เมื่อไม่ขยับเกิน 5 วินาที (ใส่ class ที่ body) */
        .pd-nocursor,
        .pd-nocursor * { cursor: none !important; }

        /* ===== พื้นหลังเบลอ: ไฟร้านอาหารด้านหลัง (อยู่หลังทุกส่วน คลิกทะลุได้) ===== */
        .pd-bokeh {
          position: fixed;
          inset: 0;
          z-index: 0;
          overflow: hidden;
          pointer-events: none;
          background:
            radial-gradient(ellipse at 50% 0%, #3d1c14 0%, #1d0e13 45%, #0b0a12 100%);
        }
        .pd-bokeh::after {
          content: "";
          position: absolute;
          inset: 0;
          background: radial-gradient(ellipse at 50% 50%, rgba(0, 0, 0, 0) 40%, rgba(5, 4, 10, 0.65) 100%);
        }
        .pd-bokeh-dot {
          position: absolute;
          border-radius: 50%;
          filter: blur(12px);
          animation: pdBokeh 4.5s ease-in-out infinite alternate;
        }
        @keyframes pdBokeh {
          from { transform: scale(0.88); }
          to { transform: scale(1.12); }
        }

        /* ===== สไตล์ 2 มิติ เงาแข็งด้านล่าง: แดง / ทอง / กรมท่า ===== */
        .pd-gold {
          background: #ffc83d;
          box-shadow: inset 0 3px 0 rgba(255, 255, 255, 0.5), inset 0 -3px 0 rgba(178, 125, 0, 0.55), 0 6px 0 #b27d00;
        }
        /* หัวตู้: ทองนูน + ความหนาด้านข้างซ้าย (สีเดียวกันทั้งหมด ผ่านตัวแปร --pd-side) */
        .pd-crown {
          box-shadow: inset 0 3px 0 rgba(255, 255, 255, 0.5), inset 0 -3px 0 rgba(178, 125, 0, 0.55), 0 6px 0 #b27d00,
            -4px 10px 0 var(--pd-side), -8px 14px 0 var(--pd-side), -12px 18px 0 var(--pd-side), -16px 22px 0 var(--pd-side),
            -20px 26px 0 var(--pd-side), -24px 30px 0 var(--pd-side), -28px 34px 0 var(--pd-side), -32px 38px 0 var(--pd-side),
            -36px 42px 0 var(--pd-side), -40px 46px 0 var(--pd-side), -44px 50px 0 var(--pd-side), -48px 54px 0 var(--pd-side),
            -52px 58px 0 var(--pd-side), -56px 62px 0 var(--pd-side), -60px 66px 0 var(--pd-side), -64px 70px 0 var(--pd-side);
        }
        /* ตัวตู้สีแดง นูน + ความหนาด้านข้างซ้าย (สีเดียวกันทั้งหมด) */
        .pd-body {
          background: #e0243c;
          border: 4px solid #8f0f1a;
          box-shadow: inset 0 6px 0 rgba(255, 255, 255, 0.2), inset 0 -12px 0 rgba(0, 0, 0, 0.22), 0 8px 0 #8f0f1a,
            -4px 12px 0 var(--pd-side), -8px 16px 0 var(--pd-side), -12px 20px 0 var(--pd-side), -16px 24px 0 var(--pd-side),
            -20px 28px 0 var(--pd-side), -24px 32px 0 var(--pd-side), -28px 36px 0 var(--pd-side), -32px 40px 0 var(--pd-side),
            -36px 44px 0 var(--pd-side), -40px 48px 0 var(--pd-side), -44px 52px 0 var(--pd-side), -48px 56px 0 var(--pd-side),
            -52px 60px 0 var(--pd-side), -56px 64px 0 var(--pd-side), -60px 68px 0 var(--pd-side), -64px 72px 0 var(--pd-side);
        }
        /* เลขในวงล้อ: กล่องนูนเหมือนปุ่ม */
        .pd-reel {
          background: linear-gradient(180deg, #ffffff, #e8ecf4);
          border: 2px solid #f4f6fb;
          box-shadow: inset 0 3px 0 #ffffff, inset 0 -6px 0 #c9d0dc, -9px 0 0 #7b8499;
        }
        .pd-ticket {
          box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.25), 0 3px 0 #3a0a10;
        }
        /* ป้ายหัวตู้ */
        .pd-marquee {
          background: #3a0d16;
          box-shadow: inset 0 -6px 0 rgba(0, 0, 0, 0.35);
        }
        .pd-title {
          color: #ffe27a;
          text-shadow: -0.05em 0 0 #e0243c;
        }
        .pd-plate-green {
          background: #58cc02;
          box-shadow: inset 0 3px 0 rgba(255, 255, 255, 0.4), inset 0 -3px 0 rgba(0, 0, 0, 0.2), -8px 0 0 #3a8f00;
        }
        .pd-bezel {
          background: #0a1122;
          box-shadow: inset 0 6px 0 rgba(0, 0, 0, 0.5);
        }
        .pd-drum { box-shadow: inset 0 -6px 0 rgba(0, 0, 0, 0.14); }
        .pd-digit { font-size: clamp(1.4rem, 7vw, 3.4rem); }
        @media (min-width: 1024px) {
          .pd-digit { font-size: clamp(2.2rem, 3.8vw, 5rem); }
        }
        .pd-tray {
          background: #2a0a12;
          box-shadow: inset 0 6px 0 rgba(0, 0, 0, 0.45);
        }
        @keyframes pdShine {
          0% { left: -45%; }
          55%, 100% { left: 125%; }
        }
        @keyframes pdBtnPulse {
          0%, 100% { filter: brightness(1) saturate(1); }
          50% { filter: brightness(1.22) saturate(1.25); }
        }
        @keyframes pdLand {
          0% { transform: translateY(-115%); }
          55% { transform: translateY(9%); }
          72% { transform: translateY(-4%); }
          86% { transform: translateY(2%); }
          100% { transform: translateY(0); }
        }
        @keyframes pdFlash {
          0% { transform: scale(0.2); opacity: 1; }
          100% { transform: scale(1.7); opacity: 0; }
        }
        .pd-btn-red {
          background: linear-gradient(180deg, #ff7a7a 0%, #ff4b4b 48%, #ea3434 100%);
          color: #fff;
          letter-spacing: 0.05em;
          text-shadow: 0 2px 0 #c0262d;
          box-shadow: inset 0 4px 0 rgba(255, 255, 255, 0.4), inset 0 -4px 0 rgba(0, 0, 0, 0.18), -12px 0 0 #b01e26;
          transition: transform 0.15s, box-shadow 0.06s, filter 0.15s;
        }
        .pd-btn-red:not(:disabled) { animation: pdBtnPulse 1.3s ease-in-out infinite; }
        /* แสงวิบวับพาดผ่านปุ่ม */
        .pd-btn-red:not(:disabled)::before {
          content: "";
          position: absolute;
          top: -20%;
          bottom: -20%;
          left: -45%;
          width: 28%;
          background: linear-gradient(100deg, transparent, rgba(255, 255, 255, 0.8), transparent);
          transform: skewX(-20deg);
          pointer-events: none;
          animation: pdShine 2.2s ease-in-out infinite;
        }
        /* ประกายดาวกระพริบ */
        .pd-btn-red:not(:disabled)::after {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          background-image:
            radial-gradient(circle at 12% 30%, #fff 0 2px, transparent 3px),
            radial-gradient(circle at 80% 65%, #fff 0 2px, transparent 3px),
            radial-gradient(circle at 55% 25%, #ffe9a3 0 1.5px, transparent 2.5px),
            radial-gradient(circle at 30% 75%, #fff 0 1.5px, transparent 2.5px),
            radial-gradient(circle at 92% 28%, #fff 0 1.5px, transparent 2.5px);
          animation: pdTwinkle 0.8s ease-in-out infinite alternate;
        }
        .pd-btn-red:hover:not(:disabled) {
          transform: scale(1.1);
          filter: brightness(1.08);
        }
        .pd-btn-red:active:not(:disabled) {
          transform: translateX(-10px) scale(1.1);
          box-shadow: inset 0 4px 0 rgba(255, 255, 255, 0.3), inset 0 -2px 0 rgba(0, 0, 0, 0.18), -2px 0 0 #b01e26;
        }
        .pd-btn-red:disabled {
          background: #3a3a44;
          color: #8c8c96;
          text-shadow: none;
          box-shadow: inset 0 4px 0 rgba(255, 255, 255, 0.12), inset 0 -4px 0 rgba(0, 0, 0, 0.2), -12px 0 0 #26262d;
        }

        /* ===== ปุ่มหักเป็น 2 ท่อน (แสดงระหว่างสุ่ม พอสุ่มเสร็จกลับเป็นปุ่มปกติ) ===== */
        @keyframes pdSnapL {
          0% { transform: translate(0, 0) rotate(0deg); }
          100% { transform: translate(-6px, 12px) rotate(13deg); }
        }
        @keyframes pdSnapR {
          0% { transform: translate(0, 0) rotate(0deg); }
          100% { transform: translate(6px, 12px) rotate(-13deg); }
        }
        .pd-half-wrap {
          position: absolute;
          inset: 0;
          filter: drop-shadow(-7px 0 0 #b01e26);
        }
        .pd-half-l {
          transform-origin: 0% 50%;
          animation: pdSnapL 0.45s cubic-bezier(0.3, 1.5, 0.5, 1) forwards;
        }
        .pd-half-r {
          transform-origin: 100% 50%;
          animation: pdSnapR 0.45s cubic-bezier(0.3, 1.5, 0.5, 1) forwards;
        }
        .pd-half-face {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 1rem;
          color: #fff;
          letter-spacing: 0.05em;
          text-shadow: 0 2px 0 #c0262d;
          background: linear-gradient(180deg, #ff7a7a 0%, #ff4b4b 48%, #ea3434 100%);
          box-shadow: inset 0 4px 0 rgba(255, 255, 255, 0.3), inset 0 -4px 0 rgba(0, 0, 0, 0.18);
        }
        /* รอยหักหยักตรงกลาง (2 ฝั่งต้องตรงกัน) */
        .pd-half-l .pd-half-face {
          clip-path: polygon(0 0, 52% 0, 46% 22%, 57% 45%, 44% 70%, 51% 100%, 0 100%);
        }
        .pd-half-r .pd-half-face {
          clip-path: polygon(52% 0, 100% 0, 100% 100%, 51% 100%, 44% 70%, 57% 45%, 46% 22%);
        }

        /* ===== เลข 3 มิติ (ตัวเลขหนาแบบมีความลึก) ===== */
        .pd-num3d {
          color: #e5202e;
          text-shadow: -0.015em -0.015em 0 #ff9aa2, 0.02em 0.025em 0 #b8141f, 0.04em 0.05em 0 #a0121d,
            0.06em 0.075em 0 #8a0e18, 0.08em 0.1em 0 #6e0a12, 0.1em 0.125em 0 rgba(0, 0, 0, 0.3);
        }

        /* ===== ค้อนทุบปุ่ม + เศษปุ่มแตก + จอสั่น ===== */
        @keyframes pdHammer {
          0% { opacity: 0; transform: translate(150px, -160px) rotate(75deg); }
          12% { opacity: 1; transform: translate(130px, -120px) rotate(66deg); animation-timing-function: cubic-bezier(0.7, 0, 1, 0.5); }
          38% { transform: translate(0, 0) rotate(0deg); }
          46% { transform: translate(0, 10px) rotate(-2deg); }
          62% { opacity: 1; transform: translate(0, 0) rotate(0deg); }
          100% { opacity: 0; transform: translate(50px, -150px) rotate(35deg); }
        }
        @keyframes pdShard {
          0% { opacity: 1; transform: translate(-50%, -50%) rotate(0deg) scale(1); }
          100% { opacity: 0; transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy) + 60px)) rotate(var(--dr)) scale(0.6); }
        }
        @keyframes pdQuake {
          0%, 100% { transform: translate(0, 0) rotate(0deg); }
          8% { transform: translate(-22px, 14px) rotate(-1.6deg); }
          18% { transform: translate(20px, -16px) rotate(1.6deg); }
          28% { transform: translate(-18px, -12px) rotate(-1.2deg); }
          38% { transform: translate(16px, 14px) rotate(1deg); }
          50% { transform: translate(-12px, 8px) rotate(-0.7deg); }
          62% { transform: translate(9px, -7px) rotate(0.4deg); }
          76% { transform: translate(-5px, 4px); }
          90% { transform: translate(2px, -2px); }
        }
        .pd-hammer {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 150px;
          height: 260px;
          margin-left: -75px;
          margin-top: -250px;
          transform-origin: 50% 100%;
          z-index: 30;
          pointer-events: none;
          animation: pdHammer 1s linear forwards;
          filter: drop-shadow(0 0 14px rgba(255, 205, 60, 0.95)) drop-shadow(0 6px 0 rgba(0, 0, 0, 0.35));
        }
        .pd-hammer-handle {
          position: absolute;
          left: 50%;
          bottom: 64px;
          width: 22px;
          height: 170px;
          margin-left: -11px;
          border-radius: 8px;
          background:
            repeating-linear-gradient(180deg, transparent 0 18px, rgba(255, 200, 61, 0.95) 18px 22px),
            linear-gradient(90deg, #6b3d12, #b9803a 45%, #5a340f);
          box-shadow: inset 0 0 0 2px rgba(0, 0, 0, 0.25);
        }
        .pd-hammer-loop {
          position: absolute;
          left: 50%;
          top: 0;
          width: 32px;
          height: 32px;
          margin-left: -16px;
          border-radius: 50%;
          border: 5px solid #ffc83d;
          box-shadow: inset 0 0 0 2px #8a5a00;
        }
        .pd-hammer-head {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          height: 70px;
          border-radius: 10px;
          border: 4px solid #8a5a00;
          background: linear-gradient(180deg, #fff4b0 0%, #ffd54a 30%, #e0a010 70%, #a86f00 100%);
          box-shadow: inset 0 4px 0 rgba(255, 255, 255, 0.65), inset 0 -6px 0 rgba(120, 70, 0, 0.5);
        }
        .pd-hammer-head::before,
        .pd-hammer-head::after {
          content: "";
          position: absolute;
          top: 6px;
          bottom: 6px;
          width: 26px;
          border-radius: 6px;
          border: 3px solid #8a5a00;
          background: linear-gradient(180deg, #ffe27a, #c98a00);
        }
        .pd-hammer-head::before { left: 6px; }
        .pd-hammer-head::after { right: 6px; }
        .pd-flash {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 240px;
          height: 240px;
          margin: -120px 0 0 -120px;
          border-radius: 50%;
          background: radial-gradient(circle, #fffbe0 0%, #ffd54a 35%, rgba(255, 180, 0, 0) 70%);
          animation: pdFlash 0.5s ease-out forwards;
        }
        .pd-shard {
          position: absolute;
          left: 50%;
          top: 50%;
          clip-path: polygon(0 0, 100% 30%, 40% 100%);
          animation: pdShard 0.8s cubic-bezier(0.2, 0.7, 0.3, 1) forwards;
        }
        .pd-quake { animation: pdQuake 0.85s ease-out 1; }
        .pd-quake-win { animation: pdQuake 1.2s ease-out 1; }
        .pd-key { box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.5), 0 3px 0 rgba(0, 0, 0, 0.45); }
        /* แผ่นแสดงผู้ถูกรางวัลล่าสุด */
        .pd-count-plate {
          background: #2a0a12;
          box-shadow: inset 0 6px 0 rgba(0, 0, 0, 0.45);
        }
        .pd-oval {
          background: #ffc83d;
          box-shadow: inset 0 4px 0 rgba(255, 255, 255, 0.5), inset 0 -4px 0 rgba(178, 125, 0, 0.5), 0 5px 0 #b27d00;
        }
        .pd-ball {
          background: #ff4b4b;
          box-shadow: inset 3px 3px 0 rgba(255, 255, 255, 0.45), inset -3px -4px 0 rgba(0, 0, 0, 0.2), 0 5px 0 #b01e26;
        }
        .pd-stick {
          background: #cfd6e4;
          box-shadow: 3px 0 0 #8c95a8;
        }
        .pd-jar {
          background: rgba(255, 255, 255, 0.06);
          box-shadow: 0 8px 0 rgba(255, 255, 255, 0.14);
        }
        /* โลโก้แปะเป็นเทป (ขอบหยักซ้าย/ขวา เหมือนเทปกระดาษ) */
        .pd-tape {
          filter: drop-shadow(0 3px 2px rgba(0, 0, 0, 0.45));
        }
        .pd-tape-in {
          padding: 5px 16px;
          background: linear-gradient(180deg, rgba(255, 251, 232, 0.94), rgba(240, 228, 190, 0.92));
          clip-path: polygon(0 0, 4% 12%, 0 25%, 4% 38%, 0 50%, 4% 62%, 0 75%, 4% 88%, 0 100%, 100% 100%, 96% 88%, 100% 75%, 96% 62%, 100% 50%, 96% 38%, 100% 25%, 96% 12%, 100% 0);
        }
        /* ไฟกลมใต้หน้าต่างเลข */
        .pd-lamp {
          animation: pdLamp 1.2s steps(1) infinite;
          box-shadow: 0 3px 0 rgba(0, 0, 0, 0.35);
        }
        .pd-lamp-fast { animation-duration: 0.3s; }
        /* ช่องหยอดเหรียญ + ถาดรับ */
        .pd-slot {
          background: #1b0509;
          box-shadow: inset 0 4px 0 rgba(0, 0, 0, 0.6);
        }
        /* ฐานตู้ (สีเดียวกันทั้งหมด) */
        .pd-foot {
          background: #8f0f1a;
          box-shadow: inset 0 3px 0 rgba(255, 255, 255, 0.2), 0 6px 0 #4f060d, -4px 10px 0 var(--pd-side),
            -8px 14px 0 var(--pd-side), -12px 18px 0 var(--pd-side), -16px 22px 0 var(--pd-side), -20px 26px 0 var(--pd-side),
            -24px 30px 0 var(--pd-side), -28px 34px 0 var(--pd-side), -32px 38px 0 var(--pd-side), -36px 42px 0 var(--pd-side),
            -40px 46px 0 var(--pd-side), -44px 50px 0 var(--pd-side), -48px 54px 0 var(--pd-side), -52px 58px 0 var(--pd-side),
            -56px 62px 0 var(--pd-side), -60px 66px 0 var(--pd-side), -64px 70px 0 var(--pd-side);
        }

        @keyframes pdWash {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
        @keyframes pdWashOut {
          0% { opacity: 1; }
          100% { opacity: 0; }
        }
        /* การ์ดลอยเข้ารายชื่อ: เด้งขึ้นเล็กน้อย → ลอยไปถึงรายชื่อ → เด้งกลับนิดนึง → จางหาย */
        @keyframes pdCardFly {
          0% { transform: translate(0, 0) scale(1); opacity: 1; }
          14% { transform: translate(0, -14px) scale(1.06); opacity: 1; }
          68% { transform: translate(var(--fx), var(--fy)) scale(var(--fs)); opacity: 1; }
          80% { transform: translate(var(--fx), calc(var(--fy) - 12px)) scale(calc(var(--fs) * 1.1)); opacity: 1; }
          100% { transform: translate(var(--fx), var(--fy)) scale(var(--fs)); opacity: 0; }
        }
        @keyframes pdRowPop {
          0% { transform: scale(0.6); opacity: 0; }
          55% { transform: scale(1.08); opacity: 1; }
          80% { transform: scale(0.97); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes pdTwinkle {
          from { opacity: 0.1; }
          to { opacity: 1; }
        }
        .pd-wash {
          position: fixed;
          inset: 0;
          z-index: 45;
          pointer-events: none;
          background: linear-gradient(115deg, rgba(255, 196, 40, 0.5), rgba(255, 244, 170, 0.7), rgba(255, 190, 30, 0.5), rgba(255, 236, 150, 0.7), rgba(255, 196, 40, 0.5));
          background-size: 300% 100%;
          animation: pdGold 2.2s linear infinite, pdWash 0.6s ease-out forwards;
        }
        .pd-wash::before,
        .pd-wash::after {
          content: "";
          position: absolute;
          inset: 0;
        }
        .pd-wash::before {
          background-image:
            radial-gradient(circle at 20% 30%, #fff 0 2px, transparent 3px),
            radial-gradient(circle at 70% 60%, #fff8c9 0 2px, transparent 3px),
            radial-gradient(circle at 45% 80%, #fff 0 1.5px, transparent 2.5px);
          background-size: 90px 90px, 130px 130px, 70px 70px;
          animation: pdTwinkle 0.7s ease-in-out infinite alternate;
        }
        .pd-wash::after {
          background-image:
            radial-gradient(circle at 30% 70%, #fff 0 2px, transparent 3px),
            radial-gradient(circle at 80% 25%, #fffbe0 0 1.5px, transparent 2.5px),
            radial-gradient(circle at 55% 45%, #fff 0 2px, transparent 3px);
          background-size: 110px 110px, 80px 80px, 150px 150px;
          background-position: 30px 40px, 10px 60px, 70px 20px;
          animation: pdTwinkle 0.5s ease-in-out 0.3s infinite alternate;
        }
        .pd-noscroll { scrollbar-width: none; -ms-overflow-style: none; }
        .pd-noscroll::-webkit-scrollbar { display: none; }

        .pd-strip { animation: pdStrip 0.3s linear infinite; filter: blur(1.4px); will-change: transform; }
        .pd-reel-stop { animation: pdLand 0.65s cubic-bezier(0.3, 0.7, 0.4, 1) both; }
        .pd-shake { animation: pdShake 0.3s linear infinite; }
        /* เครื่องสั่นแรงขึ้นตามระดับ --amp (px) / ความถี่ --spd */
        @keyframes pdRumble {
          0%, 100% { transform: translate(0, 0) rotate(0deg); }
          20% { transform: translate(calc(var(--amp) * -1px), calc(var(--amp) * 0.4px)) rotate(calc(var(--amp) * -0.1deg)); }
          40% { transform: translate(calc(var(--amp) * 1px), calc(var(--amp) * -0.4px)) rotate(calc(var(--amp) * 0.1deg)); }
          60% { transform: translate(calc(var(--amp) * -0.7px), calc(var(--amp) * -0.5px)) rotate(calc(var(--amp) * -0.07deg)); }
          80% { transform: translate(calc(var(--amp) * 0.7px), calc(var(--amp) * 0.5px)) rotate(calc(var(--amp) * 0.07deg)); }
        }
        @keyframes pdRumbleL {
          0%, 100% { transform: translate(0, 0) rotate(0deg); }
          20% { transform: translate(calc(var(--ramp) * -1px), calc(var(--ramp) * 0.4px)) rotate(calc(var(--ramp) * -0.1deg)); }
          40% { transform: translate(calc(var(--ramp) * 1px), calc(var(--ramp) * -0.4px)) rotate(calc(var(--ramp) * 0.1deg)); }
          60% { transform: translate(calc(var(--ramp) * -0.7px), calc(var(--ramp) * -0.5px)) rotate(calc(var(--ramp) * -0.07deg)); }
          80% { transform: translate(calc(var(--ramp) * 0.7px), calc(var(--ramp) * 0.5px)) rotate(calc(var(--ramp) * 0.07deg)); }
        }
        .pd-rumble { animation: pdRumbleL var(--spd, 0.3s) linear infinite; }
        /* สะดุ้งครั้งเดียวแล้วนิ่ง (A/B สลับกันเพื่อเริ่มใหม่ทุกครั้ง) */
        @keyframes pdKickA {
          0% { transform: translate(0, 0) rotate(0deg); }
          12% { transform: translate(calc(var(--amp) * -1px), calc(var(--amp) * 0.5px)) rotate(calc(var(--amp) * -0.12deg)); }
          28% { transform: translate(calc(var(--amp) * 0.9px), calc(var(--amp) * -0.5px)) rotate(calc(var(--amp) * 0.1deg)); }
          44% { transform: translate(calc(var(--amp) * -0.6px), calc(var(--amp) * 0.3px)) rotate(calc(var(--amp) * -0.06deg)); }
          60% { transform: translate(calc(var(--amp) * 0.35px), calc(var(--amp) * -0.2px)) rotate(calc(var(--amp) * 0.03deg)); }
          80% { transform: translate(calc(var(--amp) * -0.15px), 0) rotate(0deg); }
          100% { transform: translate(0, 0) rotate(0deg); }
        }
        @keyframes pdKickB {
          0% { transform: translate(0, 0) rotate(0deg); }
          12% { transform: translate(calc(var(--amp) * -1px), calc(var(--amp) * 0.5px)) rotate(calc(var(--amp) * -0.12deg)); }
          28% { transform: translate(calc(var(--amp) * 0.9px), calc(var(--amp) * -0.5px)) rotate(calc(var(--amp) * 0.1deg)); }
          44% { transform: translate(calc(var(--amp) * -0.6px), calc(var(--amp) * 0.3px)) rotate(calc(var(--amp) * -0.06deg)); }
          60% { transform: translate(calc(var(--amp) * 0.35px), calc(var(--amp) * -0.2px)) rotate(calc(var(--amp) * 0.03deg)); }
          80% { transform: translate(calc(var(--amp) * -0.15px), 0) rotate(0deg); }
          100% { transform: translate(0, 0) rotate(0deg); }
        }
        /* สั่นเบา ๆ ต่อเนื่องไว้ข้างล่าง แล้วสะดุ้งทับครั้งเดียว จบแล้วกลับไปสั่นเบาต่อทันที ไม่นิ่ง */
        .pd-kick-a { animation: pdRumbleL var(--spd, 0.3s) linear infinite, pdKickA 0.6s ease-out 1; }
        .pd-kick-b { animation: pdRumbleL var(--spd, 0.3s) linear infinite, pdKickB 0.6s ease-out 1; }
        /* แท่นรองตู้ */
        .pd-podium {
          background: linear-gradient(180deg, #a3121f 0%, #7a0c16 55%, #4f060d 100%);
          box-shadow: inset 0 3px 0 rgba(255, 255, 255, 0.22), 0 8px 18px rgba(0, 0, 0, 0.45);
        }
        .pd-batch-wrap { animation: pdSlideUp 0.8s cubic-bezier(0.22, 0.9, 0.3, 1) both; }
        .pd-batch-wrap.pd-card-out { animation: pdCardFly 0.95s ease-in-out forwards; }
        /* ไฟรั่วออกจากตัวตู้ (กะพริบแบบสุ่มจังหวะ) */
        @keyframes pdZap {
          0%, 100% { opacity: 0; }
          8% { opacity: 1; }
          22% { opacity: 0.1; }
          38% { opacity: 1; }
          52% { opacity: 0; }
          70% { opacity: 0.9; }
          82% { opacity: 0; }
        }
        .pd-zap { animation: pdZap 0.3s steps(1) infinite; filter: drop-shadow(0 0 6px #7fd8ff) drop-shadow(0 0 14px #5ab8ff); }
        .pd-live { animation: pdLive 1.4s ease-in-out infinite; }
        .pd-bulb { animation: pdBulb 1s steps(1) infinite; }
        .pd-bulb-fast { animation-duration: 0.28s; }
        .pd-jackpot { animation: pdJackpot 0.5s ease-in-out 6; }
        .pd-gold-frame {
          background: linear-gradient(110deg, #b8860b, #ffe27a, #fff6c9, #ffd54a, #b8860b, #ffe27a, #b8860b);
          background-size: 200% 100%;
          animation: pdGold 2.2s linear infinite, pdGlow 1.4s ease-in-out infinite,
            pdSlideUp 0.8s cubic-bezier(0.22, 0.9, 0.3, 1) both;
        }
        .pd-wash-out { animation: pdGold 2.2s linear infinite, pdWashOut 0.6s ease-in forwards; }
        /* การ์ดผู้ถูกรางวัล: พื้นทองวิบวับ + เลื่อนลงตอนปิด */
        .pd-row-pop { animation: pdRowPop 0.5s cubic-bezier(0.3, 1.5, 0.5, 1) both; }
        .pd-gold-card {
          background: linear-gradient(110deg, #ffc83d, #fff3b0, #ffe27a, #ffd54a, #fff6c9, #ffc83d, #ffe27a);
          background-size: 250% 100%;
          animation: pdGold 2.4s linear infinite;
        }
        /* รายชื่อผู้ถูกรางวัล: พื้นทองเข้ม ตัวหนังสือสีทอง */
        .pd-gold-list {
          background: linear-gradient(110deg, #5e3a00, #8a5a00, #6b4200, #9a6700, #5e3a00, #8a5a00, #6b4200);
          background-size: 250% 100%;
          animation: pdGold 3.2s linear infinite;
        }
        .pd-gold-text { color: #ffe27a; text-shadow: 0 1px 0 rgba(0, 0, 0, 0.55); }
        .pd-gold-text-sub { color: #ffd54a; text-shadow: 0 1px 0 rgba(0, 0, 0, 0.55); }
        .pd-gold-frame.pd-card-out {
          animation: pdGold 2.2s linear infinite, pdGlow 1.4s ease-in-out infinite,
            pdCardFly 0.95s ease-in-out forwards;
        }
        @media (prefers-reduced-motion: reduce) {
          .pd-gold-card, .pd-gold-list, .pd-row-pop { animation: none; }
          .pd-btn-red, .pd-btn-red::before, .pd-btn-red::after, .pd-reel-stop, .pd-strip, .pd-shake, .pd-rumble, .pd-kick-a, .pd-kick-b, .pd-batch-wrap, .pd-zap, .pd-bulb, .pd-lamp, .pd-jackpot, .pd-wash, .pd-wash::before, .pd-wash::after, .pd-quake, .pd-quake-win, .pd-bokeh-dot { animation: none; }
          .pd-half-l { animation: none; transform: translate(-6px, 12px) rotate(13deg); }
          .pd-half-r { animation: none; transform: translate(6px, 12px) rotate(-13deg); }
          .pd-hammer, .pd-shard { display: none; }
          .pd-btn-red:hover:not(:disabled), .pd-btn-red:active:not(:disabled) { transform: none; }
        }
      `}</style>

      {/* ===== พื้นหลังเบลอ ไฟร้านอาหารด้านหลัง ===== */}
      <div aria-hidden className="pd-bokeh">
        {BOKEH.map((b, i) => (
          <span
            key={i}
            className="pd-bokeh-dot"
            style={{
              left: `${b.l}%`,
              top: `${b.t}%`,
              width: b.s,
              height: b.s,
              opacity: b.o,
              background: `radial-gradient(circle, ${b.c} 0%, ${b.c}66 55%, transparent 72%)`,
              animationDelay: `${b.d}s`,
            }}
          />
        ))}
      </div>

      {goldFlash && <div aria-hidden className={`pd-wash ${winnerClosing ? "pd-wash-out" : ""}`} />}

      <canvas ref={canvasRef} aria-hidden className="pointer-events-none fixed inset-0 z-50 h-full w-full" />
      <canvas ref={confettiRef} aria-hidden className="pointer-events-none fixed inset-0 z-50 h-full w-full" />

      <main
        className={`relative z-10 mx-auto flex w-full max-w-[1800px] flex-1 flex-col px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:px-5 lg:min-h-0 lg:pb-4 ${
          quake ? "pd-quake" : shake ? "pd-quake-win" : ""
        }`}
      >
        <h1 className="sr-only">Lucky Draw</h1>

        {note && (
          <p role="alert" className="flex-none text-sm font-medium text-red-500">
            {note}
          </p>
        )}

        <div className="mt-3 grid flex-1 gap-5 lg:min-h-0 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)] lg:gap-6">
          {/* ===== คอลัมน์ซ้าย: ตู้ slot ทรงสูง + คันโยกข้าง (ไม่เลื่อน) ===== */}
          <div className="pd-noscroll relative z-20 flex min-w-0 flex-col pb-10 pl-16 pt-10 sm:pl-16 lg:min-h-0 lg:overflow-visible lg:pb-16 lg:pl-28 lg:pr-2 lg:pt-20">
            <div
              ref={rowRef}
              className="mx-auto flex w-full max-w-[58rem] items-center justify-center md:pr-1"
              style={{
                transform: zoom
                  ? `translate(${zoomT.x}px, ${zoomT.y}px) perspective(1300px) rotateY(10deg) scale(1.45)`
                  : "translate(0px, 0px) perspective(1300px) rotateY(17deg) scale(1)",
                transformOrigin: `${zoomT.ox}% ${zoomT.oy}%`,
                transition: "transform 1.1s cubic-bezier(0.22, 0.8, 0.24, 1)",
              }}
            >
              <section
                aria-label="ตู้สุ่มรหัสพนักงาน"
                className={`relative min-w-0 flex-1 ${kick > 0 && (spinning || zapOn) ? (kick % 2 ? "pd-kick-a" : "pd-kick-b") : spinning ? "pd-rumble" : ""} ${
                  winner && !spinning ? "pd-jackpot" : ""
                }`}
                style={
                  spinning || zapOn
                    ? ({
                        // ตอนเครื่องทำงาน: สั่นเบา ๆ ต่อเนื่อง / ตอนเลขหยุด: สะดุ้งแรงขึ้นตามหลัก (zapOn)
                        "--amp": 2 + heat * 2.2,
                        "--ramp": 1.5 + heat * 0.3,
                        "--spd": `${Math.max(0.2, 0.3 - heat * 0.01)}s`,
                        filter: zapOn
                          ? `drop-shadow(0 0 ${4 + heat * 4}px rgba(120, 205, 255, ${Math.min(0.9, 0.3 + heat * 0.09)}))`
                          : undefined,
                      } as CSSProperties)
                    : undefined
                }
              >
                {/* ไฟรั่วออกจากตัวตู้ตอนสุ่ม: ยิ่งหลักหลัง/ยิ่งใกล้ตู้ม ยิ่งเยอะและใหญ่ */}
                {zapOn && (
                  <div aria-hidden className="pointer-events-none absolute -inset-4 z-30">
                    {BOLTS.slice(0, Math.min(BOLTS.length, 2 + heat * 2)).map((b, i) => (
                      <svg
                        key={i}
                        viewBox="0 0 40 80"
                        className="pd-zap absolute"
                        style={{
                          left: `${b.l}%`,
                          top: `${b.t}%`,
                          width: 26 + heat * 4,
                          height: (26 + heat * 4) * 2,
                          transform: `rotate(${b.r}deg)`,
                          animationDelay: `${b.d}s`,
                          animationDuration: `${b.u}s`,
                        }}
                      >
                        <polyline
                          points="20,0 9,24 23,34 6,60 21,70 14,80"
                          fill="none"
                          stroke="#7fd8ff"
                          strokeWidth="7"
                          strokeLinejoin="round"
                          opacity="0.45"
                        />
                        <polyline
                          points="20,0 9,24 23,34 6,60 21,70 14,80"
                          fill="none"
                          stroke="#ffffff"
                          strokeWidth="2.5"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ))}
                  </div>
                )}
                {/* ===== หัวตู้: ป้ายโค้ง + หลอดไฟ ===== */}
                <div className="pd-gold pd-crown rounded-b-xl rounded-t-[2.8rem] p-1.5">
                  <div className="pd-marquee relative rounded-b-lg rounded-t-[2.4rem] px-3 pb-3 pt-3 text-center">
                    <div aria-hidden className="flex justify-between px-2">
                      {Array.from({ length: BULBS }).map((_, i) => (
                        <span
                          key={i}
                          className={`pd-bulb h-2 w-2 rounded-full sm:h-2.5 sm:w-2.5 ${spinning ? "pd-bulb-fast" : ""}`}
                          style={{ animationDelay: i % 2 ? "0s" : "-0.5s" }}
                        />
                      ))}
                    </div>
                    <p className="pd-title mt-2 text-4xl font-extrabold tracking-[0.12em] sm:text-5xl lg:text-6xl">
                      LUCKY DRAW
                    </p>
                    <div className="pd-plate-green mx-auto mt-2 w-fit rounded-full border-2 border-[#ffd54a] px-6 py-0.5 text-xs font-extrabold tracking-[0.3em] text-[#fff6c9] sm:text-sm">
                      ลุ้นของรางวัล
                    </div>

                    {/* โลโก้แปะเป็นเทปที่มุมป้าย */}
                    <LogoTape className="-right-2 top-7 rotate-[9deg] sm:-right-3 sm:top-9" imgClassName="h-7 sm:h-9 lg:h-11" />
                  </div>
                </div>

                {/* ===== ตัวตู้สีแดง ===== */}
                <div className="pd-body mt-3 flex flex-col gap-4 rounded-[1.8rem] p-3 sm:gap-5 sm:rounded-[2.2rem] sm:p-5">
                  {/* หน้าต่างวงล้อ */}
                  <div className="pd-gold rounded-[1.4rem] p-1.5 sm:p-2">
                    <div ref={winRef} className="pd-bezel rounded-[1.1rem] p-2 sm:p-3">
                      <p className="pb-1.5 text-center text-[10px] font-bold tracking-widest text-[#ffd54a] sm:text-xs">
                        รหัสพนักงาน
                      </p>
                      <div className="flex gap-2 sm:gap-3" aria-live="polite">
                        {digits.map((d, i) => {
                          const rolling = spinning && !stopped[i];
                          return (
                            <div
                              key={i}
                              className={`pd-digit pd-reel relative min-w-0 flex-1 overflow-hidden rounded-lg font-extrabold text-black sm:rounded-xl ${
                                stopped[i] ? "ring-2 ring-[#ffd54a] sm:ring-4" : ""
                              }`}
                              style={{ aspectRatio: "3 / 4.2" }}
                            >
                              {rolling ? (
                                <div
                                  className="pd-strip pd-num3d absolute inset-x-0 top-0 flex flex-col"
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
                                  } ${d === "-" ? "text-black/25" : "pd-num3d"}`}
                                >
                                  {d}
                                </span>
                              )}
                              {/* เงาโค้งแบบวงล้อทรงกระบอก */}
                              <span aria-hidden className="pd-drum pointer-events-none absolute inset-0" />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* ไฟกลมใต้หน้าต่าง */}
                  <div aria-hidden className="flex justify-center gap-3 sm:gap-4">
                    {["#35d6e0", "#ffe27a", "#7dff6b", "#ff7ad9", "#35d6e0"].map((c, i) => (
                      <span
                        key={i}
                        className={`pd-lamp h-3.5 w-3.5 rounded-full border-2 border-[#8f0f1a] sm:h-4 sm:w-4 ${
                          spinning ? "pd-lamp-fast" : ""
                        }`}
                        style={{ background: c, animationDelay: i % 2 ? "0s" : "-0.6s" }}
                      />
                    ))}
                  </div>

                  {/* แผงปุ่มควบคุม */}
                  <div className="pd-gold rounded-[1.6rem] p-1">
                    <div className="pd-tray rounded-[1.4rem] p-3 sm:p-4">
                      <div aria-hidden className="mb-3 flex justify-center gap-2 sm:gap-3">
                        <span className="pd-key h-2.5 w-12 rounded-sm bg-[#35d6e0] sm:w-16" />
                        <span className="pd-key h-2.5 w-12 rounded-sm bg-[#ffe0a0] sm:w-16" />
                        <span className="pd-key h-2.5 w-12 rounded-sm bg-[#ff9a9a] sm:w-16" />
                        <span className="pd-key h-2.5 w-12 rounded-sm bg-[#ffb0e0] sm:w-16" />
                      </div>

                      {/* จำนวนที่เหลือ (ซ้าย) + ปุ่มเริ่มสุ่ม — เว้นระยะกว้างกันชน/ซ้อนกับปุ่ม (รวมตอน hover ขยาย + เงาด้านซ้าย) */}
                      <div className="flex items-center justify-center gap-8 sm:gap-14">
                        <div className="pd-oval flex flex-none flex-col items-center rounded-[50%] px-5 py-1.5 sm:min-w-[7.5rem] sm:px-7">
                          <span className="text-[10px] font-bold tracking-widest text-[#8f0f1a]">เหลือ</span>
                          <span className="font-mono text-3xl font-extrabold leading-none text-[#e0243c] [text-shadow:0_2px_0_#fff0b0,0_3px_0_#b27d00] sm:text-4xl">
                            <span aria-hidden className="pd-live mr-1 align-middle text-sm text-green-600">
                              ●
                            </span>
                            {total}
                          </span>
                          <span className="text-[10px] font-bold tracking-widest text-[#8f0f1a]">ใบ</span>
                        </div>

                        <div className="relative min-w-[9rem] max-w-[15rem] flex-1">
                          <button
                            type="button"
                            onClick={pressSpin}
                            disabled={spinning || total === 0}
                            className={`pd-btn-red relative min-h-14 w-full overflow-hidden rounded-2xl text-lg font-extrabold disabled:cursor-not-allowed sm:min-h-16 sm:text-xl ${
                              spinning ? "opacity-0" : ""
                            }`}
                          >
                            {btnLabel}
                          </button>

                          {/* ปุ่มหักเป็น 2 ท่อน (แสดงระหว่างสุ่ม พอสุ่มเสร็จกลับเป็นปุ่มปกติ) */}
                          {spinning && (
                            <div aria-hidden className="pointer-events-none absolute inset-0">
                              <div className="pd-half-wrap pd-half-l">
                                <div className="pd-half-face text-lg font-extrabold sm:text-xl">{btnLabel}</div>
                              </div>
                              <div className="pd-half-wrap pd-half-r">
                                <div className="pd-half-face text-lg font-extrabold sm:text-xl">{btnLabel}</div>
                              </div>
                            </div>
                          )}

                          {/* เศษปุ่มที่แตกกระจายตอนค้อนกระทบ */}
                          {quake && (
                            <div aria-hidden className="pointer-events-none absolute inset-0 z-20">
                              <span className="pd-flash" />
                              {SHARDS.map((p, i) => (
                                <span
                                  key={i}
                                  className="pd-shard"
                                  style={
                                    {
                                      "--dx": `${p.x}px`,
                                      "--dy": `${p.y}px`,
                                      "--dr": `${p.r}deg`,
                                      width: p.s,
                                      height: p.s,
                                      background: i % 2 ? "#ff4b4b" : "#c0262d",
                                    } as CSSProperties
                                  }
                                />
                              ))}
                            </div>
                          )}

                          {/* ค้อนทุบปุ่ม */}
                          {hammer && (
                            <div aria-hidden className="pd-hammer">
                              <span className="pd-hammer-loop" />
                              <span className="pd-hammer-handle" />
                              <span className="pd-hammer-head" />
                            </div>
                          )}
                        </div>

                        {/* ปุ่มตั้งค่า: เลือกสุ่มทีเดียวกี่คน */}
                        <div className="relative flex-none">
                          <button
                            type="button"
                            onClick={() => setShowSettings((v) => !v)}
                            disabled={spinning || hammer}
                            aria-label="ตั้งค่าจำนวนผู้ถูกรางวัลต่อการสุ่ม"
                            aria-expanded={showSettings}
                            className="pd-gold relative flex h-12 w-12 items-center justify-center rounded-full text-[#8f0f1a] transition active:scale-90 disabled:cursor-not-allowed disabled:opacity-50 sm:h-14 sm:w-14"
                          >
                            <svg
                              viewBox="0 0 24 24"
                              className="h-6 w-6 sm:h-7 sm:w-7"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden
                            >
                              <circle cx="12" cy="12" r="3.2" />
                              <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1" />
                            </svg>
                            {batch > 1 && (
                              <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-[#e0243c] px-1 text-center text-[11px] font-extrabold leading-5 text-white ring-2 ring-[#ffe27a]">
                                {Math.min(batch, maxBatch)}
                              </span>
                            )}
                          </button>

                          {showSettings && (
                            <div
                              role="dialog"
                              aria-label="ตั้งค่าการสุ่ม"
                              className="absolute bottom-full right-0 z-40 mb-3 w-64 rounded-2xl border-2 border-[#ffc83d] bg-[#2a0a12] p-4 text-white shadow-[0_8px_0_rgba(0,0,0,0.4)]"
                            >
                              <p className="text-sm font-extrabold text-[#ffe27a]">สุ่มทีเดียวกี่คน</p>
                              <div className="mt-3 flex items-center justify-center gap-4">
                                <button
                                  type="button"
                                  onClick={() => setBatch((n) => Math.max(1, Math.min(n, maxBatch) - 1))}
                                  disabled={batch <= 1}
                                  aria-label="ลดจำนวน"
                                  className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-xl font-extrabold text-black transition active:scale-90 disabled:opacity-40"
                                >
                                  −
                                </button>
                                <span className="min-w-12 text-center font-mono text-4xl font-extrabold">
                                  {Math.min(batch, maxBatch)}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setBatch((n) => Math.min(maxBatch, Math.min(n, maxBatch) + 1))}
                                  disabled={Math.min(batch, maxBatch) >= maxBatch}
                                  aria-label="เพิ่มจำนวน"
                                  className="flex h-10 w-10 items-center justify-center rounded-full bg-[#ffc83d] text-xl font-extrabold text-black transition active:scale-90 disabled:opacity-40"
                                >
                                  +
                                </button>
                              </div>
                              <div className="mt-3 flex flex-wrap justify-center gap-2">
                                {[1, 3, 5, 10].map((n) => (
                                  <button
                                    key={n}
                                    type="button"
                                    onClick={() => setBatch(Math.min(n, maxBatch))}
                                    className={`min-w-10 rounded-full border px-3 py-1 text-sm font-bold transition active:scale-95 ${
                                      Math.min(batch, maxBatch) === n
                                        ? "border-[#ffc83d] bg-[#ffc83d] text-[#2a0a12]"
                                        : "border-white/30 text-white/80"
                                    }`}
                                  >
                                    {n}
                                  </button>
                                ))}
                              </div>
                              <p className="mt-3 text-center text-[11px] text-white/60">
                                {Math.min(batch, maxBatch) > 1
                                  ? `กดสุ่มครั้งเดียว ได้ ${Math.min(batch, maxBatch)} รายชื่อพร้อมกัน`
                                  : "สุ่มทีละคน (เลขหยุดทีละหลัก)"}
                                {" · "}สูงสุด {maxBatch}
                              </p>
                              <button
                                type="button"
                                onClick={() => setShowSettings(false)}
                                className="mt-3 w-full rounded-xl bg-[#ffc83d] py-2 text-sm font-extrabold text-[#2a0a12] transition active:scale-95"
                              >
                                ตกลง
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      <div aria-hidden className="mt-4 flex gap-2">
                        <span className="h-2.5 flex-1 rounded-full bg-[#ff4fc0] shadow-[0_3px_0_#a02d82]" />
                        <span className="h-2.5 flex-1 rounded-full bg-[#ff4fc0] shadow-[0_3px_0_#a02d82]" />
                        <span className="h-2.5 flex-1 rounded-full bg-[#ffb347] shadow-[0_3px_0_#b27019]" />
                        <span className="h-2.5 flex-1 rounded-full bg-[#ff4fc0] shadow-[0_3px_0_#a02d82]" />
                      </div>
                    </div>
                  </div>

                  {/* แผงผู้ถูกรางวัลล่าสุด (แสดงหลังปิดการ์ดผู้ถูกรางวัล) */}
                  <div className="pd-gold rounded-[1.6rem] p-1">
                    <div className="pd-count-plate rounded-[1.4rem] p-2 sm:p-2.5">
                      {latest && !winner ? (
                        <div
                          key={latest.code}
                          className="pd-gold-card pd-row-pop flex items-center gap-4 rounded-[1.1rem] border-2 border-[#fff3b0] px-4 py-3 shadow-[0_4px_0_#b27d00] [text-shadow:0_1px_0_rgba(255,255,255,0.45)] sm:gap-5 sm:px-5 sm:py-4"
                        >
                          <WinnerAvatar
                            w={latest}
                            className="h-16 w-16 text-3xl ring-2 ring-white/80 sm:h-20 sm:w-20 sm:text-4xl"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xl font-extrabold text-[#5a3500] sm:text-2xl">{latest.name}</p>
                            {(latest.company || latest.department) && (
                              <p className="truncate text-sm font-bold text-[#7a4b00]">
                                {[latest.company, latest.department].filter(Boolean).join(" · ")}
                              </p>
                            )}
                            <p className="font-mono text-sm font-semibold text-[#7a4b00]">{latest.empCode}</p>
                          </div>
                        </div>
                      ) : (
                        <p className="rounded-2xl border border-dashed border-white/20 py-5 text-center text-sm text-white/50">
                          {winner ? "กำลังประกาศผล..." : "ยังไม่มีผู้ถูกรางวัล"}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* ช่องหยอดเหรียญ + ถาดรับรางวัล */}
                  <div aria-hidden className="flex items-center justify-between gap-3">
                    <div className="pd-gold flex h-9 w-20 flex-none items-center justify-center rounded-lg sm:w-24">
                      <span className="pd-slot h-1.5 w-10 rounded-full" />
                    </div>
                    <div className="pd-slot h-9 flex-1 rounded-b-2xl rounded-t-md border-b-4 border-[#ffc83d]" />
                  </div>

                  {idle && (
                    <p className="text-center text-[11px] text-white/80 sm:text-xs">
                      กดปุ่ม{`"เริ่มสุ่ม"`}
                      <span className="hidden md:inline"> หรือดึงคันโยกด้านขวา</span> หรือกด Space เพื่อสุ่มผู้ถูกรางวัล
                    </p>
                  )}
                </div>

                {/* ฐานตู้ */}
                <div aria-hidden className="pd-gold mx-3 mt-2 h-5 rounded-b-[1.5rem] sm:mx-6" />
                <div aria-hidden className="pd-foot mt-2 h-4 rounded-b-2xl" />
                <div aria-hidden className="pd-podium -mx-3 mt-6 h-9 rounded-t-xl border-t-4 border-[#ffd54a] sm:-mx-6 sm:h-12" />
                <div aria-hidden className="pd-podium -mx-6 h-9 border-t-2 border-[#ffd54a]/60 sm:-mx-12 sm:h-14" />
                <div aria-hidden className="pd-gold -mx-8 h-3 rounded-b-md sm:-mx-16" />
                <div aria-hidden className="mx-auto -mt-1 h-6 w-[115%] -translate-x-[6.5%] rounded-[50%] bg-black/45 blur-xl" />
              </section>

              {/* ===== คันโยกข้างตู้ (แสดงตั้งแต่จอ md ขึ้นไป) ===== */}
              <button
                type="button"
                onClick={pressSpin}
                disabled={spinning || total === 0}
                aria-label="ดึงคันโยกเพื่อสุ่ม"
                className="relative hidden h-56 w-16 shrink-0 flex-col items-center justify-start self-center disabled:cursor-not-allowed disabled:opacity-60 md:flex"
              >
                <span aria-hidden className="pd-gold absolute -left-1 top-[6.4rem] h-5 w-6 rounded-r-md" />
                <span
                  className="pd-ball h-11 w-11 rounded-full transition-transform duration-300"
                  style={{ transform: spinning ? "translateY(96px)" : "translateY(0)" }}
                />
                <span
                  className="pd-stick -mt-1 w-3 rounded-full transition-all duration-300"
                  style={{ height: spinning ? 8 : 104, transform: spinning ? "translateY(96px)" : "translateY(0)" }}
                />
                <span className="pd-gold mt-auto h-7 w-11 rounded-md" />
              </button>
            </div>
          </div>

          {/* ===== คอลัมน์ขวา: โหลตั๋ว + ประวัติ ===== */}
          <div className="flex min-w-0 flex-col gap-6 lg:min-h-0">
            {/* ===== โหลตั๋ว ===== */}
            <section aria-label="โหลตั๋ว Lucky Draw" className="flex flex-none flex-col items-center">
              <div className="pd-gold h-4 w-40 rounded-t-xl sm:w-52" />
              <div className="relative w-full max-w-lg">
                <div className="pd-jar relative h-64 w-full overflow-hidden rounded-b-[3rem] rounded-t-2xl border-4 border-white/30 lg:h-[36vh] lg:min-h-[15rem]">
                  {shown.map((t) => {
                    const s = ticketStyle(t.code);
                    // ตั๋วที่อยู่ตั้งแต่เปิดหน้า: หล่นตามจังหวะสุ่ม / ตั๋วที่เพิ่งเข้าโหล (admin เพิ่งอนุมัติ): หล่นทันที
                    const delay = initialRef.current?.has(t.code) ? s.delay : 0;
                    return (
                      <div
                        key={t.code}
                        className="absolute flex h-8 w-14 flex-col items-center justify-center rounded-md pd-ticket border border-dashed border-white/50 bg-[#6b1d24] text-[8px] font-bold leading-tight text-white"
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
                  {/* แสงสะท้อนบนแก้วโหล */}
                  <span
                    aria-hidden
                    className="pointer-events-none absolute bottom-14 left-3 top-4 w-3 rounded-full bg-white/15 blur-[1px]"
                  />
                  <span
                    aria-hidden
                    className="pointer-events-none absolute bottom-20 left-8 top-10 w-1 rounded-full bg-white/10"
                  />
                  <div className="pointer-events-none absolute inset-x-0 bottom-3 text-center">
                    <span className="rounded-full bg-black/60 px-4 py-1.5 text-sm font-bold">
                      <span aria-hidden className="pd-live mr-1.5 text-green-400">
                        ●
                      </span>
                      เหลือ {total} ใบ
                    </span>
                  </div>
                </div>

                {/* โลโก้แปะเป็นเทปที่มุมโหลตั๋ว (อยู่นอก overflow-hidden ของโหล จะได้ไม่โดนตัด) */}
                <LogoTape className="-right-3 top-3 rotate-[10deg]" imgClassName="h-8 sm:h-10" />
              </div>
            </section>

            {/* ===== ประวัติผู้ถูกรางวัล ===== */}
            <section ref={winnerListRef} aria-label="ผู้ถูกรางวัลแล้ว" className="flex min-h-0 flex-1 flex-col">
              <h2 className="flex-none text-lg font-bold">ผู้ถูกรางวัลแล้ว ({winners.length})</h2>
              {winners.length === 0 ? (
                <p className="mt-3 rounded-2xl border border-dashed border-white/20 p-5 text-center text-sm text-white/50">
                  ยังไม่มีผู้ถูกรางวัล
                </p>
              ) : (
                <ul className="pd-noscroll pd-gold-list mt-3 max-h-[28rem] min-h-0 flex-1 divide-y divide-[#ffd54a]/25 overflow-y-auto rounded-2xl border-2 border-[#d9a516] shadow-[0_5px_0_#4a2c00] lg:max-h-none">
                  {winners.map((w, i) => (
                    <li
                      key={w.code}
                      className={`flex items-center gap-3 px-4 py-3 ${
                        hiddenCodes.includes(w.code) ? "invisible" : popCodes.includes(w.code) ? "pd-row-pop" : ""
                      }`}
                    >
                      <WinnerAvatar w={w} className="h-12 w-12 text-xl ring-2 ring-[#ffd54a]/70" />
                      <div className="min-w-0 flex-1">
                        <p className="pd-gold-text truncate text-sm font-extrabold">
                          {winners.length - i}. {w.name}
                        </p>
                        {(w.company || w.department) && (
                          <p className="pd-gold-text-sub truncate text-xs font-semibold">
                            {[w.company, w.department].filter(Boolean).join(" · ")}
                          </p>
                        )}
                        <p className="pd-gold-text-sub font-mono text-xs font-semibold">รหัส {w.empCode}</p>
                      </div>
                      <p className="pd-gold-text-sub shrink-0 text-xs font-semibold">{fmt(w.wonAt)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      </main>

      {/* ===== ผู้ถูกรางวัล (การ์ดลอยเหนือหน้า เลื่อนขึ้นจากด้านล่าง กด Space หรือปุ่มปิดแล้วเลื่อนลง) ===== */}
      {winner && !spinning && batchWin.length > 1 && (
        <section
          ref={winnerCardRef}
          aria-label="ผู้ถูกรางวัลทั้งหมด"
          className={`pd-batch-wrap fixed inset-x-3 bottom-4 z-[46] mx-auto max-w-6xl sm:bottom-6 ${
            winnerClosing ? "pd-card-out" : ""
          }`}
        >
          <div className="mb-2 flex items-center justify-between gap-3 px-2">
            <p className="text-lg font-extrabold tracking-widest text-[#ffe27a] [text-shadow:0_2px_6px_rgba(0,0,0,0.7)] sm:text-2xl">
              ยินดีด้วย! ผู้ถูกรางวัล {batchWin.length} คน
            </p>
            <button
              type="button"
              onClick={closeWinner}
              disabled={winnerClosing}
              className="min-h-9 rounded-full border-2 border-[#6b4200]/60 bg-[#ffe27a] px-4 text-xs font-bold text-[#5a3500] sm:text-sm"
            >
              ปิด (Space)
            </button>
          </div>
          <div
            className={`pd-noscroll grid max-h-[78vh] gap-3 overflow-y-auto p-1 ${
              batchWin.length === 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
            }`}
          >
            {batchWin.map((b, i) => (
              <div
                key={b.code}
                className="pd-gold-card relative min-w-0 rounded-[1.3rem] px-4 pb-4 pt-3 shadow-[0_6px_0_rgba(0,0,0,0.35)] [text-shadow:0_1px_0_rgba(255,255,255,0.45)]"
              >
                <span className="absolute left-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-[#5a3500] text-sm font-extrabold text-[#ffe27a]">
                  {i + 1}
                </span>
                <p className="text-center text-xs font-extrabold tracking-widest text-[#7a4b00]">ผู้ถูกรางวัล</p>
                <div className="mt-2 flex items-center gap-4">
                  <WinnerAvatar w={b} className="h-20 w-20 flex-none text-4xl ring-4 ring-white/80 sm:h-24 sm:w-24 sm:text-5xl" />
                  <div className="min-w-0 flex-1 text-left">
                    <p className="break-words text-xl font-extrabold leading-tight text-[#5a3500] sm:text-2xl">{b.name}</p>
                    {(b.company || b.department) && (
                      <p className="mt-1 break-words text-sm font-bold text-[#7a4b00]">
                        {[b.company, b.department].filter(Boolean).join(" · ")}
                      </p>
                    )}
                    <p className="mt-1 text-sm font-semibold text-[#7a4b00]">
                      รหัสพนักงาน <span className="font-mono font-extrabold text-[#5a3500]">{b.empCode}</span>
                    </p>
                    <p className="mt-0.5 break-all font-mono text-[10px] text-[#7a4b00]/70">{b.code}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {winner && !spinning && batchWin.length <= 1 && (
        <section
          ref={winnerCardRef}
          aria-label="ผู้ถูกรางวัล"
          className={`pd-gold-frame fixed inset-x-3 bottom-4 z-[46] mx-auto max-w-3xl rounded-[2rem] p-1.5 sm:bottom-6 ${
            winnerClosing ? "pd-card-out" : ""
          }`}
        >
          {/* ป้ายไฟรอบการ์ด (ดวงไฟกระพริบแบบเดียวกับหัวตู้) */}
          <div className="pd-marquee rounded-[1.7rem] px-3 py-3 sm:px-4 sm:py-4">
            <div aria-hidden className="flex justify-between px-2">
              {Array.from({ length: WIN_BULBS_X }).map((_, i) => (
                <span
                  key={i}
                  className="pd-bulb pd-bulb-fast h-2.5 w-2.5 rounded-full sm:h-3 sm:w-3"
                  style={{ animationDelay: i % 2 ? "0s" : "-0.14s" }}
                />
              ))}
            </div>

            <div className="my-2.5 flex items-stretch gap-2.5 sm:my-3 sm:gap-3">
              <div aria-hidden className="flex flex-col justify-between py-1">
                {Array.from({ length: WIN_BULBS_Y }).map((_, i) => (
                  <span
                    key={i}
                    className="pd-bulb pd-bulb-fast h-2.5 w-2.5 rounded-full sm:h-3 sm:w-3"
                    style={{ animationDelay: i % 2 ? "0s" : "-0.14s" }}
                  />
                ))}
              </div>

              <div className="pd-gold-card relative min-w-0 flex-1 rounded-[1.3rem] px-4 pb-5 pt-4 [text-shadow:0_1px_0_rgba(255,255,255,0.45)] sm:px-6 sm:pb-6 sm:pt-5">
                <button
                  type="button"
                  onClick={closeWinner}
                  disabled={winnerClosing}
                  className="absolute right-3 top-3 min-h-9 rounded-full border-2 border-[#6b4200]/60 bg-white/30 px-4 text-xs font-bold text-[#5a3500] sm:text-sm"
                >
                  ปิด (Space)
                </button>
                <p className="pr-28 text-sm font-extrabold tracking-widest text-[#7a4b00] sm:text-base">
                  ยินดีด้วย! ผู้ถูกรางวัล
                </p>
                <div className="mt-4 flex items-center gap-5 sm:gap-7">
                  <WinnerAvatar
                    w={winner}
                    className="h-24 w-24 text-5xl ring-4 ring-white/80 sm:h-36 sm:w-36 sm:text-7xl"
                  />
                  <div className="min-w-0 flex-1 text-left">
                    <p className="break-words text-3xl font-extrabold leading-tight text-[#5a3500] sm:text-5xl">
                      {winner.name}
                    </p>
                    {(winner.company || winner.department) && (
                      <p className="mt-1.5 break-words text-base font-bold text-[#7a4b00] sm:text-xl">
                        {[winner.company, winner.department].filter(Boolean).join(" · ")}
                      </p>
                    )}
                    <p className="mt-1.5 text-base font-semibold text-[#7a4b00] sm:text-xl">
                      รหัสพนักงาน <span className="font-mono font-extrabold text-[#5a3500]">{winner.empCode}</span>
                    </p>
                    <p className="mt-0.5 break-all font-mono text-xs text-[#7a4b00]/70">{winner.code}</p>
                  </div>
                </div>
              </div>

              <div aria-hidden className="flex flex-col justify-between py-1">
                {Array.from({ length: WIN_BULBS_Y }).map((_, i) => (
                  <span
                    key={i}
                    className="pd-bulb pd-bulb-fast h-2.5 w-2.5 rounded-full sm:h-3 sm:w-3"
                    style={{ animationDelay: i % 2 ? "-0.14s" : "0s" }}
                  />
                ))}
              </div>
            </div>

            <div aria-hidden className="flex justify-between px-2">
              {Array.from({ length: WIN_BULBS_X }).map((_, i) => (
                <span
                  key={i}
                  className="pd-bulb pd-bulb-fast h-2.5 w-2.5 rounded-full sm:h-3 sm:w-3"
                  style={{ animationDelay: i % 2 ? "-0.14s" : "0s" }}
                />
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}