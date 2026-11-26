"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from "react";
import { Prompt } from "next/font/google";

const appFont = Prompt({ subsets: ["thai", "latin"], weight: ["400", "500", "600", "700", "800"] });

type ListTab = "reviewing" | "approved" | "auto" | "rejected";
type Tab = ListTab | "summary" | "scans" | "bans" | "spin";
type SlipCheck = {
  amount: number | null;
  amountOk: boolean;
  receiverOk: boolean;
  timeOk: boolean;
  transferAt: string | null;
  ok: boolean;
  shouldBan?: boolean;
  banned?: boolean;
  rawText?: string;
  error?: string | null;
};
type Item = {
  id: string;
  ref: string;
  name: string;
  phone: string;
  empCode: string | null;
  company: string | null;
  department: string | null; // แผนก (สำนักงานใหญ่) หรือสาขา (หน้าร้าน)
  amount: number;
  status: string;
  auto: boolean;
  createdAt: string;
  slipAt: string | null;
  booth: number;
  lucky: number;
  rejectReason: string | null;
  avatarUrl: string | null;
  // ไม่ใช่ null = ผู้ซื้อเคยถูกปฏิเสธมาก่อนแล้วส่งออเดอร์ใหม่ (count = จำนวนครั้งที่เคยถูกปฏิเสธ, lastReason = เหตุผลครั้งล่าสุด)
  retry: { count: number; lastReason: string | null } | null;
  slip: { transRef: string; sendingBank: string; check: SlipCheck | null } | null;
};
// bans = จำนวนผู้ใช้ที่ถูกแบนอยู่ตอนนี้
type Counts = Record<ListTab | "bans", number>;
// admin เข้าด้วยรหัสผ่านอย่างเดียว: ยังไม่ปลดล็อก/หมดอายุ = locked
type Gate = "loading" | "ok" | "locked";
type Summary = {
  buyers: number;
  orders: number;
  booth: { count: number; amount: number };
  lucky: { count: number; amount: number };
  // แพ็ค Pre-order (อนุมัติแล้วเท่านั้น): count = จำนวนแพ็ค / buyers = จำนวนคนที่ซื้อ / tickets = Lucky Draw ที่ออกจากแพ็ค (ใบ)
  pack: { count: number; buyers: number; tickets: number; amount: number };
  total: { count: number; amount: number };
  pending: { count: number; amount: number };
  rejected: number;
  daily: { date: string; orders: number; booth: number; lucky: number; amount: number }[];
  generatedAt: string;
};
// จำนวนตั๋วที่ขายแล้ว (อนุมัติแล้วเท่านั้น) จาก /api/stats เดียวกับหน้าหลัก: booth = ชุด / lucky = ใบ
type Sold = { booth: number; lucky: number };
// ประวัติการยิงบาร์โค้ดตั๋วเข้างาน (มาจากหน้า /ticket ของแต่ละซุ้ม)
type ScanRow = {
  id: string;
  code: string;
  result: string;
  at: string;
  name: string | null;
  phone: string | null;
  empCode: string | null;
  company: string | null;
  department: string | null;
  ticket: string | null;
  firstUsedAt: string | null;
  boothId: string | null;
  boothName: string | null;
  amount: number | null;
};
// สรุปรายซุ้ม: count = จำนวนตั๋วที่ยิงผ่าน / amount = เงินรวมที่ซุ้มนั้นยิงได้ / rejected = ยิงไม่ผ่านกี่ครั้ง
type BoothStat = {
  id: string;
  name: string;
  kind: "play" | "paper";
  count: number;
  amount: number;
  rejected: number;
  lastAt: string | null;
};
type ScanData = { total: number; rejected: number; booths: BoothStat[]; scans: ScanRow[] };
// ผู้ใช้ที่ถูกแบนอยู่ (อัตโนมัติจากสลิปไม่ผ่าน หรือ admin แบนเอง) payment = รายการ + สลิปที่ทำให้ถูกแบน
type BanRow = {
  id: string;
  username: string;
  name: string;
  phone: string;
  empCode: string | null;
  company: string | null;
  department: string | null;
  avatarUrl: string | null;
  bannedUntil: string;
  bannedAt: string | null;
  banReason: string | null;
  payment: Item | null;
};
// ผู้ถูกรางวัลจากตู้สุ่ม (rank = ลำดับที่ได้รางวัล คนแรก = 1)
type SpinWinner = {
  id: string;
  rank: number;
  code: string;
  wonAt: string | null;
  name: string;
  phone: string;
  empCode: string | null;
  company: string | null;
  department: string | null;
  avatarUrl: string | null;
};
type BanDuration = "1h" | "24h" | "7d" | "permanent";
// จำนวนรายการ "อัตโนมัติ" / "ถูกแบน" ที่ admin เปิดดูล่าสุด (เก็บในเบราว์เซอร์) ใช้ทำจุดแดง
type Seen = { auto: number; bans: number };
// แอนิเมชันตอนอนุมัติ: green = การ์ดเป็นสีเขียวมีติกถูก / fly = การ์ดลอยเข้าเมนู "อนุมัติแล้ว" / collapse = ช่องว่างในรายการยุบลง
type Anim = { id: string; phase: "green" | "fly" | "collapse"; dx: number; dy: number; h: number };

const POLL_MS = 10_000;
const SEEN_KEY = "payday-admin-seen-v1";
const RECEIVER_LABEL = "คอมเซเว่น เพื่อการกุศล";
const REASONS = ["ยอดเงินไม่ตรง", "ไม่พบรายการเข้าบัญชี", "สลิปไม่ชัด/อ่านไม่ได้", "สลิปไม่ใช่ของรายการนี้"];
const BAN_OPTIONS: [BanDuration, string][] = [
  ["1h", "1 ชั่วโมง"],
  ["24h", "24 ชั่วโมง"],
  ["7d", "7 วัน"],
  ["permanent", "ถาวร"],
];
const STATUS_LABEL: Record<string, string> = {
  awaiting_slip: "รอส่งสลิป",
  reviewing: "รอตรวจ",
  approved: "อนุมัติแล้ว",
  rejected: "ปฏิเสธ",
  expired: "หมดเวลา",
};
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
const SCAN_LABEL: Record<string, { label: string; cls: string }> = {
  ok: { label: "ผ่าน", cls: "bg-green-600 text-white" },
  duplicate: { label: "ซ้ำ (ใช้แล้ว)", cls: "bg-red-600 text-white" },
  wrong_type: { label: "ตั๋วผิดประเภท", cls: "bg-yellow-400 text-[#14402c]" },
  invalid: { label: "ไม่พบตั๋ว", cls: "bg-red-600 text-white" },
};

// เอฟเฟกต์ทั้งหมดของหน้า admin (เลื่อนเข้า / เปิดรายละเอียด / ติกถูก / เมนูกระพริบตอนการ์ดลอยมาถึง) ปิดเองถ้าเครื่องตั้งลดการเคลื่อนไหว
const FX_CSS = `
@keyframes adminCardIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
@keyframes adminFadeDown{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}
@keyframes adminPopIn{0%{opacity:0;transform:scale(.3)}60%{opacity:1;transform:scale(1.18)}100%{opacity:1;transform:scale(1)}}
@keyframes adminDrawCheck{from{stroke-dasharray:30;stroke-dashoffset:30}to{stroke-dasharray:30;stroke-dashoffset:0}}
@keyframes adminNavPulse{0%{box-shadow:0 0 0 0 rgba(22,163,74,.75);transform:scale(1)}40%{transform:scale(1.07)}100%{box-shadow:0 0 0 16px rgba(22,163,74,0);transform:scale(1)}}
.admin-card-in{animation:adminCardIn .35s ease backwards}
.admin-fade-down{animation:adminFadeDown .25s ease backwards}
.admin-pop-in{animation:adminPopIn .45s cubic-bezier(.2,.9,.3,1.2) both}
.admin-check-draw{animation:adminDrawCheck .4s .25s ease both}
.admin-nav-pulse{animation:adminNavPulse .8s ease-out}
@media (prefers-reduced-motion: reduce){
  .admin-card-in,.admin-fade-down,.admin-pop-in,.admin-check-draw,.admin-nav-pulse{animation:none}
}
`;

const baht = (n: number) => `฿${n.toLocaleString("th-TH")}`;
const num = (n: number) => n.toLocaleString("th-TH");
const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "-";
const fmtSec = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("th-TH", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "-";
const fmtDay = (ymd: string) =>
  new Date(`${ymd}T00:00:00+07:00`).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });
// แบนถาวร = bannedUntil เป็นปี 9999
const isForever = (iso: string) => iso.startsWith("9999");

// ค้นหา: ตัดช่องว่าง/ตัวพิมพ์ใหญ่เล็ก / พิมพ์เบอร์โทรมีขีดหรือเว้นวรรคก็เจอ
const fold = (s: string) => s.toLowerCase().replace(/\s+/g, "");
const digitsOf = (s: string) => s.replace(/\D/g, "");
function matches(query: string, fields: (string | null | undefined)[]) {
  const f = fold(query);
  if (!f) return true;
  const d = /^[\d\s-]+$/.test(query) ? digitsOf(query) : "";
  return fields.some((x) => !!x && (fold(x).includes(f) || (d !== "" && digitsOf(x).includes(d))));
}
// บรรทัดข้อมูลองค์กรใต้ชื่อ: รหัสพนักงาน · บริษัท · แผนก/สาขา
const orgText = (x: { empCode: string | null; company: string | null; department: string | null }) =>
  [x.empCode ? `รหัส ${x.empCode}` : null, x.company, x.department].filter(Boolean).join(" · ");

// จุดปลายทางที่การ์ดลอยเข้าไป: เมนู "อนุมัติแล้ว" ที่เห็นอยู่ (คอมพิวเตอร์) / ปุ่ม 3 ขีด (มือถือ)
function flyTarget(): HTMLElement | null {
  const cands = Array.from(document.querySelectorAll<HTMLElement>("[data-nav-id='approved']"));
  const vis = cands.find((c) => c.getBoundingClientRect().width > 0);
  return vis ?? document.querySelector<HTMLElement>("[data-menu-btn]");
}

// สไตล์การ์ดตอนลอย / ยุบ (ตอนเป็นสีเขียวยังไม่ขยับ)
function cardStyle(a: Anim | null): CSSProperties | undefined {
  if (!a || a.phase === "green") return undefined;
  const collapsed = a.phase === "collapse";
  return {
    transform: `translate(${a.dx}px, ${a.dy}px) scale(0.12)`,
    transformOrigin: "center",
    opacity: 0,
    height: collapsed ? 0 : a.h,
    marginTop: collapsed ? 0 : undefined,
    zIndex: 30,
    pointerEvents: "none",
    transition:
      "transform 600ms cubic-bezier(.55,0,.75,.35), opacity 450ms ease-in 150ms, height 350ms ease, margin-top 350ms ease",
  };
}

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

// รูปโปรไฟล์ผู้ซื้อ (ไม่มีรูป/โหลดไม่ได้ = วงกลมตัวอักษรแรกของชื่อ) className = ขนาด + ขนาดตัวอักษร
function Avatar({ src, name, className = "h-10 w-10 text-base" }: { src: string | null; name: string; className?: string }) {
  const [bad, setBad] = useState(false);
  const initial = (name || "?").trim().charAt(0) || "?";
  if (!src || bad) {
    return (
      <span
        aria-hidden="true"
        className={`flex shrink-0 items-center justify-center rounded-full bg-[#e3ecd6] font-bold text-[#4d6652] ${className}`}
      >
        {initial}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      loading="lazy"
      onError={() => setBad(true)}
      className={`shrink-0 rounded-full bg-[#e3ecd6] object-cover ${className}`}
    />
  );
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

// เครื่องหมายย่อด้านขวาของรายการ: ok = ✓ เขียว (ผ่านการอ่านสลิปจริงเทียบออเดอร์) / false = ! เหลือง / null = ยังไม่ได้ตรวจ (เทา)
function Mark({ ok, label }: { ok: boolean | null; label: string }) {
  const cls =
    ok === null ? "bg-[#e3ecd6] text-[#6b7f6f]" : ok ? "bg-green-600 text-white" : "bg-yellow-400 text-[#14402c]";
  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold sm:h-7 sm:w-7 sm:text-sm ${cls}`}
      >
        {ok === null ? "?" : ok ? "✓" : "!"}
      </span>
      <span className="whitespace-nowrap text-[11px] font-semibold leading-none text-[#4d6652] sm:text-sm">{label}</span>
    </div>
  );
}

// การ์ดตัวเลขในหน้าสรุป
function Stat({
  title,
  value,
  sub,
  tone = "light",
}: {
  title: string;
  value: string;
  sub?: string;
  tone?: "light" | "dark" | "accent";
}) {
  const cls =
    tone === "dark"
      ? "bg-[#14402c] text-white border-[#14402c]"
      : tone === "accent"
        ? "bg-[#d9f27a] text-[#14402c] border-[#d9f27a]"
        : "bg-white text-[#14402c] border-[#e3ecd6]";
  const subCls = tone === "dark" ? "text-white/80" : "text-[#4d6652]";
  return (
    <div className={`admin-card-in min-w-0 rounded-3xl border p-4 sm:p-5 ${cls}`}>
      <p className={`text-xs font-semibold sm:text-sm ${subCls}`}>{title}</p>
      <p className="mt-1 text-2xl font-extrabold sm:text-3xl">{value}</p>
      {sub && <p className={`mt-1 text-xs sm:text-sm ${subCls}`}>{sub}</p>}
    </div>
  );
}

export default function AdminPage() {
  const [gate, setGate] = useState<Gate>("loading");
  const [tab, setTab] = useState<Tab>("reviewing");
  const [items, setItems] = useState<Item[]>([]);
  const [counts, setCounts] = useState<Counts>({ reviewing: 0, approved: 0, auto: 0, rejected: 0, bans: 0 });
  const [seen, setSeen] = useState<Seen>({ auto: 0, bans: 0 });
  const [summary, setSummary] = useState<Summary | null>(null);
  const [sold, setSold] = useState<Sold | null>(null);
  const [scanData, setScanData] = useState<ScanData | null>(null);
  const [banList, setBanList] = useState<BanRow[] | null>(null);
  const [spinList, setSpinList] = useState<SpinWinner[] | null>(null);
  const [query, setQuery] = useState(""); // คำค้นหา (ชื่อ / รหัสพนักงาน / แผนก / เบอร์โทร) ใช้กับทุกแถบที่เป็นรายชื่อ
  const [boothFilter, setBoothFilter] = useState(""); // กรองประวัติสแกนเฉพาะซุ้ม ("" = ทุกซุ้ม)
  const [menuOpen, setMenuOpen] = useState(false); // มือถือ: เมนูรายการเต็มจอ
  const [sound, setSound] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [banId, setBanId] = useState<string | null>(null); // รายการที่กำลังเลือกแบนผู้ซื้อ
  const [banDur, setBanDur] = useState<BanDuration>("24h");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [zoom, setZoom] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [pw, setPw] = useState("");
  const [pwErr, setPwErr] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [anim, setAnim] = useState<Anim | null>(null); // รายการที่กำลังเล่นแอนิเมชันอนุมัติ
  const [pulse, setPulse] = useState(false); // เมนู "อนุมัติแล้ว" กระพริบตอนการ์ดลอยมาถึง

  const prevReviewing = useRef<number | null>(null);
  const soundRef = useRef(true);
  const tabRef = useRef<Tab>("reviewing");
  const boothRef = useRef("");
  const animRef = useRef<Anim | null>(null);
  soundRef.current = sound;
  tabRef.current = tab;
  boothRef.current = boothFilter;

  function updateAnim(next: Anim | null) {
    animRef.current = next;
    setAnim(next);
  }

  const load = useCallback(async () => {
    try {
      const current = tabRef.current;
      const special = current === "summary" || current === "scans" || current === "bans" || current === "spin";
      const listStatus: ListTab =
        current === "summary" || current === "scans" || current === "bans" || current === "spin"
          ? "reviewing"
          : current;
      const scansUrl = `/api/admin/scans${boothRef.current ? `?booth=${encodeURIComponent(boothRef.current)}` : ""}`;
      const extraUrl =
        current === "summary"
          ? "/api/admin/summary"
          : current === "scans"
            ? scansUrl
            : current === "bans"
              ? "/api/admin/bans"
              : current === "spin"
                ? "/api/admin/spin-winners"
                : null;
      const [res, extraRes] = await Promise.all([
        fetch(`/api/admin/payments?status=${listStatus}`, { cache: "no-store" }),
        extraUrl ? fetch(extraUrl, { cache: "no-store" }) : Promise.resolve(null),
      ]);
      // ยังไม่กรอกรหัส admin (หรือหมดอายุ 12 ชั่วโมง) → หน้ากรอกรหัส
      if (res.status === 401 || res.status === 403 || extraRes?.status === 401 || extraRes?.status === 403) {
        return setGate("locked");
      }
      if (!res.ok) return setNote("โหลดข้อมูลไม่ได้ กำลังลองใหม่");
      const data = (await res.json()) as { counts: Counts; payments: Item[] };
      setGate("ok");
      setNote("");
      if (!special) {
        // รายการที่กำลังเล่นแอนิเมชันอนุมัติ ต้องค้างอยู่จนแอนิเมชันจบ แม้เซิร์ฟเวอร์ย้ายออกจากรายการนี้แล้ว
        const a = animRef.current;
        setItems((prev) => {
          if (!a || data.payments.some((x) => x.id === a.id)) return data.payments;
          const at = prev.findIndex((x) => x.id === a.id);
          if (at < 0) return data.payments;
          const next = [...data.payments];
          next.splice(Math.min(at, next.length), 0, prev[at]);
          return next;
        });
      }
      setCounts(data.counts);
      if (prevReviewing.current !== null && data.counts.reviewing > prevReviewing.current && soundRef.current) beep();
      prevReviewing.current = data.counts.reviewing;

      if (extraRes) {
        if (!extraRes.ok) {
          setNote(
            current === "summary"
              ? "โหลดสรุปยอดไม่ได้ กำลังลองใหม่"
              : current === "scans"
                ? "โหลดประวัติสแกนไม่ได้ กำลังลองใหม่"
                : current === "spin"
                  ? "โหลดรายชื่อผู้ถูกรางวัลไม่ได้ กำลังลองใหม่"
                  : "โหลดรายชื่อผู้ถูกแบนไม่ได้ กำลังลองใหม่",
          );
        } else if (current === "summary") {
          setSummary((await extraRes.json()) as Summary);
          // จำนวนตั๋วที่ขายแล้ว (อนุมัติแล้วเท่านั้น) ใช้แหล่งเดียวกับหน้าหลัก
          try {
            const st = await fetch("/api/stats", { cache: "no-store" });
            if (st.ok) {
              const s = (await st.json()) as Partial<Sold>;
              setSold({ booth: s.booth ?? 0, lucky: s.lucky ?? 0 });
            }
          } catch {
            /* ข้ามได้ รอบหน้าลองใหม่ */
          }
        } else if (current === "scans") {
          setScanData((await extraRes.json()) as ScanData);
        } else if (current === "spin") {
          setSpinList(((await extraRes.json()) as { winners: SpinWinner[] }).winners);
        } else {
          setBanList(((await extraRes.json()) as { bans: BanRow[] }).bans);
        }
      }
    } catch {
      setNote("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กำลังลองใหม่");
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load, tab, boothFilter]);

  useEffect(() => {
    document.title = counts.reviewing > 0 ? `(${counts.reviewing}) รอตรวจสลิป · Admin` : "Admin · Payday Park";
  }, [counts.reviewing]);

  // โหลดจำนวนที่เคยเปิดดูแล้ว (ของเมนูอัตโนมัติ / ถูกแบน) จากเบราว์เซอร์
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SEEN_KEY);
      if (raw) {
        const v = JSON.parse(raw) as Partial<Seen>;
        setSeen({ auto: Number(v.auto) || 0, bans: Number(v.bans) || 0 });
      }
    } catch {
      /* ข้ามได้ */
    }
  }, []);

  // จุดแดงของเมนูอัตโนมัติ/ถูกแบน: เปิดดูเมนูนั้นอยู่ (หรือจำนวนลดลง) = จำนวนที่เห็นแล้วเท่ากับจำนวนปัจจุบัน → จุดแดงหาย
  // มีรายการใหม่เข้ามา (จำนวนมากกว่าที่เห็นแล้ว) ตอนไม่ได้เปิดดูอยู่ = จุดแดงขึ้น
  useEffect(() => {
    if (gate !== "ok") return;
    setSeen((prev) => {
      const next = { ...prev };
      (["auto", "bans"] as const).forEach((k) => {
        if (tab === k || counts[k] < prev[k]) next[k] = counts[k];
      });
      if (next.auto === prev.auto && next.bans === prev.bans) return prev;
      try {
        localStorage.setItem(SEEN_KEY, JSON.stringify(next));
      } catch {
        /* ข้ามได้ */
      }
      return next;
    });
  }, [counts, tab, gate]);

  // กด Esc ปิดรูปสลิปขนาดใหญ่ / เมนูเต็มจอ (คอมพิวเตอร์)
  useEffect(() => {
    if (!zoom && !menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (zoom) setZoom(null);
      else setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoom, menuOpen]);

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

  async function lock() {
    await fetch("/api/admin/login", { method: "DELETE" }).catch(() => {});
    setItems([]);
    setSummary(null);
    setSold(null);
    setScanData(null);
    setBanList(null);
    setSpinList(null);
    setQuery("");
    setBoothFilter("");
    setCounts({ reviewing: 0, approved: 0, auto: 0, rejected: 0, bans: 0 });
    setDetailId(null);
    setConfirmId(null);
    setRejectId(null);
    setBanId(null);
    setMenuOpen(false);
    setZoom(null);
    updateAnim(null);
    prevReviewing.current = null;
    setGate("locked");
  }

  // แอนิเมชันอนุมัติ: การ์ดเป็นสีเขียว + ติกถูก → ลอยเข้าเมนู "อนุมัติแล้ว" → ช่องว่างยุบลง → เอาออกจากรายการ
  function playApprove(id: string) {
    const reduce = typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    updateAnim({ id, phase: "green", dx: 0, dy: 0, h: 0 });
    const finish = () => {
      updateAnim(null);
      setItems((prev) => prev.filter((x) => x.id !== id));
      load();
    };
    if (reduce) {
      setTimeout(finish, 900);
      return;
    }
    setTimeout(() => {
      const el = document.getElementById(`card-${id}`);
      if (!el) {
        finish();
        return;
      }
      const r = el.getBoundingClientRect();
      let dx = 0;
      let dy = -r.height;
      const t = flyTarget();
      if (t) {
        const tr = t.getBoundingClientRect();
        dx = tr.left + tr.width / 2 - (r.left + r.width / 2);
        // ปุ่มเมนูบนมือถืออาจเลื่อนพ้นจอไปแล้ว ให้ลอยไปชิดขอบบนของจอแทน
        const ty = Math.max(tr.top + tr.height / 2, 24);
        dy = ty - (r.top + r.height / 2);
      }
      updateAnim({ id, phase: "fly", dx, dy, h: r.height });
      setTimeout(() => {
        setPulse(true);
        setTimeout(() => setPulse(false), 900);
      }, 480);
      setTimeout(() => {
        const cur = animRef.current;
        if (cur && cur.id === id) updateAnim({ ...cur, phase: "collapse" });
      }, 380);
      setTimeout(finish, 800);
    }, 850);
  }

  async function act(id: string, body: { action: "approve" } | { action: "reject"; reason: string }) {
    setBusyId(id);
    setNote("");
    let ok = false;
    try {
      const res = await fetch(`/api/admin/payments/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setNote(data.error ?? "ทำรายการไม่สำเร็จ");
      else ok = true;
    } catch {
      setNote("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้");
    }
    setBusyId(null);
    setConfirmId(null);
    setRejectId(null);
    setReason("");
    if (ok && body.action === "approve") {
      playApprove(id);
      return;
    }
    load();
  }

  // admin แบนผู้ซื้อของรายการนี้เอง (แบนอย่างเดียว รายการยังค้างรอตรวจ)
  async function banBuyer(paymentId: string, duration: BanDuration) {
    setBusyId(paymentId);
    setNote("");
    try {
      const res = await fetch("/api/admin/bans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ban", paymentId, duration }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setNote(data.error ?? "แบนไม่สำเร็จ");
    } catch {
      setNote("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้");
    }
    setBusyId(null);
    setBanId(null);
    load();
  }

  // ปลดแบนผู้ใช้ก่อนครบเวลา
  async function unban(userId: string) {
    setBusyId(userId);
    setNote("");
    try {
      const res = await fetch("/api/admin/bans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action: "unban" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setNote(data.error ?? "ปลดแบนไม่สำเร็จ");
    } catch {
      setNote("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้");
    }
    setBusyId(null);
    load();
  }

  const shell = `min-h-screen bg-[#f1f7e9] text-[#14402c] ${appFont.className}`;

  if (gate === "locked") {
    return (
      <div className={shell}>
        <style>{FX_CSS}</style>
        <main className="admin-fade-down mx-auto max-w-md px-4 py-16 text-center sm:px-5">
          <h1 className="text-2xl font-bold">หน้าเจ้าหน้าที่</h1>
          <p className="mt-3 text-sm text-[#4d6652]">กรอกรหัสผ่าน admin เพื่อเข้าใช้งาน</p>
          <form onSubmit={unlock} className="mt-5">
            <input
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="รหัสผ่าน admin"
              autoComplete="current-password"
              autoFocus
              maxLength={200}
              className="min-h-12 w-full rounded-xl border border-[#cfdcc0] bg-white px-4 py-3 text-base outline-none transition focus:border-[#14402c] focus:ring-2 focus:ring-[#d9f27a] sm:text-sm"
            />
            {pwErr && (
              <p role="alert" className="admin-fade-down mt-3 text-sm font-medium text-red-600">
                {pwErr}
              </p>
            )}
            <button
              type="submit"
              disabled={pwBusy || pw.length === 0}
              className="mt-4 min-h-12 w-full rounded-2xl bg-[#14402c] py-3 text-sm font-bold text-white transition active:scale-[0.97] disabled:opacity-60"
            >
              {pwBusy ? "กำลังตรวจสอบ..." : "เข้าสู่หน้า admin"}
            </button>
          </form>
          <a href="/" className="mt-5 inline-block text-sm font-semibold text-[#4d6652] underline">
            กลับหน้าแรก
          </a>
        </main>
      </div>
    );
  }

  if (gate !== "ok") {
    return (
      <div className={shell}>
        <main className="mx-auto max-w-md px-4 py-16 text-center sm:px-5">
          <h1 className="text-2xl font-bold">หน้าเจ้าหน้าที่</h1>
          <p className="mt-3 text-sm text-[#4d6652]">กำลังโหลด...</p>
        </main>
      </div>
    );
  }

  const tabs: [Tab, string][] = [
    ["reviewing", "รอตรวจ"],
    ["approved", "อนุมัติแล้ว"],
    ["auto", "อัตโนมัติ"],
    ["rejected", "ปฏิเสธ"],
    ["bans", "ถูกแบน"],
    ["summary", "สรุปยอด"],
    ["scans", "สแกนตั๋ว"],
    ["spin", "ผลสุ่ม Spin"],
  ];

  const heading =
    tab === "summary"
      ? "สรุปยอดขาย"
      : tab === "scans"
        ? "ประวัติสแกนตั๋ว"
        : tab === "bans"
          ? "ผู้ใช้ที่ถูกแบน"
          : tab === "spin"
            ? "ผู้ถูกรางวัล Spin"
            : tab === "auto"
              ? "อนุมัติอัตโนมัติ"
              : "ตรวจสลิป";

  // เงินรวมที่ทุกซุ้มยิงได้ (ไม่นับจุดรับตั๋วกระดาษ เพราะไม่มีมูลค่า)
  const boothTotal = scanData ? scanData.booths.reduce((s, b) => s + b.amount, 0) : 0;

  // รายชื่อที่กรองตามคำค้นหา (ชื่อ / รหัสพนักงาน / แผนก / เบอร์โทร ฯลฯ)
  const q = query.trim();
  const searching = q !== "";
  const itemRows = items.filter((p) => matches(q, [p.name, p.phone, p.empCode, p.company, p.department, p.ref]));
  const banRows = banList
    ? banList.filter((b) => matches(q, [b.name, b.username, b.phone, b.empCode, b.company, b.department, b.payment?.ref]))
    : null;
  const scanRows = scanData
    ? scanData.scans.filter((s) => matches(q, [s.name, s.phone, s.empCode, s.company, s.department, s.code, s.boothName]))
    : [];
  const spinRows = spinList
    ? spinList.filter((w) => matches(q, [w.name, w.phone, w.empCode, w.company, w.department, w.code]))
    : null;

  // จุดแดงบนเมนู: รอตรวจ = ยังมีรายการค้างอยู่ / อัตโนมัติ + ถูกแบน = มีรายการใหม่เข้ามาหลังจากที่เปิดดูล่าสุด (ไม่นับตอนเปิดดูเมนูนั้นอยู่)
  const dotFor = (id: Tab): boolean =>
    id === "reviewing"
      ? counts.reviewing > 0 && tab !== "reviewing"
      : id === "auto"
        ? counts.auto > seen.auto && tab !== "auto"
        : id === "bans"
          ? counts.bans > seen.bans && tab !== "bans"
          : false;
  const anyDot = (["reviewing", "auto", "bans"] as const).some((id) => dotFor(id));

  function selectTab(id: Tab) {
    setTab(id);
    setItems([]);
    setQuery("");
    setDetailId(null);
    setConfirmId(null);
    setRejectId(null);
    setBanId(null);
    setMenuOpen(false);
  }

  // ปุ่มเมนูรายการ (แถบด้านข้างบนคอมพิวเตอร์ / เมนูเต็มจอบนมือถือ)
  const navItem = (id: Tab, label: string, big: boolean) => {
    const active = tab === id;
    const count = id === "summary" || id === "scans" || id === "spin" ? null : counts[id];
    return (
      <button
        key={id}
        type="button"
        role="tab"
        aria-selected={active}
        data-nav-id={id}
        onClick={() => selectTab(id)}
        className={`flex w-full items-center justify-between gap-3 rounded-2xl px-4 text-left font-bold transition active:scale-[0.98] ${
          big ? "min-h-14 text-base" : "min-h-11 text-sm"
        } ${active ? "bg-[#14402c] text-white" : "text-[#4d6652] hover:bg-[#e3ecd6]"} ${
          pulse && id === "approved" ? "admin-nav-pulse" : ""
        }`}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate">{label}</span>
          {dotFor(id) && (
            <span role="img" aria-label="มีรายการใหม่" className="h-2.5 w-2.5 shrink-0 rounded-full bg-red-500" />
          )}
        </span>
        {count !== null && (
          <span
            className={`min-w-7 shrink-0 rounded-full px-2 py-0.5 text-center text-xs transition-colors ${
              active ? "bg-white/20" : "bg-[#e3ecd6]"
            }`}
          >
            {num(count)}
          </span>
        )}
      </button>
    );
  };

  const controlButtons = (
    <>
      <button
        type="button"
        onClick={() => setSound((s) => !s)}
        aria-pressed={sound}
        className={`min-h-11 rounded-full px-5 py-2.5 text-xs font-bold transition active:scale-95 sm:text-sm ${
          sound ? "bg-[#d9f27a]" : "border border-[#cfdcc0] bg-white text-[#6b7f6f]"
        }`}
      >
        เสียงเตือน: {sound ? "เปิด" : "ปิด"}
      </button>
      <button
        type="button"
        onClick={lock}
        className="min-h-11 rounded-full border border-[#14402c] px-5 py-2.5 text-xs font-bold transition active:scale-95 sm:text-sm"
      >
        ล็อก
      </button>
    </>
  );

  // ช่องค้นหารายชื่อ (ใช้ทุกแถบที่เป็นรายชื่อ ยกเว้นสรุปยอด)
  const searchBox =
    tab === "summary" ? null : (
      <div className="relative mt-4">
        <svg
          viewBox="0 0 24 24"
          className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#6b7f6f]"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          aria-hidden
        >
          <circle cx="11" cy="11" r="6.5" />
          <path d="M16 16l4.5 4.5" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ค้นหา ชื่อ / รหัสพนักงาน / แผนก / เบอร์โทร"
          aria-label="ค้นหารายชื่อ"
          autoComplete="off"
          maxLength={100}
          className="min-h-12 w-full rounded-full border border-[#cfdcc0] bg-white pl-12 pr-12 text-base outline-none transition focus:border-[#14402c] focus:ring-2 focus:ring-[#d9f27a] sm:text-sm"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="ล้างคำค้นหา"
            className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-lg font-bold text-[#6b7f6f] transition hover:bg-[#e3ecd6] active:scale-90"
          >
            ×
          </button>
        )}
      </div>
    );

  const noMatch = (
    <div className="admin-fade-down mt-6 rounded-3xl border border-dashed border-[#b9cba6] bg-white/60 p-8 text-center text-sm text-[#4d6652] sm:text-base">
      ไม่พบรายการที่ตรงกับ “{q}”
    </div>
  );

  // ส่วนท้ายการ์ดตอนอนุมัติสำเร็จ (แทนปุ่มต่าง ๆ ระหว่างเล่นแอนิเมชัน)
  const approvedFooter = (p: Item) => (
    <div className="admin-fade-down flex items-center justify-center gap-2 border-t border-green-700 bg-green-600 p-3 text-sm font-bold text-white sm:p-4">
      <span aria-hidden="true">✓</span>
      <span>
        อนุมัติแล้ว {baht(p.amount)} · ออกตั๋วแล้ว
      </span>
    </div>
  );

  // ปุ่ม ปฏิเสธ / แบน / อนุมัติ ของรายการในแถบ "รอตรวจ"
  const renderActions = (p: Item, passed: boolean) => (
    <div className="border-t border-[#e3ecd6] bg-[#f8fbf3] p-3 sm:p-4">
      {rejectId === p.id ? (
        <div className="admin-fade-down">
          <div className="flex flex-wrap gap-2">
            {REASONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setReason(r)}
                className={`min-h-10 rounded-full px-3.5 py-2 text-xs font-semibold transition active:scale-95 sm:text-sm ${reason === r ? "bg-[#14402c] text-white" : "bg-white"}`}
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
            className="mt-3 min-h-12 w-full rounded-xl border border-[#cfdcc0] bg-white px-4 py-3 text-base outline-none transition focus:border-[#14402c] focus:ring-2 focus:ring-[#d9f27a] sm:text-sm"
          />
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => {
                setRejectId(null);
                setReason("");
              }}
              className="min-h-12 flex-1 rounded-2xl border border-[#14402c] py-3 text-sm font-semibold transition active:scale-[0.97]"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              disabled={busyId === p.id || reason.trim().length < 2}
              onClick={() => act(p.id, { action: "reject", reason })}
              className="min-h-12 flex-1 rounded-2xl bg-red-600 py-3 text-sm font-bold text-white transition active:scale-[0.97] disabled:opacity-50"
            >
              ปฏิเสธสลิป
            </button>
          </div>
        </div>
      ) : banId === p.id ? (
        <div className="admin-fade-down">
          <p className="text-xs font-semibold text-red-600 sm:text-sm">
            แบน {p.name} ({p.phone}) ไม่ให้สร้างรายการและส่งสลิป รายการนี้ยังค้างรอตรวจตามเดิม
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {BAN_OPTIONS.map(([d, label]) => (
              <button
                key={d}
                type="button"
                onClick={() => setBanDur(d)}
                aria-pressed={banDur === d}
                className={`min-h-10 rounded-full px-3.5 py-2 text-xs font-semibold transition active:scale-95 sm:text-sm ${banDur === d ? "bg-[#14402c] text-white" : "bg-white"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => setBanId(null)}
              className="min-h-12 flex-1 rounded-2xl border border-[#14402c] py-3 text-sm font-semibold transition active:scale-[0.97]"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              disabled={busyId === p.id}
              onClick={() => banBuyer(p.id, banDur)}
              className="min-h-12 flex-1 rounded-2xl bg-red-600 py-3 text-sm font-bold text-white transition active:scale-[0.97] disabled:opacity-60"
            >
              {busyId === p.id ? "กำลังแบน..." : "ยืนยันแบน"}
            </button>
          </div>
        </div>
      ) : confirmId === p.id ? (
        <div className="admin-fade-down">
          {!passed && (
            <p className="mb-2 text-xs font-semibold text-yellow-700 sm:text-sm">
              ! ระบบยังไม่ยืนยันสลิปนี้ ตรวจกับรายการเข้าบัญชีแล้วใช่ไหม
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirmId(null)}
              className="min-h-12 flex-1 rounded-2xl border border-[#14402c] py-3 text-sm font-semibold transition active:scale-[0.97]"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              disabled={busyId === p.id || anim !== null}
              onClick={() => act(p.id, { action: "approve" })}
              className="min-h-12 flex-[1.4] rounded-2xl bg-[#14402c] px-2 py-3 text-sm font-bold text-white transition active:scale-[0.97] disabled:opacity-60"
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
              setBanId(null);
            }}
            className="min-h-12 flex-1 rounded-2xl border border-red-300 py-3 text-sm font-semibold text-red-600 transition active:scale-[0.97]"
          >
            ปฏิเสธ
          </button>
          <button
            type="button"
            onClick={() => {
              setBanId(p.id);
              setRejectId(null);
              setConfirmId(null);
            }}
            className="min-h-12 flex-1 rounded-2xl border border-red-600 bg-red-50 py-3 text-sm font-bold text-red-700 transition active:scale-[0.97]"
          >
            แบน
          </button>
          <button
            type="button"
            onClick={() => {
              setConfirmId(p.id);
              setRejectId(null);
              setBanId(null);
            }}
            className="min-h-12 flex-1 rounded-2xl bg-[#14402c] py-3 text-sm font-bold text-white transition active:scale-[0.97]"
          >
            อนุมัติ
          </button>
        </div>
      )}
    </div>
  );

  // ส่วนท้ายการ์ดในแถบ "ถูกแบน": ข้อมูลการแบน + ปุ่มปลดแบน
  const banFooter = (b: BanRow) => (
    <div className="flex items-center justify-between gap-3 border-t border-[#e3ecd6] bg-[#fff1f1] p-3 sm:p-4">
      <div className="min-w-0">
        <p className="text-xs font-bold text-red-600 sm:text-sm">
          {isForever(b.bannedUntil) ? "แบนถาวร" : `แบนถึง ${fmtSec(b.bannedUntil)}`}
        </p>
        <p className="mt-0.5 break-words text-[11px] text-[#4d6652] sm:text-xs">
          บัญชี @{b.username}
          {b.name ? ` · ${b.name}` : ""} · {b.phone}
        </p>
        {orgText(b) && <p className="break-words text-[11px] text-[#4d6652] sm:text-xs">{orgText(b)}</p>}
        {b.bannedAt && <p className="text-[11px] text-[#6b7f6f] sm:text-xs">ถูกแบนเมื่อ {fmtSec(b.bannedAt)}</p>}
        {b.banReason && <p className="break-words text-[11px] text-[#6b7f6f] sm:text-xs">เหตุผล: {b.banReason}</p>}
        {b.payment && (
          <p className="text-[11px] text-[#6b7f6f] sm:text-xs">
            สถานะรายการ: {STATUS_LABEL[b.payment.status] ?? b.payment.status}
            {b.payment.status === "reviewing" ? " (อนุมัติ/ปฏิเสธที่แถบ “รอตรวจ”)" : ""}
          </p>
        )}
      </div>
      <button
        type="button"
        disabled={busyId === b.id}
        onClick={() => unban(b.id)}
        className="min-h-11 shrink-0 rounded-2xl bg-[#14402c] px-5 py-2.5 text-sm font-bold text-white transition active:scale-95 disabled:opacity-60"
      >
        {busyId === b.id ? "กำลังปลด..." : "ปลดแบน"}
      </button>
    </div>
  );

  // การ์ดรายการ (ใช้ร่วมกันทั้งแถบ รอตรวจ / อนุมัติแล้ว / อัตโนมัติ / ปฏิเสธ / ถูกแบน) footer = ส่วนท้ายการ์ดที่ต่างกันตามแถบ
  const renderPayment = (p: Item, footer: ReactNode) => {
    const check = p.slip?.check ?? null;
    const passed = check?.ok === true;
    const open = detailId === p.id;
    const toggle = () => p.slip && setDetailId(open ? null : p.id);
    const a = anim && anim.id === p.id ? anim : null;
    return (
      <li
        key={p.id}
        id={`card-${p.id}`}
        style={cardStyle(a)}
        className={`admin-card-in relative min-w-0 overflow-hidden rounded-3xl border transition-colors duration-300 ${
          a ? "border-green-500 bg-green-100" : "border-[#e3ecd6] bg-white"
        }`}
      >
        <div className="flex gap-3 p-3 sm:gap-4 sm:p-4">
          <button
            type="button"
            onClick={() => setZoom(p.id)}
            aria-label="ดูสลิปขนาดใหญ่"
            className="h-32 w-20 shrink-0 overflow-hidden rounded-xl bg-[#e3ecd6] transition active:scale-95 sm:h-44 sm:w-32"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/admin/payments/${p.id}/slip-image`}
              alt={`สลิป ${p.ref}`}
              loading="lazy"
              className="h-full w-full object-cover object-top"
            />
          </button>

          {/* ข้อมูลออเดอร์ + เครื่องหมายตรวจสอบด้านขวา กดตรงนี้เพื่อเปิดรายละเอียด */}
          <div
            role={p.slip ? "button" : undefined}
            tabIndex={p.slip ? 0 : undefined}
            aria-expanded={p.slip ? open : undefined}
            aria-label={p.slip ? (passed ? "ระบบตรวจสลิปผ่าน กดดูรายละเอียด" : "ต้องตรวจสลิปเอง กดดูรายละเอียด") : undefined}
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
              <div className="mt-1 flex flex-wrap gap-1.5">
                {p.retry && (
                  <span className="inline-block rounded-full bg-orange-500 px-2.5 py-0.5 text-[11px] font-bold text-white sm:text-xs">
                    ✏️ แก้ไข{p.retry.count > 1 ? ` (ส่งใหม่ครั้งที่ ${p.retry.count + 1})` : " (ส่งใหม่หลังถูกปฏิเสธ)"}
                  </span>
                )}
                {p.auto && (
                  <span className="inline-block rounded-full bg-[#d9f27a] px-2.5 py-0.5 text-[11px] font-bold sm:text-xs">
                    ⚡ อนุมัติอัตโนมัติโดยระบบ
                  </span>
                )}
                {check?.banned && (
                  <span className="inline-block rounded-full bg-red-600 px-2.5 py-0.5 text-[11px] font-bold text-white sm:text-xs">
                    ⛔ ระบบแบนผู้ซื้อ 1 ชม.
                  </span>
                )}
              </div>
              {p.retry?.lastReason && (
                <p className="mt-1 break-words text-[11px] font-semibold text-orange-600 sm:text-xs">
                  ครั้งก่อนถูกปฏิเสธ: {p.retry.lastReason}
                </p>
              )}
              <p className="mt-1 text-sm">
                รหัสออเดอร์ <span className="break-all font-mono font-bold">{p.ref}</span>
              </p>
              <div className="mt-2 flex items-center gap-2.5">
                <Avatar key={p.avatarUrl ?? "none"} src={p.avatarUrl} name={p.name} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{p.name}</p>
                  <p className="text-xs text-[#4d6652] sm:text-sm">{p.phone}</p>
                  {orgText(p) && <p className="break-words text-[11px] text-[#4d6652] sm:text-xs">{orgText(p)}</p>}
                </div>
              </div>
              <p className="mt-2 text-xs text-[#4d6652] sm:text-sm">
                เข้าซุ้ม {p.booth} · Lucky Draw {p.lucky}
              </p>
              <p className="mt-1 text-xs text-[#6b7f6f] sm:text-sm">
                ส่งสลิป {fmt(p.slipAt)}
                {p.slip && ` · ${BANKS[p.slip.sendingBank] ?? `ธนาคาร ${p.slip.sendingBank}`}`}
              </p>
              {p.slip && <p className="mt-0.5 break-all font-mono text-[11px] text-[#6b7f6f]">{p.slip.transRef}</p>}
              {p.rejectReason && <p className="mt-2 text-xs font-semibold text-red-600 sm:text-sm">ปฏิเสธ: {p.rejectReason}</p>}
              {p.slip && (
                <p className="mt-2 text-[11px] font-semibold text-[#4d6652] sm:text-xs">
                  {open ? "▲ ซ่อนรายละเอียด" : "▼ ดูผลตรวจสลิป"}
                </p>
              )}
            </div>

            {p.slip && (
              <div
                aria-hidden="true"
                className="flex shrink-0 flex-col justify-center gap-2.5 border-l border-[#e3ecd6] pl-3 sm:gap-3 sm:pl-4"
              >
                <Mark ok={check ? check.amountOk : null} label="ยอดเงิน" />
                <Mark ok={check ? check.receiverOk : null} label="ผู้รับเงิน" />
                <Mark ok={check ? check.timeOk : null} label="วันเวลาโอน" />
                <Mark ok={check ? true : null} label="เลขอ้างอิง" />
              </div>
            )}
          </div>
        </div>

        {open && p.slip && (
          <div className="admin-fade-down border-t border-[#e3ecd6] bg-[#fffbe6] px-3 py-3 sm:px-4">
            {check ? (
              <ul className="space-y-2">
                <Row
                  ok={check.amountOk}
                  label="ยอดเงิน"
                  value={
                    check.amount === null
                      ? `อ่านยอดจากสลิปไม่ได้ (ต้องเป็น ${baht(p.amount)})`
                      : check.amountOk
                        ? `${baht(check.amount)} ตรงกับรายการ`
                        : `สลิป ${baht(check.amount)} ≠ รายการ ${baht(p.amount)}`
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
                      ? `สลิป ${fmt(check.transferAt)} · ออเดอร์ ${fmt(p.createdAt)}${
                          check.timeOk ? " (วันเดียวกัน ไม่เกิน 1 ชม.)" : " (ต้องเป็นวันเดียวกับออเดอร์ และโอนหลังสร้างออเดอร์ไม่เกิน 1 ชม.)"
                        }`
                      : "อ่านวันเวลาจากสลิปไม่ได้"
                  }
                />
                <Row ok label="เลขอ้างอิง" value="ไม่ซ้ำกับสลิปอื่น" />
              </ul>
            ) : (
              <p className="text-xs text-[#4d6652] sm:text-sm">สลิปนี้ยังไม่ได้ตรวจอัตโนมัติ กรุณาตรวจเอง</p>
            )}
            {check?.banned && (
              <p className="mt-3 text-xs font-semibold text-red-600 sm:text-sm">
                ระบบแบนผู้ซื้อคนนี้ 1 ชั่วโมงแล้ว เพราะสลิปไม่ผ่านการตรวจอัตโนมัติ ถ้าตรวจแล้วว่าสลิปถูกต้อง ไปปลดแบนได้ที่เมนู “ถูกแบน”
              </p>
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

        {a ? approvedFooter(p) : footer}

        {/* ติกถูกใหญ่กลางการ์ดตอนอนุมัติสำเร็จ */}
        {a && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-green-500/20"
          >
            <span className="admin-pop-in flex h-24 w-24 items-center justify-center rounded-full bg-green-600 shadow-xl ring-4 ring-white">
              <svg
                viewBox="0 0 24 24"
                className="h-14 w-14"
                fill="none"
                stroke="white"
                strokeWidth="3.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path className="admin-check-draw" d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
            </span>
          </div>
        )}
      </li>
    );
  };

  return (
    <div className={shell}>
      <style>{FX_CSS}</style>
      <div className="md:flex md:items-start">
        {/* แถบรายการด้านข้าง (คอมพิวเตอร์) ชิดซ้ายเต็มความสูงหน้าจอ */}
        <aside className="hidden md:sticky md:top-0 md:block md:h-screen md:w-64 md:shrink-0 md:overflow-y-auto md:border-r md:border-[#e3ecd6] md:bg-white md:p-4">
          <p className="px-3 pb-2 pt-1 text-xs font-bold text-[#6b7f6f]">เมนูรายการ</p>
          <nav role="tablist" aria-orientation="vertical" aria-label="เมนูรายการ" className="flex flex-col gap-1">
            {tabs.map(([id, label]) => navItem(id, label, false))}
          </nav>
          <div className="mt-4 flex flex-col gap-2 border-t border-[#e3ecd6] pt-4 [&>button]:w-full">{controlButtons}</div>
        </aside>

        <div className="min-w-0 flex-1">
          <div className="mx-auto w-full max-w-lg px-4 pb-16 pt-5 sm:max-w-3xl sm:px-6 sm:pt-8 md:max-w-4xl md:px-8">
            <main className="min-w-0">
              <header>
                <div className="flex items-center gap-3">
                  {/* ปุ่ม 3 ขีด เปิดเมนูรายการเต็มจอ (มือถือ) */}
                  <button
                    type="button"
                    data-menu-btn
                    onClick={() => setMenuOpen(true)}
                    aria-label={anyDot ? "เปิดเมนูรายการ (มีรายการใหม่)" : "เปิดเมนูรายการ"}
                    aria-haspopup="dialog"
                    aria-expanded={menuOpen}
                    className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#14402c] bg-white transition active:scale-95 md:hidden ${
                      pulse ? "admin-nav-pulse" : ""
                    }`}
                  >
                    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
                      <path d="M4 7h16M4 12h16M4 17h16" />
                    </svg>
                    {anyDot && (
                      <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-[#f1f7e9] bg-red-500" />
                    )}
                  </button>
                  <h1 className="min-w-0 flex-1 truncate text-2xl font-bold sm:text-3xl">{heading}</h1>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-[#4d6652] sm:text-sm">
                  {tab === "summary"
                    ? "ยอดขายนับจากรายการที่อนุมัติแล้วเท่านั้น รายการที่รอตรวจแสดงแยกไว้ต่างหาก"
                    : tab === "scans"
                      ? "ประวัติการยิงบาร์โค้ดตั๋วเข้างานจากหน้า /ticket แยกตามบัญชีซุ้ม ดูได้ว่าซุ้มไหนยิงให้ใคร เวลาไหน และรวมเป็นเงินเท่าไหร่ ตั๋ว 1 ใบยิงผ่านได้ครั้งเดียว ครั้งต่อไปจะขึ้นว่าซ้ำ"
                      : tab === "spin"
                        ? "รายชื่อผู้ที่ถูกรางวัลจากตู้สุ่ม (หน้า /spin) ทุกรอบ เรียงคนที่ได้ล่าสุดขึ้นก่อน อันดับคือลำดับที่ได้รางวัล (คนแรก = อันดับ 1)"
                        : tab === "bans"
                          ? "ผู้ซื้อที่ถูกแบนไม่ให้สร้างรายการและส่งสลิป (ระบบแบนเองเมื่ออ่านสลิปได้แต่ไม่ผ่านข้อใดข้อหนึ่ง: ยอดเงิน ผู้รับเงิน วันเวลาโอน หรือ admin แบนเอง) การ์ดแสดงสลิปและผลตรวจของรายการที่ทำให้ถูกแบน กดปลดแบนได้ก่อนครบเวลา ส่วนการอนุมัติ/ปฏิเสธรายการทำที่เมนู “รอตรวจ”"
                          : tab === "auto"
                            ? "รายการที่ระบบอนุมัติให้เองเพราะตรวจสลิปผ่านครบทุกข้อ (ยอดเงิน ผู้รับ วันเวลาโอน เลขอ้างอิง) และออกตั๋วแล้ว รายการเหล่านี้อยู่ในเมนู “อนุมัติแล้ว” ด้วย"
                            : "ระบบอ่านรูปสลิปจริงแล้วเทียบกับออเดอร์ ✓ = ตรงกับรายการ (เวลาโอนต้องเป็นวันเดียวกับออเดอร์และไม่เกิน 1 ชั่วโมงหลังสร้างออเดอร์) / ! = ต้องตรวจเอง ดูเครื่องหมายด้านขวาของแต่ละรายการ กดที่รายการเพื่อดูรายละเอียด เทียบ “ยอด” กับรายการเข้าบัญชีก่อนกดอนุมัติ (รหัสออเดอร์อยู่ใน QR ช่อง Additional Data)"}
                </p>
                <div className="mt-3 flex gap-2 md:hidden">{controlButtons}</div>
                {searchBox}
              </header>

              {note && (
                <p role="alert" className="admin-fade-down mt-3 text-sm font-medium text-red-600">
                  {note}
                </p>
              )}

              {tab === "summary" ? (
                !summary ? (
                  <div className="mt-6 rounded-3xl border border-dashed border-[#b9cba6] bg-white/60 p-8 text-center text-sm text-[#4d6652] sm:text-base">
                    กำลังโหลดสรุปยอด...
                  </div>
                ) : (
                  <section className="mt-5 sm:mt-6">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                      <Stat
                        title="ยอดเงินรวมทั้งหมด"
                        value={baht(summary.total.amount)}
                        sub={`ตั๋วทั้งหมด ${num(summary.total.count)} ใบ`}
                        tone="dark"
                      />
                      <Stat
                        title="จำนวนผู้ซื้อ"
                        value={`${num(summary.buyers)} คน`}
                        sub={`${num(summary.orders)} ออเดอร์ที่อนุมัติแล้ว`}
                        tone="accent"
                      />
                      <Stat
                        title="ตั๋วเข้างาน (ซุ้ม)"
                        value={`${num(summary.booth.count)} ใบ`}
                        sub={`รวมเป็นเงิน ${baht(summary.booth.amount)}`}
                      />
                      <Stat
                        title="ตั๋ว Lucky Draw"
                        value={`${num(summary.lucky.count)} ใบ`}
                        sub={`รวมเป็นเงิน ${baht(summary.lucky.amount)}`}
                      />
                      <Stat
                        title="แพ็ค Lucky Draw Pre-order"
                        value={`${num(summary.pack.count)} แพ็ค`}
                        sub={`${num(summary.pack.buyers)} คน · Lucky Draw ${num(summary.pack.tickets)} ใบ · ${baht(summary.pack.amount)}`}
                      />
                      <Stat
                        title="ตั๋วเข้าซุ้มที่จำหน่ายแล้ว"
                        value={sold ? `${num(sold.booth)} ชุด` : "–"}
                        sub="อนุมัติแล้วเท่านั้น (เหมือนหน้าหลัก)"
                      />
                      <Stat
                        title="Lucky Draw ที่ขายแล้ว"
                        value={sold ? `${num(sold.lucky)} ใบ` : "–"}
                        sub="อนุมัติแล้วเท่านั้น (เหมือนหน้าหลัก)"
                      />
                      <Stat
                        title="รอตรวจ (ยังไม่นับในยอดขาย)"
                        value={`${num(summary.pending.count)} รายการ`}
                        sub={`รวม ${baht(summary.pending.amount)}`}
                      />
                      <Stat title="ถูกปฏิเสธ" value={`${num(summary.rejected)} รายการ`} />
                    </div>

                    <div className="admin-card-in mt-5 overflow-hidden rounded-3xl border border-[#e3ecd6] bg-white">
                      <div className="flex items-center justify-between gap-3 p-4">
                        <h2 className="text-base font-bold sm:text-lg">ยอดขายรายวัน</h2>
                        <a
                          href="/api/admin/summary/csv"
                          download
                          className="min-h-10 shrink-0 rounded-full bg-[#14402c] px-4 py-2.5 text-xs font-bold text-white transition active:scale-95 sm:text-sm"
                        >
                          ส่งออก CSV
                        </a>
                      </div>
                      {summary.daily.length === 0 ? (
                        <p className="border-t border-[#e3ecd6] p-6 text-center text-sm text-[#4d6652]">ยังไม่มียอดขาย</p>
                      ) : (
                        <div className="overflow-x-auto border-t border-[#e3ecd6]">
                          <table className="w-full min-w-[420px] text-left text-xs sm:text-sm">
                            <thead className="bg-[#f8fbf3] text-[#4d6652]">
                              <tr>
                                <th className="px-4 py-2.5 font-semibold">วันที่</th>
                                <th className="px-2 py-2.5 text-right font-semibold">ออเดอร์</th>
                                <th className="px-2 py-2.5 text-right font-semibold">เข้างาน</th>
                                <th className="px-2 py-2.5 text-right font-semibold">Lucky</th>
                                <th className="px-4 py-2.5 text-right font-semibold">ยอดเงิน</th>
                              </tr>
                            </thead>
                            <tbody>
                              {summary.daily.map((d) => (
                                <tr key={d.date} className="border-t border-[#e3ecd6] transition-colors hover:bg-[#f8fbf3]">
                                  <td className="px-4 py-2.5 font-semibold">{fmtDay(d.date)}</td>
                                  <td className="px-2 py-2.5 text-right">{num(d.orders)}</td>
                                  <td className="px-2 py-2.5 text-right">{num(d.booth)}</td>
                                  <td className="px-2 py-2.5 text-right">{num(d.lucky)}</td>
                                  <td className="px-4 py-2.5 text-right font-bold">{baht(d.amount)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    <p className="mt-3 text-[11px] text-[#6b7f6f] sm:text-xs">
                      อัปเดตล่าสุด {fmt(summary.generatedAt)} · รีเฟรชอัตโนมัติทุก 10 วินาที
                    </p>
                  </section>
                )
              ) : tab === "spin" ? (
                !spinRows ? (
                  <div className="mt-6 rounded-3xl border border-dashed border-[#b9cba6] bg-white/60 p-8 text-center text-sm text-[#4d6652] sm:text-base">
                    กำลังโหลดรายชื่อผู้ถูกรางวัล...
                  </div>
                ) : spinList && spinList.length === 0 ? (
                  <div className="admin-fade-down mt-6 rounded-3xl border border-dashed border-[#b9cba6] bg-white/60 p-8 text-center text-sm text-[#4d6652] sm:text-base">
                    ยังไม่มีผู้ถูกรางวัลจากตู้สุ่ม
                  </div>
                ) : spinRows.length === 0 ? (
                  noMatch
                ) : (
                  <section className="mt-5 sm:mt-6">
                    <p className="text-xs font-semibold text-[#4d6652] sm:text-sm">
                      ผู้ถูกรางวัลทั้งหมด {num(spinList?.length ?? 0)} คน
                      {searching ? ` · พบ ${num(spinRows.length)} คน` : ""}
                    </p>
                    <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                      {spinRows.map((w) => (
                        <li key={w.id} className="admin-card-in min-w-0 overflow-hidden rounded-3xl border border-[#e3ecd6] bg-white">
                          <div className="flex items-center justify-between gap-3 bg-[#14402c] px-4 py-2.5 text-white">
                            <span className="rounded-full bg-[#d9f27a] px-3 py-0.5 text-sm font-extrabold text-[#14402c]">
                              อันดับ {num(w.rank)}
                            </span>
                            <span className="text-xs font-semibold text-white/80 sm:text-sm">{fmtSec(w.wonAt)}</span>
                          </div>
                          <div className="flex gap-3 p-4">
                            <Avatar
                              key={w.avatarUrl ?? "none"}
                              src={w.avatarUrl}
                              name={w.name}
                              className="h-16 w-16 text-2xl sm:h-20 sm:w-20 sm:text-3xl"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="break-words text-lg font-extrabold leading-tight sm:text-xl">{w.name || "-"}</p>
                              <dl className="mt-2 space-y-1 text-xs sm:text-sm">
                                <div className="flex gap-2">
                                  <dt className="w-20 shrink-0 text-[#6b7f6f]">รหัสพนักงาน</dt>
                                  <dd className="min-w-0 break-all font-mono font-bold">{w.empCode ?? "-"}</dd>
                                </div>
                                <div className="flex gap-2">
                                  <dt className="w-20 shrink-0 text-[#6b7f6f]">เบอร์โทร</dt>
                                  <dd className="min-w-0 break-all font-semibold">{w.phone || "-"}</dd>
                                </div>
                                <div className="flex gap-2">
                                  <dt className="w-20 shrink-0 text-[#6b7f6f]">บริษัท</dt>
                                  <dd className="min-w-0 break-words font-semibold">{w.company ?? "-"}</dd>
                                </div>
                                <div className="flex gap-2">
                                  <dt className="w-20 shrink-0 text-[#6b7f6f]">แผนก/สาขา</dt>
                                  <dd className="min-w-0 break-words font-semibold">{w.department ?? "-"}</dd>
                                </div>
                              </dl>
                              <p className="mt-2 break-all font-mono text-[10px] text-[#6b7f6f]">{w.code}</p>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-3 text-[11px] text-[#6b7f6f] sm:text-xs">รีเฟรชอัตโนมัติทุก 10 วินาที</p>
                  </section>
                )
              ) : tab === "scans" ? (
                !scanData ? (
                  <div className="mt-6 rounded-3xl border border-dashed border-[#b9cba6] bg-white/60 p-8 text-center text-sm text-[#4d6652] sm:text-base">
                    กำลังโหลดประวัติสแกน...
                  </div>
                ) : (
                  <section className="mt-5 sm:mt-6">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
                      <Stat title="ตั๋วที่ยิงผ่านแล้ว" value={`${num(scanData.total)} ใบ`} sub="ทุกซุ้มรวมกัน" tone="dark" />
                      <Stat title="เงินรวมที่ซุ้มยิงได้" value={baht(boothTotal)} sub="ตั๋วเล่นซุ้ม ทุกซุ้มรวมกัน" tone="accent" />
                      <Stat title="ยิงไม่ผ่าน" value={`${num(scanData.rejected)} ครั้ง`} sub="ซ้ำ / ผิดประเภท / ไม่พบ" />
                    </div>

                    <h2 className="mt-6 text-base font-bold sm:text-lg">สรุปรายซุ้ม</h2>
                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                      {scanData.booths.map((b) => (
                        <div key={b.id} className="admin-card-in min-w-0 rounded-3xl border border-[#e3ecd6] bg-white p-4 sm:p-5">
                          <div className="flex items-start justify-between gap-3">
                            <p className="min-w-0 truncate text-base font-bold sm:text-lg">{b.name}</p>
                            {b.kind === "paper" && (
                              <span className="shrink-0 rounded-full bg-[#fff1c2] px-2.5 py-0.5 text-[11px] font-bold text-[#b45309] sm:text-xs">
                                ตั๋วกระดาษ
                              </span>
                            )}
                          </div>
                          {b.kind === "paper" ? (
                            <p className="mt-2 text-2xl font-extrabold sm:text-3xl">
                              {num(b.count)} <span className="text-sm font-semibold text-[#4d6652]">ใบ · ไม่มีมูลค่า</span>
                            </p>
                          ) : (
                            <>
                              <p className="mt-2 text-2xl font-extrabold sm:text-3xl">{baht(b.amount)}</p>
                              <p className="mt-1 text-sm font-semibold text-[#4d6652]">{num(b.count)} ใบ</p>
                            </>
                          )}
                          <p className="mt-2 text-[11px] text-[#6b7f6f] sm:text-xs">
                            ยิงไม่ผ่าน {num(b.rejected)} ครั้ง · ยิงล่าสุด {fmtSec(b.lastAt)}
                          </p>
                        </div>
                      ))}
                    </div>

                    <div className="mt-5 overflow-hidden rounded-3xl border border-[#e3ecd6] bg-white">
                      <div className="p-4">
                        <h2 className="text-base font-bold sm:text-lg">ประวัติล่าสุด</h2>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {[{ id: "", name: "ทุกซุ้ม" }, ...scanData.booths.map((b) => ({ id: b.id, name: b.name }))].map((c) => (
                            <button
                              key={c.id || "all"}
                              type="button"
                              onClick={() => setBoothFilter(c.id)}
                              aria-pressed={boothFilter === c.id}
                              className={`min-h-10 rounded-full px-3.5 py-2 text-xs font-semibold transition active:scale-95 sm:text-sm ${
                                boothFilter === c.id ? "bg-[#14402c] text-white" : "bg-[#e3ecd6] text-[#4d6652]"
                              }`}
                            >
                              {c.name}
                            </button>
                          ))}
                        </div>
                      </div>
                      {scanData.scans.length === 0 ? (
                        <p className="border-t border-[#e3ecd6] p-6 text-center text-sm text-[#4d6652]">ยังไม่มีการยิงตั๋ว</p>
                      ) : scanRows.length === 0 ? (
                        <p className="border-t border-[#e3ecd6] p-6 text-center text-sm text-[#4d6652]">
                          ไม่พบรายการที่ตรงกับ “{q}”
                        </p>
                      ) : (
                        <div className="overflow-x-auto border-t border-[#e3ecd6]">
                          <table className="w-full min-w-[680px] text-left text-xs sm:text-sm">
                            <thead className="bg-[#f8fbf3] text-[#4d6652]">
                              <tr>
                                <th className="px-4 py-2.5 font-semibold">เวลา</th>
                                <th className="px-2 py-2.5 font-semibold">ซุ้มที่ยิง</th>
                                <th className="px-2 py-2.5 font-semibold">ชื่อผู้ถือตั๋ว</th>
                                <th className="px-2 py-2.5 font-semibold">รหัสตั๋ว</th>
                                <th className="px-2 py-2.5 text-right font-semibold">มูลค่า</th>
                                <th className="px-4 py-2.5 text-right font-semibold">ผล</th>
                              </tr>
                            </thead>
                            <tbody>
                              {scanRows.map((s) => {
                                const r = SCAN_LABEL[s.result] ?? { label: s.result, cls: "bg-[#e3ecd6] text-[#14402c]" };
                                return (
                                  <tr key={s.id} className="border-t border-[#e3ecd6] align-top transition-colors hover:bg-[#f8fbf3]">
                                    <td className="whitespace-nowrap px-4 py-2.5 font-semibold">{fmtSec(s.at)}</td>
                                    <td className="px-2 py-2.5 font-semibold">{s.boothName ?? "-"}</td>
                                    <td className="px-2 py-2.5">
                                      <p className="font-semibold">{s.name ?? "-"}</p>
                                      {s.phone && <p className="text-[#4d6652]">{s.phone}</p>}
                                      {orgText(s) && <p className="text-[#6b7f6f]">{orgText(s)}</p>}
                                    </td>
                                    <td className="px-2 py-2.5">
                                      <p className="break-all font-mono">{s.code}</p>
                                      {s.result === "duplicate" && s.firstUsedAt && (
                                        <p className="mt-0.5 text-[#6b7f6f]">ยิงครั้งแรก {fmtSec(s.firstUsedAt)}</p>
                                      )}
                                    </td>
                                    <td className="whitespace-nowrap px-2 py-2.5 text-right font-bold">
                                      {s.result === "ok" && s.amount !== null ? (s.amount > 0 ? baht(s.amount) : "ไม่มีมูลค่า") : "-"}
                                    </td>
                                    <td className="px-4 py-2.5 text-right">
                                      <span className={`inline-block whitespace-nowrap rounded-full px-3 py-1 font-bold ${r.cls}`}>
                                        {r.label}
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    <p className="mt-3 text-[11px] text-[#6b7f6f] sm:text-xs">แสดง 200 รายการล่าสุด · รีเฟรชอัตโนมัติทุก 10 วินาที</p>
                  </section>
                )
              ) : tab === "bans" ? (
                !banRows ? (
                  <div className="mt-6 rounded-3xl border border-dashed border-[#b9cba6] bg-white/60 p-8 text-center text-sm text-[#4d6652] sm:text-base">
                    กำลังโหลดรายชื่อผู้ถูกแบน...
                  </div>
                ) : banList && banList.length === 0 ? (
                  <div className="admin-fade-down mt-6 rounded-3xl border border-dashed border-[#b9cba6] bg-white/60 p-8 text-center text-sm text-[#4d6652] sm:text-base">
                    ไม่มีผู้ใช้ที่ถูกแบนอยู่ตอนนี้
                  </div>
                ) : banRows.length === 0 ? (
                  noMatch
                ) : (
                  <ul className="mt-5 space-y-4 sm:mt-6">
                    {banRows.map((b) =>
                      b.payment ? (
                        renderPayment(b.payment, banFooter(b))
                      ) : (
                        <li key={b.id} className="admin-card-in min-w-0 overflow-hidden rounded-3xl border border-[#e3ecd6] bg-white">
                          <div className="flex items-center gap-2.5 p-4">
                            <Avatar key={b.avatarUrl ?? "none"} src={b.avatarUrl} name={b.name || b.username} />
                            <p className="min-w-0 text-sm text-[#4d6652]">
                              {b.name || b.username} · ไม่พบรายการที่ส่งสลิปของผู้ใช้นี้
                            </p>
                          </div>
                          {banFooter(b)}
                        </li>
                      ),
                    )}
                  </ul>
                )
              ) : items.length === 0 ? (
                <div className="admin-fade-down mt-6 rounded-3xl border border-dashed border-[#b9cba6] bg-white/60 p-8 text-center text-sm text-[#4d6652] sm:text-base">
                  {tab === "reviewing" ? "ไม่มีสลิปรอตรวจ" : "ยังไม่มีรายการ"}
                </div>
              ) : itemRows.length === 0 ? (
                noMatch
              ) : (
                <ul className="mt-5 space-y-4 sm:mt-6">
                  {itemRows.map((p) =>
                    renderPayment(p, tab === "reviewing" ? renderActions(p, p.slip?.check?.ok === true) : null),
                  )}
                </ul>
              )}
            </main>
          </div>
        </div>
      </div>

      {/* เมนูรายการเต็มจอ (มือถือ) */}
      {menuOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="เมนูรายการ"
          className="admin-fade-down fixed inset-0 z-40 overflow-y-auto bg-[#f1f7e9] md:hidden"
        >
          <div className="mx-auto w-full max-w-lg px-4 pb-10 pt-5 sm:max-w-3xl sm:px-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-2xl font-bold">เมนูรายการ</h2>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label="ปิดเมนู"
                className="flex h-11 w-11 items-center justify-center rounded-full border border-[#14402c] bg-white text-xl font-bold transition active:scale-90"
              >
                ×
              </button>
            </div>
            <nav role="tablist" aria-orientation="vertical" aria-label="เมนูรายการ" className="mt-5 flex flex-col gap-2">
              {tabs.map(([id, label]) => navItem(id, label, true))}
            </nav>
            <div className="mt-5 flex gap-2">{controlButtons}</div>
          </div>
        </div>
      )}

      {zoom && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="สลิปขนาดใหญ่"
          className="admin-fade-down fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 sm:p-6"
          onClick={() => setZoom(null)}
        >
          <button
            type="button"
            onClick={() => setZoom(null)}
            aria-label="ปิด"
            className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full bg-white text-xl font-bold text-[#14402c] shadow transition active:scale-90 sm:right-6 sm:top-6"
          >
            ×
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/admin/payments/${zoom}/slip-image`}
            alt="สลิป"
            className="max-h-[92vh] max-w-full rounded-2xl bg-white object-contain"
          />
        </div>
      )}
    </div>
  );
}