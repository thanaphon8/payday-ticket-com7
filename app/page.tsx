"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Prompt } from "next/font/google";

// ฟอนต์หลักของเว็บ: Prompt (โค้งมน เป็นกันเอง) เปลี่ยนเป็น Kanit / Mali ได้
const appFont = Prompt({
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700", "800"],
});

/* ---------- ตั้งค่า (แก้ตรงนี้) ---------- */
const EVENT = {
  name: "Payday Park",
  tagline: "ความสนุกรอบใหม่ ทุกวันเงินออก",
  pill: "ทุกวันเงินออก · 16:00–22:00",
  date: "25 ธันวาคม 2569", // TODO: แก้วันงาน
  place: "ลานกิจกรรม Payday Park", // TODO: แก้สถานที่
};

/* สีหลัก (ตามดีไซน์)
   เขียว #14402c · ไลม์ #d9f27a · เหลือง #ffcf5c · พื้นหลัง #f1f7e9 · กล่องเขียวอ่อน #e3ecd6 */

type TicketId = "booth" | "lucky";

type TicketDef = {
  id: TicketId;
  title: string;
  sub: string; // ชื่ออังกฤษตัวเล็ก
  homeNote: string; // ข้อความในการ์ดหน้าหลัก
  blurb: string; // คำอธิบายในหน้าเลือกตั๋ว
  price: number;
  layout: "banner" | "compact"; // รูปแบบการ์ดในหน้า "ตั๋วของฉัน"
  groupNote: string; // ข้อความในการ์ดหน้า "ตั๋วของฉัน"
  meta?: string; // บรรทัดรายละเอียด (แบบ banner)
  chips?: [string, string]; // ป้ายสถานะ (แบบ compact)
  showLabel: string; // ข้อความปุ่ม "แสดงตั๋ว"
  card: string; // สีการ์ด/ไอคอน
  button: string; // สีปุ่ม
  soft: string; // สีอ่อนของป้ายสถานะ
};

const TICKETS: TicketDef[] = [
  {
    id: "booth",
    title: "ตั๋วเข้าซุ้ม",
    sub: "BOOTH PASS",
    homeNote: "เล่นเกมให้เต็มที่",
    blurb: "1 ใบ เล่นเกมได้ 1 ซุ้ม เลือกซุ้มได้ทั้งหน้างาน", // TODO: แก้ให้ตรงสิทธิ์จริง
    // TODO: 10 บาทเพื่อทดสอบ ก่อนขายจริงแก้ให้ตรงกับ TICKET_PRICES ใน lib/tickets.ts (ฝั่งเซิร์ฟเวอร์คิดเงินจากตัวนั้น)
    price: 10,
    layout: "banner",
    groupNote: "เลือกซุ้มที่ชอบ แล้วไปเล่นกัน!",
    meta: "1 ใบ / 1 ซุ้ม • ใช้ได้เฉพาะวันงาน",
    showLabel: "แสดงตั๋วเข้าซุ้ม",
    card: "bg-[#d9f27a]",
    button: "bg-[#14402c] text-white",
    soft: "bg-[#eef9c8]",
  },
  {
    id: "lucky",
    title: "Lucky Draw",
    sub: "LUCKY DRAW TICKET",
    homeNote: "ลุ้นรางวัลสุดเซอร์ไพรส์",
    blurb: "1 ใบ = 1 สิทธิ์สุ่มของรางวัล ภายในงาน", // TODO: แก้ให้ตรงสิทธิ์จริง
    // TODO: 10 บาทเพื่อทดสอบ ก่อนขายจริงแก้ให้ตรงกับ TICKET_PRICES ใน lib/tickets.ts
    price: 10,
    layout: "compact",
    groupNote: "ลุ้นของรางวัล • 1 สิทธิ์",
    chips: ["รอสุ่มภายในงาน", "ยังไม่ได้ใช้สิทธิ์"],
    showLabel: "แสดงตั๋ว Lucky Draw",
    card: "bg-[#ffcf5c]",
    button: "bg-[#ffcf5c] text-[#14402c]",
    soft: "bg-[#ffe9b0]",
  },
];

type Order = {
  code: string;
  ticket: TicketId;
  name: string;
  phone: string;
  price: number;
  at: string;
  used?: boolean;
  usedAt?: string;
};

type User = { id: string; username: string; name: string; phone: string };

type View = "home" | "buy" | "pay" | "qr" | "done" | "tickets" | "profile" | "auth";

type Cart = Partial<Record<TicketId, number>>;

// รายการชำระเงินที่รอจ่าย (มาจาก POST /api/orders)
type Payment = { id: string; amount: number; expiresAt: string; qrUrl: string };

// ผลจาก GET /api/payments/[id]
type PayPoll = {
  status: "pending" | "paid" | "expired" | "failed";
  expiresAt: string;
  orders?: Order[];
};

const MAX_QTY = 20; // จำนวนสูงสุดต่อตั๋ว 1 ประเภท ต่อการซื้อ 1 ครั้ง (กันกดพลาด)
const CART_KEY = "payday-cart-v1";
const POLL_MS = 3000; // เช็กสถานะการจ่ายทุกกี่มิลลิวินาที

/* ---------- helper ---------- */
function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

// เรียก API ของเว็บ: สำเร็จคืน {ok:true,data} / ล้มเหลวคืน {ok:false,error,status}
async function api<T = Record<string, unknown>>(
  url: string,
  method: "GET" | "POST" | "PATCH" = "GET",
  body?: unknown,
): Promise<{ ok: true; data: T } | { ok: false; error: string; status: number }> {
  try {
    const res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error ?? "เกิดข้อผิดพลาด ลองใหม่อีกครั้ง", status: res.status };
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, error: "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง", status: 0 };
  }
}

const baht = (n: number) => `฿${n.toLocaleString("th-TH")}`;

const validPhone = (p: string) => /^0\d{9}$/.test(p);

const fmtTime = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleString("th-TH", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

const fmtCountdown = (secs: number) =>
  `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;

/* ---------- ไอคอน ---------- */
function Icon({ children, className = "h-6 w-6" }: { children: ReactNode; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

type IconProps = { className?: string };

const IconHome = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M3 11l9-8 9 8" />
    <path d="M5 10v10h14V10" />
  </Icon>
);
const IconTicket = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M3 9a2 2 0 0 0 0 6v3a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-3a2 2 0 0 1 0-6V6a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1z" />
    <path d="M13 5v2M13 11v2M13 17v2" />
  </Icon>
);
const IconGift = ({ className }: IconProps) => (
  <Icon className={className}>
    <rect x="3" y="8" width="18" height="4" rx="1" />
    <path d="M5 12v8h14v-8M12 8v12" />
    <path d="M12 8c-2.5 0-4-1-4-2.5S9.5 3 12 8zM12 8c2.5 0 4-1 4-2.5S14.5 3 12 8z" />
  </Icon>
);
const IconUser = ({ className }: IconProps) => (
  <Icon className={className}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
  </Icon>
);
const IconReceipt = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
    <path d="M9 8h6M9 12h6" />
  </Icon>
);
const IconBack = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M15 5l-7 7 7 7" />
  </Icon>
);
const IconArrow = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Icon>
);
const IconPin = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M12 21s7-6.2 7-11a7 7 0 0 0-14 0c0 4.8 7 11 7 11z" />
    <circle cx="12" cy="10" r="2.5" />
  </Icon>
);
const IconShield = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6z" />
    <path d="M8.5 12l2.5 2.5L16 9.5" />
  </Icon>
);
const IconInfo = ({ className }: IconProps) => (
  <Icon className={className}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h.01" />
  </Icon>
);
const IconSpark = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M12 3c.6 4.8 2.2 6.4 7 7-4.8.6-6.4 2.2-7 7-.6-4.8-2.2-6.4-7-7 4.8-.6 6.4-2.2 7-7z" />
    <path d="M19 16c.2 1.6.8 2.2 2 2.4-1.2.2-1.8.8-2 2.4-.2-1.6-.8-2.2-2-2.4 1.2-.2 1.8-.8 2-2.4z" />
  </Icon>
);
const IconCheck = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Icon>
);
const IconPlus = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);
const IconMinus = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M5 12h14" />
  </Icon>
);

const iconOf = (id: TicketId, className?: string) =>
  id === "booth" ? <IconTicket className={className} /> : <IconGift className={className} />;

/* ---------- ภาพประกอบ hero ---------- */
function HeroArt() {
  const SPARK = "M0 -1 Q.12 -.12 1 0 Q.12 .12 0 1 Q-.12 .12 -1 0 Q-.12 -.12 0 -1Z";
  const GREEN = "#17854f";
  const DARK = "#123f2b";
  const LIME = "#dbf58a";
  const CREAM = "#fff8e6";
  const YELLOW = "#ffcf5c";
  const PINK = "#f5afc5";

  // รางรถไฟเหาะ: ผ่านจุดคีย์ แล้วใช้ cosine interpolation ให้โค้งนุ่ม
  const keys: [number, number][] = [
    [18, 398],
    [150, 372],
    [470, 462],
    [720, 400],
    [940, 438],
  ];
  const railY = (x: number) => {
    for (let i = 0; i < keys.length - 1; i++) {
      const [x0, y0] = keys[i];
      const [x1, y1] = keys[i + 1];
      if (x >= x0 && x <= x1) {
        const t = (x - x0) / (x1 - x0);
        const k = (1 - Math.cos(t * Math.PI)) / 2;
        return y0 + (y1 - y0) * k;
      }
    }
    return keys[keys.length - 1][1];
  };
  const GAP = 16;
  const xs: number[] = [];
  for (let x = 18; x <= 940; x += 6) xs.push(x);
  const railPath = (dy: number) =>
    xs.map((x, i) => `${i === 0 ? "M" : "L"}${x} ${(railY(x) + dy).toFixed(1)}`).join(" ");
  const ties: number[] = [];
  for (let x = 30; x <= 940; x += 28) ties.push(x);
  const posts = [33, 117, 207, 299, 395, 497, 604, 710, 815, 917];

  // กระเช้ากงล้อ (ตำแหน่งกึ่งกลาง)
  const cabins: [number, number][] = [
    [696, 33],
    [824, 95],
    [885, 238],
    [819, 360],
    [696, 398],
    [571, 360],
    [506, 238],
    [567, 95],
  ];
  const cx = 696;
  const cy = 200;
  const spokes = Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2;
    return [cx + 168 * Math.cos(a), cy + 168 * Math.sin(a)] as const;
  });

  return (
    <svg
      viewBox="0 0 967 496"
      className="absolute inset-x-0 bottom-0 h-auto w-full"
      aria-hidden
    >
      {/* ดาวและจุดประดับ */}
      <g fill={YELLOW}>
        <path d={SPARK} transform="translate(100 230) scale(30)" />
        <path d={SPARK} transform="translate(406 156) scale(37)" />
        <path d={SPARK} transform="translate(464 48) scale(20)" />
        <path d={SPARK} transform="translate(921 106) scale(24)" />
        <circle cx="334" cy="223" r="7" />
      </g>
      <circle cx="146" cy="156" r="7" fill={PINK} />

      {/* ธงเล็ก */}
      <g>
        <line x1="417" y1="306" x2="417" y2="378" stroke={DARK} strokeWidth="3" />
        <polygon points="419,308 459,320 419,336" fill={PINK} />
        <line x1="902" y1="283" x2="902" y2="332" stroke={DARK} strokeWidth="3" />
        <polygon points="905,286 941,296 905,308" fill={PINK} />
      </g>

      {/* กงล้อยักษ์ */}
      <circle cx={cx} cy={cy} r="168" fill={LIME} stroke={GREEN} strokeWidth="7" />
      <circle cx={cx} cy={cy} r="146" fill="none" stroke={CREAM} strokeWidth="2" />
      <g stroke={GREEN} strokeWidth="3">
        {spokes.map(([x, y], i) => (
          <line key={i} x1={cx} y1={cy} x2={x} y2={y} />
        ))}
      </g>
      <g stroke={DARK} strokeWidth="20" strokeLinecap="round">
        <line x1="688" y1="218" x2="612" y2="452" />
        <line x1="706" y1="218" x2="772" y2="452" />
      </g>
      <rect x="586" y="448" width="70" height="18" rx="9" fill={DARK} />
      <rect x="744" y="448" width="70" height="18" rx="9" fill={DARK} />
      {cabins.map(([x, y], i) => (
        <g key={i}>
          {i !== 0 && i !== 4 && <line x1={x} y1={y - 26} x2={x} y2={y - 42} stroke={GREEN} strokeWidth="3" />}
          <rect x={x - 28} y={y - 25} width="56" height="50" rx="14" fill={GREEN} />
          <path
            d={`M${x - 28} ${y - 2} V${y - 11} a14 14 0 0 1 14 -14 H${x + 14} a14 14 0 0 1 14 14 V${y - 2}Z`}
            fill={DARK}
          />
          <rect x={x - 19} y={y - 18} width="38" height="15" rx="2" fill={CREAM} />
        </g>
      ))}
      <circle cx={cx} cy={cy} r="28" fill={CREAM} stroke={DARK} strokeWidth="4" />
      <circle cx={cx} cy={cy} r="11" fill={YELLOW} />

      {/* พุ่มไม้ซ้าย */}
      <circle cx="88" cy="372" r="30" fill={LIME} />
      <circle cx="42" cy="420" r="30" fill={LIME} />
      <circle cx="100" cy="408" r="28" fill={GREEN} />

      {/* เต็นท์ */}
      <line x1="227" y1="145" x2="227" y2="212" stroke={DARK} strokeWidth="4" />
      <polygon points="230,148 283,160 230,182" fill={PINK} />
      <rect x="110" y="338" width="232" height="108" fill={GREEN} />
      <rect x="150" y="338" width="36" height="108" fill={CREAM} />
      <rect x="270" y="338" width="30" height="108" fill={CREAM} />
      <path d="M185 446 V382 L228 336 L270 382 V446Z" fill={DARK} />
      <polygon points="227,210 365,316 90,316" fill={GREEN} />
      <polygon points="227,210 160,316 204,316" fill={CREAM} />
      <polygon points="227,210 252,316 294,316" fill={CREAM} />
      <rect x="90" y="314" width="275" height="14" fill={DARK} />
      <g fill={DARK}>
        {[108, 142, 176, 210, 244, 278, 312, 346].map((x) => (
          <circle key={x} cx={x} cy="327" r="17" />
        ))}
      </g>
      <rect x="95" y="441" width="260" height="5" rx="2.5" fill={DARK} />

      {/* พุ่มไม้ขวา */}
      <circle cx="905" cy="372" r="35" fill={LIME} />
      <circle cx="850" cy="402" r="30" fill={LIME} />
      <circle cx="935" cy="408" r="30" fill={LIME} />
      <circle cx="880" cy="428" r="26" fill={GREEN} />
      <circle cx="926" cy="436" r="22" fill={GREEN} />

      {/* รถไฟเหาะ */}
      <g stroke={GREEN} strokeWidth="3" strokeLinecap="round">
        {posts.map((x) => (
          <line key={x} x1={x} y1={railY(x) + GAP} x2={x} y2="490" />
        ))}
      </g>
      <g stroke={YELLOW} strokeWidth="3" strokeLinecap="round">
        {ties.map((x) => (
          <line key={x} x1={x} y1={railY(x) - 2} x2={x + 2} y2={railY(x) + GAP + 2} />
        ))}
      </g>
      <path d={railPath(0)} fill="none" stroke={YELLOW} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <path d={railPath(GAP)} fill="none" stroke={YELLOW} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Barcode({ code }: { code: string }) {
  const bars = code.split("").flatMap((ch) => {
    const n = ch.charCodeAt(0);
    return [1 + (n % 3), 1 + ((n >> 2) % 2)];
  });
  return (
    <div className="flex h-12 items-stretch justify-center gap-px" aria-hidden>
      {bars.map((w, i) => (
        <span key={i} style={{ width: w * 1.5 }} className="bg-current" />
      ))}
    </div>
  );
}

/* ---------- กรอบตั๋วแบบมีรอยประ ----------
   แบ่งเป็น 2 ท่อน (ส่วนบน / ส่วนล่าง) คั่นด้วยเส้นประ
   รอยบากครึ่งวงกลมสองข้างเจาะด้วย mask จึงโปร่งใสจริง เห็นสีพื้นหลังทะลุ */
const NOTCH = 11;
const notchMask = (y: "0" | "100%") => {
  const m =
    `radial-gradient(circle ${NOTCH}px at 0 ${y},#0000 98%,#000) left/51% 100% no-repeat,` +
    `radial-gradient(circle ${NOTCH}px at 100% ${y},#0000 98%,#000) right/51% 100% no-repeat`;
  return { WebkitMask: m, mask: m };
};

function Perforated({
  top,
  bottom,
  className = "",
  bg = "bg-white",
  dash = "border-[#bfd0ab]",
}: {
  top: ReactNode;
  bottom: ReactNode;
  className?: string;
  bg?: string; // สีพื้นตั๋ว
  dash?: string; // สีเส้นประ
}) {
  return (
    <div className={`text-[#14402c] drop-shadow-[0_2px_6px_rgba(20,64,44,0.14)] ${className}`}>
      <div style={notchMask("100%")} className={`overflow-hidden rounded-t-3xl ${bg}`}>
        {top}
      </div>
      <div
        style={notchMask("0")}
        className={`overflow-hidden rounded-b-3xl border-t-2 border-dashed ${dash} ${bg}`}
      >
        {bottom}
      </div>
    </div>
  );
}

/* ---------- ตั๋ว 1 ใบ (ใช้ในหน้าซื้อสำเร็จ และตอนแสดงตั๋ว) ---------- */
function TicketPass({ def, order }: { def: TicketDef; order: Order }) {
  return (
    <Perforated
      top={
        <div className="p-2">
          <div className={`flex items-center justify-between rounded-2xl px-4 py-3 ${def.card}`}>
            <div>
              <p className="text-[10px] font-bold tracking-widest">{def.sub}</p>
              <p className="text-lg font-extrabold leading-tight">{def.title}</p>
            </div>
            {iconOf(def.id, "h-8 w-8")}
          </div>
          <div className="px-3 pb-3 pt-3">
            <p className="text-[10px] font-bold tracking-widest text-[#2f8f5b]">
              {EVENT.name.toUpperCase()} · {EVENT.date}
            </p>
            <p className="mt-1 text-sm font-semibold">
              {order.name} · {order.phone}
            </p>
          </div>
        </div>
      }
      bottom={
        <div className="px-5 pb-5 pt-4">
          <Barcode code={order.code} />
          <p className="mt-2 break-all text-center font-mono text-xs font-bold tracking-wider">{order.code}</p>
        </div>
      }
    />
  );
}

/* ---------- ปุ่มเพิ่ม/ลดจำนวน ---------- */
function Stepper({
  value,
  max,
  name,
  onChange,
}: {
  value: number;
  max: number;
  name: string;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        aria-label={`ลดจำนวน${name}`}
        onClick={() => onChange(value - 1)}
        disabled={value <= 0}
        className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-[#14402c] shadow-[0_1px_4px_rgba(20,64,44,0.25)] transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <IconMinus className="h-5 w-5" />
      </button>
      <span aria-live="polite" className="min-w-6 text-center text-lg font-semibold">
        {value}
      </span>
      <button
        type="button"
        aria-label={`เพิ่มจำนวน${name}`}
        onClick={() => onChange(value + 1)}
        disabled={value >= max}
        className="flex h-10 w-10 items-center justify-center rounded-full bg-[#14402c] text-white transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <IconPlus className="h-5 w-5" />
      </button>
    </div>
  );
}

/* ---------- ขั้นตอน 1-2-3 ---------- */
function Steps({ current }: { current: 1 | 2 | 3 }) {
  const steps = ["เลือกตั๋ว", "ชำระเงิน", "รับตั๋ว"];
  return (
    <ol className="flex items-center gap-4" aria-label="ขั้นตอนการซื้อ">
      {steps.map((s, i) => {
        const n = i + 1;
        const active = n === current;
        const done = n < current;
        return (
          <li key={s} className="flex items-center gap-1.5" aria-current={active ? "step" : undefined}>
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                active || done ? "bg-[#14402c] text-white" : "bg-[#dfe9d2] text-[#6b7f6f]"
              }`}
            >
              {done ? <IconCheck className="h-3.5 w-3.5" /> : n}
            </span>
            <span className={`text-xs ${active ? "font-bold text-[#14402c]" : "text-[#6b7f6f]"}`}>{s}</span>
          </li>
        );
      })}
    </ol>
  );
}

/* ---------- แถบหัวหน้าย่อย (ปุ่มย้อนกลับ + ชื่อ) ---------- */
function SubHeader({ title, onBack }: { title: string; onBack?: () => void }) {
  return (
    <div className="flex items-center gap-3">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          aria-label="ย้อนกลับ"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-[#14402c] shadow-[0_1px_4px_rgba(20,64,44,0.15)]"
        >
          <IconBack />
        </button>
      ) : (
        <span className="h-11 w-0" />
      )}
      <h1 className="text-xl font-semibold text-[#14402c]">{title}</h1>
    </div>
  );
}

function InfoBox({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-[#e3ecd6] p-4 text-[#14402c]">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div>
        <p className="text-sm font-bold">{title}</p>
        <p className="mt-0.5 text-xs text-[#4d6652]">{text}</p>
      </div>
    </div>
  );
}

/* ---------- Bottom nav ---------- */
type Badges = Partial<Record<View, number>>;

const NAV: { id: View; label: string; icon: ReactNode }[] = [
  { id: "home", label: "หน้าหลัก", icon: <IconHome /> },
  { id: "buy", label: "ซื้อตั๋ว", icon: <IconTicket /> },
  { id: "tickets", label: "ตั๋วของฉัน", icon: <IconGift /> },
  { id: "profile", label: "โปรไฟล์", icon: <IconUser /> },
];

function BottomNav({
  view,
  badges,
  onGo,
}: {
  view: View;
  badges: Badges;
  onGo: (v: View) => void;
}) {
  return (
    <nav
      aria-label="เมนูหลัก"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[#e3ecd6] bg-white pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto grid max-w-md grid-cols-4 px-2 py-2">
        {NAV.map((n) => {
          const active = view === n.id;
          const badge = badges[n.id] ?? 0;
          return (
            <li key={n.id} className="flex justify-center">
              <button
                type="button"
                onClick={() => onGo(n.id)}
                aria-label={n.label}
                aria-current={active ? "page" : undefined}
                className={`relative flex min-w-[4.5rem] flex-col items-center gap-0.5 rounded-2xl px-3 py-2 transition ${
                  active ? "bg-[#d9f27a] text-[#14402c]" : "text-[#4d6652]"
                }`}
              >
                <span className="relative">
                  {n.icon}
                  {badge > 0 && (
                    <span className="absolute -right-2.5 -top-1.5 min-w-4 rounded-full bg-[#14402c] px-1 text-center text-[10px] leading-4 text-white">
                      {badge}
                    </span>
                  )}
                </span>
                <span className={`text-[11px] ${active ? "font-bold" : "font-medium"}`}>{n.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/* ---------- แถบด้านล่างสำหรับหน้าขั้นตอนซื้อ ---------- */
function CheckoutBar({ children, aboveNav = false }: { children: ReactNode; aboveNav?: boolean }) {
  return (
    <div
      className={`fixed inset-x-0 z-40 rounded-t-3xl border-t border-[#e3ecd6] bg-white shadow-[0_-8px_24px_rgba(20,64,44,0.08)] ${
        aboveNav ? "bottom-[calc(4rem+env(safe-area-inset-bottom))]" : "bottom-0 pb-[env(safe-area-inset-bottom)]"
      }`}
    >
      <div className="mx-auto w-full max-w-md px-5 py-4">{children}</div>
    </div>
  );
}

/* ---------- หน้าหลัก ---------- */
export default function Home() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  const [view, setView] = useState<View>("home");
  const [cart, setCart] = useState<Cart>({});
  const [justBought, setJustBought] = useState<Order[] | null>(null);

  // ชำระเงิน
  const [payName, setPayName] = useState("");
  const [payPhone, setPayPhone] = useState("");
  const [payError, setPayError] = useState("");
  const [payBusy, setPayBusy] = useState(false);

  // QR พร้อมเพย์: รายการที่รอจ่าย + สถานะ + นาฬิกานับถอยหลัง
  const [payment, setPayment] = useState<Payment | null>(null);
  const [payStatus, setPayStatus] = useState<"pending" | "expired" | "failed">("pending");
  const [pollNote, setPollNote] = useState("");
  const [qrFailed, setQrFailed] = useState(false);
  const [now, setNow] = useState(0);

  // เข้าสู่ระบบ / สมัครสมาชิก
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authUser, setAuthUser] = useState("");
  const [authPass, setAuthPass] = useState("");
  const [authName, setAuthName] = useState("");
  const [authPhone, setAuthPhone] = useState("");
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [afterAuth, setAfterAuth] = useState<View>("home");

  // บัญชี/โปรไฟล์
  const [accName, setAccName] = useState("");
  const [accPhone, setAccPhone] = useState("");
  const [accError, setAccError] = useState("");
  const [accSaved, setAccSaved] = useState(false);

  // ตั๋วของฉัน
  const [tab, setTab] = useState<"ready" | "used">("ready");
  const [sheet, setSheet] = useState<TicketId | null>(null);
  const [confirmCode, setConfirmCode] = useState<string | null>(null);

  useEffect(() => {
    // ตะกร้า: กรองให้เหลือเฉพาะค่าที่ถูกต้อง
    const c = load<Cart>(CART_KEY, {});
    const clean: Cart = {};
    for (const t of TICKETS) {
      const n = Math.floor(Number(c[t.id]));
      if (n > 0) clean[t.id] = Math.min(MAX_QTY, n);
    }
    setCart(clean);

    // เช็คว่า login ค้างอยู่ไหม (cookie) แล้วดึงตั๋วจาก MongoDB
    (async () => {
      const me = await api<{ user: User | null }>("/api/auth/me");
      if (me.ok && me.data.user) {
        applyUser(me.data.user);
        const r = await api<{ orders: Order[] }>("/api/orders");
        if (r.ok) setOrders(r.data.orders);
      }
      setReady(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [view]);

  // เข้าหน้า "ตั๋วของฉัน" ให้โหลดตั๋วใหม่เสมอ
  // (กรณีจ่ายแล้วปิดหน้า QR ไป ตั๋วถูกออกโดย webhook ฝั่งเซิร์ฟเวอร์ ต้องดึงมาแสดง)
  useEffect(() => {
    if (view !== "tickets" || !user) return;
    let cancelled = false;
    (async () => {
      const r = await api<{ orders: Order[] }>("/api/orders");
      if (r.ok && !cancelled) setOrders(r.data.orders);
    })();
    return () => {
      cancelled = true;
    };
  }, [view, user]);

  // หน้า QR: เช็กสถานะการจ่ายทุก POLL_MS + เดินนาฬิกานับถอยหลัง
  useEffect(() => {
    if (view !== "qr" || !payment) return;
    let stopped = false;
    let busy = false;
    const paymentId = payment.id;

    const tick = async () => {
      if (busy || stopped) return;
      busy = true;
      const r = await api<PayPoll>(`/api/payments/${paymentId}`);
      busy = false;
      if (stopped) return;

      if (!r.ok) {
        if (r.status === 401) {
          stopped = true;
          setPayment(null);
          needLogin("pay");
        } else if (r.status === 404) {
          stopped = true;
          setPayStatus("failed");
        } else {
          setPollNote(r.error); // เน็ตหลุดชั่วคราว ลองใหม่รอบถัดไปเอง
        }
        return;
      }

      setPollNote("");
      const d = r.data;
      if (d.status === "paid" && d.orders) {
        stopped = true;
        finishPaid(d.orders);
      } else if (d.status === "expired" || d.status === "failed") {
        stopped = true;
        setPayStatus(d.status);
      }
    };

    tick();
    const poll = setInterval(tick, POLL_MS);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      stopped = true;
      clearInterval(poll);
      clearInterval(clock);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, payment]);

  const defOf = (id: TicketId) => TICKETS.find((t) => t.id === id)!;
  const cartLines = TICKETS.flatMap((t) => {
    const q = cart[t.id] ?? 0;
    return q > 0 ? [{ def: t, qty: q }] : [];
  });
  const cartCount = cartLines.reduce((s, l) => s + l.qty, 0);
  const cartTotal = cartLines.reduce((s, l) => s + l.qty * l.def.price, 0);

  const readyOrders = orders.filter((o) => !o.used);
  const usedOrders = orders
    .filter((o) => o.used)
    .sort((a, b) => (b.usedAt ?? "").localeCompare(a.usedAt ?? ""));

  const secsLeft = payment
    ? Math.max(0, Math.ceil((new Date(payment.expiresAt).getTime() - now) / 1000))
    : 0;

  function go(v: View) {
    setView(v);
    setPayError("");
  }

  function applyUser(u: User) {
    setUser(u);
    setAccName(u.name);
    setAccPhone(u.phone);
  }

  // ไปหน้า login แล้วเมื่อสำเร็จให้เด้งกลับมาหน้าที่ต้องการ
  function needLogin(next: View) {
    setAfterAuth(next);
    setAuthError("");
    setAuthMode("login");
    setView("auth");
  }

  async function submitAuth() {
    const username = authUser.trim();
    if (authMode === "register") {
      if (authName.trim().length < 2) return setAuthError("กรอกชื่อ-นามสกุลให้ครบ");
      if (!validPhone(authPhone.replace(/\D/g, ""))) return setAuthError("เบอร์โทรต้องมี 10 หลัก ขึ้นต้นด้วย 0");
      if (!/^[a-zA-Z0-9._]{3,20}$/.test(username)) return setAuthError("username ต้องยาว 3-20 ตัว ใช้ได้เฉพาะ a-z 0-9 . _");
      if (authPass.length < 6) return setAuthError("รหัสผ่านต้องยาวอย่างน้อย 6 ตัวอักษร");
    } else if (!username || !authPass) {
      return setAuthError("กรอก username และรหัสผ่าน");
    }

    setAuthBusy(true);
    setAuthError("");
    const r = await api<{ user: User }>(
      authMode === "login" ? "/api/auth/login" : "/api/auth/register",
      "POST",
      authMode === "login"
        ? { username, password: authPass }
        : { username, password: authPass, name: authName, phone: authPhone },
    );
    if (!r.ok) {
      setAuthBusy(false);
      return setAuthError(r.error);
    }
    applyUser(r.data.user);
    const o = await api<{ orders: Order[] }>("/api/orders");
    if (o.ok) setOrders(o.data.orders);
    setAuthBusy(false);
    setAuthPass("");
    setAuthName("");
    setAuthPhone("");
    setAuthUser("");
    go(afterAuth);
  }

  async function logout() {
    await api("/api/auth/logout", "POST");
    setUser(null);
    setOrders([]);
    setPayment(null);
    setAccName("");
    setAccPhone("");
    setAccSaved(false);
    setAccError("");
    setSheet(null);
    go("home");
  }

  function setQty(id: TicketId, n: number) {
    const q = Math.max(0, Math.min(MAX_QTY, n));
    const next = { ...cart };
    if (q === 0) delete next[id];
    else next[id] = q;
    setCart(next);
    save(CART_KEY, next);
  }

  // กดลูกศรจากการ์ดหน้าหลัก: ไปหน้าเลือกตั๋ว และใส่ตั๋วนั้นอย่างน้อย 1 ใบ
  function pick(id: TicketId) {
    if ((cart[id] ?? 0) === 0) setQty(id, 1);
    go("buy");
  }

  function toPay() {
    if (cartCount === 0) return;
    if (!user) return needLogin("pay"); // ซื้อตั๋วต้อง login ก่อน
    setPayName(user.name);
    setPayPhone(user.phone);
    go("pay");
  }

  // จ่ายสำเร็จ (เซิร์ฟเวอร์ยืนยันกับ Opn แล้ว): เก็บตั๋ว ล้างตะกร้า ไปหน้ารับตั๋ว
  function finishPaid(made: Order[]) {
    const codes = new Set(made.map((o) => o.code));
    setOrders((prev) => [...made, ...prev.filter((o) => !codes.has(o.code))]);
    setCart({});
    save(CART_KEY, {});
    setPayment(null);
    setJustBought(made);
    setView("done");
  }

  // กดยืนยัน: ขอ QR จากเซิร์ฟเวอร์ ตั๋วยังไม่ถูกออกจนกว่าจะจ่ายสำเร็จ
  async function confirmPay() {
    if (cartLines.length === 0 || payBusy) return;
    if (!user) return needLogin("pay");
    const buyerName = payName.trim();
    const cleanPhone = payPhone.replace(/\D/g, "");
    if (buyerName.length < 2) {
      setPayError("กรอกชื่อ-นามสกุลให้ครบ");
      return;
    }
    if (!validPhone(cleanPhone)) {
      setPayError("เบอร์โทรต้องมี 10 หลัก ขึ้นต้นด้วย 0");
      return;
    }

    // เซิร์ฟเวอร์คิดราคาเอง สร้างรายการรอจ่าย + QR PromptPay ผ่าน Opn
    // ตั๋วถูกสร้างใน MongoDB หลัง Opn ยืนยันว่าจ่ายแล้วเท่านั้น (polling หรือ webhook)
    setPayBusy(true);
    setPayError("");
    const r = await api<{ payment: Payment }>("/api/orders", "POST", {
      items: cartLines.map((l) => ({ ticket: l.def.id, qty: l.qty })),
      name: buyerName,
      phone: cleanPhone,
    });
    setPayBusy(false);
    if (!r.ok) {
      if (r.status === 401) return needLogin("pay");
      setPayError(r.error);
      return;
    }

    setPayment(r.data.payment);
    setPayStatus("pending");
    setPollNote("");
    setQrFailed(false);
    setNow(Date.now());
    setView("qr");
  }

  // ออกจากหน้า QR (ยกเลิกการรอ) กลับไปหน้าสรุปรายการ
  function leaveQr() {
    setPayment(null);
    go("pay");
  }

  async function markUsed(code: string) {
    const target = orders.find((o) => o.code === code);
    const r = await api<{ usedAt: string }>(`/api/orders/${encodeURIComponent(code)}/use`, "POST");
    setConfirmCode(null);
    if (!r.ok) {
      if (r.status === 401) setSheet(null), needLogin("tickets");
      else alert(r.error);
      return;
    }
    const next = orders.map((o) => (o.code === code ? { ...o, used: true, usedAt: r.data.usedAt } : o));
    setOrders(next);
    // ปิดหน้าต่างเมื่อไม่เหลือตั๋วประเภทนั้นที่พร้อมใช้
    if (target && !next.some((o) => o.ticket === target.ticket && !o.used)) setSheet(null);
  }

  async function saveProfile() {
    const cleanPhone = accPhone.replace(/\D/g, "");
    setAccSaved(false);
    if (accName.trim().length < 2) {
      setAccError("กรอกชื่อ-นามสกุลให้ครบ");
      return;
    }
    if (!validPhone(cleanPhone)) {
      setAccError("เบอร์โทรต้องมี 10 หลัก ขึ้นต้นด้วย 0");
      return;
    }
    const r = await api<{ user: User }>("/api/auth/me", "PATCH", { name: accName.trim(), phone: cleanPhone });
    if (!r.ok) {
      setAccError(r.error);
      return;
    }
    applyUser(r.data.user);
    setAccError("");
    setAccSaved(true);
  }

  const badges: Badges = { tickets: readyOrders.length };
  const showNav =
    view === "home" || view === "buy" || view === "tickets" || view === "profile" || view === "auth";
  const navView: View =
    view === "pay" || view === "qr" || view === "done" ? "buy" : view === "auth" ? "profile" : view;

  const inputCls =
    "mt-1 w-full rounded-xl border border-[#cfdcc0] bg-white px-4 py-3 text-base outline-none focus:border-[#14402c] focus:ring-2 focus:ring-[#d9f27a]";

  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(EVENT.place)}`;

  const sheetDef = sheet ? defOf(sheet) : null;
  const sheetOrders = sheet ? readyOrders.filter((o) => o.ticket === sheet) : [];

  return (
    <div className={`min-h-screen bg-[#f1f7e9] text-[#14402c] ${appFont.className}`}>
      <main
        className={`mx-auto w-full max-w-md px-5 pt-6 ${
          view === "buy" ? "pb-64" : showNav ? "pb-28" : view === "done" || view === "qr" ? "pb-10" : "pb-64"
        }`}
      >
        {/* ===== หน้าหลัก ===== */}
        {view === "home" && (
          <>
            <header className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#14402c] text-[#d9f27a]">
                  <IconTicket />
                </span>
                <div>
                  <h1 className="text-2xl font-bold lowercase leading-none">{EVENT.name}</h1>
                  <p className="mt-1 text-[11px] text-[#4d6652]">{EVENT.tagline}</p>
                </div>
              </div>
              {user ? (
                <button
                  type="button"
                  onClick={() => go("profile")}
                  aria-label="โปรไฟล์"
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-[#14402c] text-base font-bold uppercase text-[#d9f27a]"
                >
                  {(user.name || user.username).charAt(0)}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => needLogin("home")}
                  className="rounded-full bg-white px-4 py-2.5 text-sm font-bold shadow-[0_1px_4px_rgba(20,64,44,0.15)] transition active:scale-95"
                >
                  เข้าสู่ระบบ
                </button>
              )}
            </header>

            <section className="relative mt-6 overflow-hidden rounded-3xl bg-[#14402c] p-5 text-white">
              <p className="text-[11px] font-bold tracking-wider text-[#d9f27a]">PAYDAY IS PLAY DAY</p>
              <h2 className="mt-3 text-3xl font-bold leading-tight">
                เงินเดือนออกแล้ว
                <br />
                ออกมาเล่นกัน!
              </h2>
              <p className="mt-4 inline-flex items-center rounded-full bg-[#d9f27a] px-3 py-1.5 text-xs font-bold text-[#14402c]">
                {EVENT.pill}
              </p>
              <div className="aspect-[967/496]" />
              <HeroArt />
            </section>

            <div className="mt-3 flex items-center justify-between px-1 text-sm">
              <span className="flex items-center gap-2">
                <IconPin className="h-4 w-4 text-[#2f8f5b]" />
                {EVENT.place}
              </span>
              <a
                href={mapUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-semibold underline-offset-2 hover:underline"
              >
                ดูแผนที่ ↗
              </a>
            </div>

            <section aria-label="เลือกประเภทตั๋ว" className="mt-8">
              <h2 className="text-xl font-bold">วันนี้อยากสนุกแบบไหน?</h2>
              <p className="mt-1 text-sm text-[#4d6652]">เลือกตั๋วที่ใช่ แล้วไปสนุกกันเลย</p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                {TICKETS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => pick(t.id)}
                    aria-label={`${t.title} ${baht(t.price)} ต่อใบ`}
                    className="block text-left transition active:scale-[0.98]"
                  >
                    <Perforated
                      bg={t.card}
                      dash="border-[#14402c]/35"
                      top={
                        <div className="px-4 pb-3 pt-4">
                          {iconOf(t.id, "h-6 w-6")}
                          <p className="mt-2 text-lg font-bold leading-tight">{t.title}</p>
                          <p className="mt-1 text-xs">{t.homeNote}</p>
                        </div>
                      }
                      bottom={
                        <div className="flex w-full items-end justify-between px-4 pb-4 pt-3">
                          <p className="text-3xl font-extrabold">
                            {baht(t.price)}
                            <span className="text-xs font-medium"> / ใบ</span>
                          </p>
                          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#14402c] text-white">
                            <IconArrow className="h-5 w-5" />
                          </span>
                        </div>
                      }
                    />
                  </button>
                ))}
              </div>

              <div className="mt-3 flex items-center gap-3 rounded-2xl bg-white p-4">
                <IconSpark className="h-7 w-7 shrink-0 text-[#2f8f5b]" />
                <div>
                  <p className="text-sm font-bold">ความโชคดีอาจเป็นของคุณ!</p>
                  <p className="mt-0.5 text-xs text-[#4d6652]">ซื้อ Lucky Draw แล้วรอลุ้นพร้อมกัน</p>
                </div>
              </div>
            </section>
          </>
        )}

        {/* ===== เลือกตั๋ว (ขั้นที่ 1) ===== */}
        {view === "buy" && (
          <section aria-label="เลือกตั๋ว">
            <SubHeader title="เลือกตั๋วของคุณ" onBack={() => go("home")} />
            <div className="mt-6">
              <Steps current={1} />
            </div>

            <h2 className="mt-8 text-2xl font-bold">พร้อมสนุกกี่ใบดี?</h2>
            <p className="mt-1 text-sm text-[#4d6652]">เลือกจำนวนตั๋วทั้ง 2 แบบในครั้งเดียว</p>

            <div className="mt-5 space-y-4">
              {TICKETS.map((t) => {
                const q = cart[t.id] ?? 0;
                return (
                  <Perforated
                    key={t.id}
                    bg={t.card}
                    dash="border-[#14402c]/35"
                    top={
                      <div className="p-4">
                        <div className="flex items-center gap-3">
                          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/50">
                            {iconOf(t.id, "h-6 w-6")}
                          </span>
                          <div>
                            <p className="text-lg font-bold leading-tight">{t.title}</p>
                            <p className="text-[10px] font-semibold tracking-widest text-[#14402c]/70">{t.sub}</p>
                          </div>
                        </div>
                        <p className="mt-4 text-sm text-[#14402c]/80">{t.blurb}</p>
                      </div>
                    }
                    bottom={
                      <div className="flex items-center justify-between px-4 pb-4 pt-3">
                        <p className="text-3xl font-extrabold">
                          {baht(t.price)}
                          <span className="text-xs font-medium text-[#14402c]/70"> / ใบ</span>
                        </p>
                        <Stepper value={q} max={MAX_QTY} name={t.title} onChange={(n) => setQty(t.id, n)} />
                      </div>
                    }
                  />
                );
              })}

              <InfoBox
                icon={<IconShield className="h-5 w-5" />}
                title="ตั๋วแต่ละประเภทใช้แทนกันไม่ได้"
                text="ตั๋วใช้ได้เฉพาะวันงานที่ระบุเท่านั้น"
              />
            </div>
          </section>
        )}

        {/* ===== ชำระเงิน (ขั้นที่ 2): สรุปรายการ ===== */}
        {view === "pay" && (
          <section aria-label="ชำระเงิน">
            <SubHeader title="ชำระเงิน" onBack={() => go("buy")} />
            <div className="mt-6">
              <Steps current={2} />
            </div>

            <div className="mt-6 rounded-3xl border border-[#e3ecd6] bg-white p-4">
              <h2 className="text-base font-bold">สรุปรายการ</h2>
              <p className="mt-0.5 text-xs text-[#6b7f6f]">
                {EVENT.name} · {EVENT.date}
              </p>
              <ul className="mt-3 divide-y divide-[#e3ecd6]">
                {cartLines.map(({ def, qty: q }) => (
                  <li key={def.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="flex items-center gap-3">
                      <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${def.card}`}>
                        {iconOf(def.id, "h-5 w-5")}
                      </span>
                      <div>
                        <p className="text-sm font-bold">{def.title}</p>
                        <p className="text-xs text-[#6b7f6f]">
                          {baht(def.price)} × {q}
                        </p>
                      </div>
                    </div>
                    <p className="text-base font-bold">{baht(def.price * q)}</p>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-4 rounded-3xl border border-[#e3ecd6] bg-white p-4">
              <h2 className="text-base font-bold">วิธีชำระเงิน</h2>
              <div className="mt-3 flex items-center justify-between rounded-2xl border-2 border-[#14402c] bg-[#f1f7e9] px-4 py-3">
                <span className="text-sm font-bold">PromptPay (สแกน QR)</span>
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#14402c] text-white">
                  <IconCheck className="h-3.5 w-3.5" />
                </span>
              </div>
              <p className="mt-2 text-xs text-[#6b7f6f]">กดยืนยันแล้วระบบจะสร้าง QR ให้สแกน มีอายุ 15 นาที</p>
            </div>

            <CheckoutBar>
              {payError && (
                <p role="alert" className="mb-2 text-sm font-medium text-red-600">
                  {payError}
                </p>
              )}
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-xs text-[#6b7f6f]">ทั้งหมด {cartCount} ใบ</p>
                  <p className="text-sm font-bold">ยอดรวม</p>
                </div>
                <p className="text-4xl font-extrabold">{baht(cartTotal)}</p>
              </div>
              <button
                type="button"
                onClick={confirmPay}
                disabled={payBusy}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#14402c] py-4 text-base font-bold text-white transition active:scale-[0.99] disabled:opacity-60"
              >
                {payBusy ? "กำลังสร้าง QR..." : "สร้าง QR เพื่อชำระเงิน"}
                <IconArrow className="h-5 w-5 text-[#d9f27a]" />
              </button>
            </CheckoutBar>
          </section>
        )}

        {/* ===== ชำระเงิน (ขั้นที่ 2): สแกน QR ===== */}
        {view === "qr" && payment && (
          <section aria-label="สแกน QR ชำระเงิน">
            <SubHeader title="สแกนเพื่อชำระเงิน" onBack={leaveQr} />
            <div className="mt-6">
              <Steps current={2} />
            </div>

            <div className="mt-6 rounded-3xl border border-[#e3ecd6] bg-white p-5 text-center">
              <p className="text-xs text-[#6b7f6f]">ยอดที่ต้องชำระ</p>
              <p className="mt-1 text-4xl font-extrabold">{baht(payment.amount)}</p>

              {payStatus === "pending" ? (
                <>
                  <div className="mx-auto mt-4 flex aspect-square w-full max-w-[16rem] items-center justify-center overflow-hidden rounded-2xl border border-[#e3ecd6] bg-white p-2">
                    {qrFailed ? (
                      <p className="px-4 text-sm text-red-600">แสดง QR ไม่ได้ กด “สร้าง QR ใหม่” ด้านล่าง</p>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={payment.qrUrl}
                        alt={`QR PromptPay ยอด ${baht(payment.amount)}`}
                        className="h-full w-full object-contain"
                        onError={() => setQrFailed(true)}
                      />
                    )}
                  </div>
                  <p className="mt-4 text-sm text-[#4d6652]">เปิดแอปธนาคาร แล้วสแกน QR นี้เพื่อจ่ายเงิน</p>
                  {secsLeft > 0 ? (
                    <p className="mt-2 text-sm font-bold" aria-live="off">
                      QR หมดอายุใน {fmtCountdown(secsLeft)}
                    </p>
                  ) : (
                    <p className="mt-2 text-sm font-bold text-[#a15c00]">หมดเวลาแล้ว กำลังตรวจสอบการชำระเงิน...</p>
                  )}
                  <p role="status" className="mt-3 flex items-center justify-center gap-2 text-xs text-[#6b7f6f]">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-[#2f8f5b]" />
                    รอรับการชำระเงิน
                  </p>
                  {pollNote && <p className="mt-2 text-xs text-red-600">{pollNote}</p>}
                </>
              ) : (
                <div className="mt-4 rounded-2xl bg-[#f1f7e9] p-5">
                  <p role="alert" className="text-base font-bold">
                    {payStatus === "expired" ? "QR หมดอายุแล้ว" : "สร้างรายการชำระเงินไม่สำเร็จ"}
                  </p>
                  <p className="mt-1 text-sm text-[#4d6652]">
                    ถ้าคุณจ่ายไปแล้ว ตั๋วจะขึ้นที่หน้า “ตั๋วของฉัน” ภายในไม่กี่นาที
                  </p>
                </div>
              )}
            </div>

            <div className="mt-4 space-y-3">
              {payStatus !== "pending" || qrFailed ? (
                <button
                  type="button"
                  onClick={leaveQr}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#14402c] py-4 text-base font-bold text-white transition active:scale-[0.99]"
                >
                  สร้าง QR ใหม่
                  <IconArrow className="h-5 w-5 text-[#d9f27a]" />
                </button>
              ) : null}
              <InfoBox
                icon={<IconInfo className="h-5 w-5" />}
                title="จ่ายแล้วรอสักครู่"
                text="ระบบจะพาไปรับตั๋วอัตโนมัติ ถ้าปิดหน้านี้ไปก่อน ตั๋วจะขึ้นที่หน้า “ตั๋วของฉัน”"
              />
            </div>
          </section>
        )}

        {/* ===== รับตั๋ว (ขั้นที่ 3) ===== */}
        {view === "done" && justBought && (
          <section aria-label="ซื้อตั๋วสำเร็จ">
            <Steps current={3} />
            <div className="mt-8 flex flex-col items-center text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#d9f27a]">
                <IconCheck className="h-9 w-9" />
              </span>
              <h1 className="mt-4 text-2xl font-bold">ได้รับตั๋วแล้ว!</h1>
              <p className="mt-1 text-sm text-[#4d6652]">
                {justBought.length} ใบ · รวม {baht(justBought.reduce((s, o) => s + o.price, 0))}
              </p>
            </div>

            <div className="mt-6 space-y-4">
              {justBought.map((o) => (
                <TicketPass key={o.code} def={defOf(o.ticket)} order={o} />
              ))}
            </div>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setJustBought(null);
                  go("buy");
                }}
                className="flex-1 rounded-2xl border border-[#14402c] px-5 py-3.5 font-semibold transition active:scale-[0.99]"
              >
                ซื้อเพิ่ม
              </button>
              <button
                type="button"
                onClick={() => {
                  setJustBought(null);
                  setTab("ready");
                  go("tickets");
                }}
                className="flex-1 rounded-2xl bg-[#14402c] px-5 py-3.5 font-semibold text-white transition active:scale-[0.99]"
              >
                ดูตั๋วของฉัน
              </button>
            </div>
          </section>
        )}

        {/* ===== ตั๋วของฉัน ===== */}
        {view === "tickets" && (
          <section aria-label="ตั๋วของฉัน">
            <header className="flex items-start justify-between">
              <div>
                <h1 className="text-3xl font-bold">ตั๋วของฉัน</h1>
                <p className="mt-1 text-sm text-[#4d6652]">ความสนุกรอบนี้ พร้อมแล้ว!</p>
              </div>
              <button
                type="button"
                onClick={() => setTab("used")}
                aria-label="ดูตั๋วที่ใช้แล้ว"
                className="flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-[0_1px_4px_rgba(20,64,44,0.15)]"
              >
                <IconReceipt />
              </button>
            </header>

            <div role="tablist" aria-label="สถานะตั๋ว" className="mt-5 grid grid-cols-2 rounded-2xl bg-[#e3ecd6] p-1">
              {(
                [
                  ["ready", `พร้อมใช้ (${readyOrders.length})`],
                  ["used", `ใช้แล้ว (${usedOrders.length})`],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  onClick={() => setTab(id)}
                  className={`rounded-xl py-2.5 text-sm font-bold transition ${
                    tab === id ? "bg-[#14402c] text-white" : "text-[#4d6652]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {ready && !user && (
              <div className="mt-6 rounded-3xl border border-dashed border-[#b9cba6] bg-white/60 p-8 text-center">
                <p className="text-[#4d6652]">เข้าสู่ระบบเพื่อดูตั๋วของคุณ</p>
                <button
                  type="button"
                  onClick={() => needLogin("tickets")}
                  className="mt-4 rounded-full bg-[#14402c] px-6 py-2.5 font-semibold text-white transition active:scale-95"
                >
                  เข้าสู่ระบบ
                </button>
              </div>
            )}

            {(user || !ready) && tab === "ready" && (
              <>
                {!ready || readyOrders.length === 0 ? (
                  <div className="mt-6 rounded-3xl border border-dashed border-[#b9cba6] bg-white/60 p-8 text-center">
                    <p className="text-[#4d6652]">ยังไม่มีตั๋วที่พร้อมใช้</p>
                    <button
                      type="button"
                      onClick={() => go("buy")}
                      className="mt-4 rounded-full bg-[#14402c] px-6 py-2.5 font-semibold text-white transition active:scale-95"
                    >
                      ไปซื้อตั๋ว
                    </button>
                  </div>
                ) : (
                  <div className="mt-5 space-y-4">
                    {TICKETS.map((t) => {
                      const count = readyOrders.filter((o) => o.ticket === t.id).length;
                      if (count === 0) return null;
                      const btn = (
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmCode(null);
                            setSheet(t.id);
                          }}
                          className="flex w-full items-center justify-between rounded-2xl bg-[#14402c] px-5 py-3.5 text-sm font-bold text-white transition active:scale-[0.99]"
                        >
                          {t.showLabel}
                          <IconArrow className="h-5 w-5" />
                        </button>
                      );

                      return (
                        <Perforated
                          key={t.id}
                          bg={t.card}
                          dash="border-[#14402c]/35"
                          top={
                            <div className="p-4">
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex items-center gap-3">
                                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/50">
                                    {iconOf(t.id, "h-6 w-6")}
                                  </span>
                                  <div>
                                    <p className="text-[10px] font-bold tracking-widest text-[#14402c]/70">{t.sub}</p>
                                    <p className="text-xl font-bold leading-tight">{t.title}</p>
                                  </div>
                                </div>
                                <div className="shrink-0 text-right">
                                  <p className="text-3xl font-extrabold leading-none">{count}</p>
                                  <p className="mt-0.5 text-xs font-semibold">ใบ</p>
                                </div>
                              </div>
                              <p className="mt-4 text-sm font-semibold">{t.groupNote}</p>
                              {t.meta && <p className="mt-1 text-xs text-[#14402c]/70">{t.meta}</p>}
                              {t.chips && (
                                <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                                  <span className="rounded-full bg-white/60 px-3 py-1.5">{t.chips[0]}</span>
                                  <span className="rounded-full bg-[#14402c]/10 px-3 py-1.5">{t.chips[1]}</span>
                                </div>
                              )}
                            </div>
                          }
                          bottom={<div className="px-4 pb-4 pt-4">{btn}</div>}
                        />
                      );
                    })}
                  </div>
                )}

                <div className="mt-4">
                  <InfoBox
                    icon={<IconInfo className="h-5 w-5" />}
                    title="ใช้ตั๋วง่าย ๆ ที่หน้างาน"
                    text="เปิดตั๋ว แล้วให้เจ้าหน้าที่สแกนก่อนร่วมสนุก"
                  />
                </div>
              </>
            )}

            {user && tab === "used" && (
              <>
                {usedOrders.length === 0 ? (
                  <div className="mt-6 rounded-3xl border border-dashed border-[#b9cba6] bg-white/60 p-8 text-center">
                    <p className="text-[#4d6652]">ยังไม่มีตั๋วที่ใช้แล้ว</p>
                  </div>
                ) : (
                  <ul className="mt-5 space-y-3">
                    {usedOrders.map((o) => {
                      const d = defOf(o.ticket);
                      return (
                        <li key={o.code} className="flex items-center gap-3 rounded-2xl bg-white p-4 opacity-80">
                          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#e3ecd6]">
                            {iconOf(o.ticket, "h-5 w-5")}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold">{d.title}</p>
                            <p className="truncate font-mono text-xs text-[#6b7f6f]">{o.code}</p>
                          </div>
                          <p className="shrink-0 text-right text-xs text-[#6b7f6f]">
                            ใช้แล้ว
                            <br />
                            {fmtTime(o.usedAt)}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            )}
          </section>
        )}

        {/* ===== โปรไฟล์ ===== */}
        {view === "profile" && (
          <section aria-label="โปรไฟล์">
            <h1 className="text-3xl font-bold">โปรไฟล์</h1>

            {!user ? (
              <div className="mt-6 rounded-3xl border border-dashed border-[#b9cba6] bg-white/60 p-8 text-center">
                <p className="text-[#4d6652]">{ready ? "ยังไม่ได้เข้าสู่ระบบ" : "กำลังโหลด..."}</p>
                {ready && (
                  <button
                    type="button"
                    onClick={() => needLogin("profile")}
                    className="mt-4 rounded-full bg-[#14402c] px-6 py-2.5 font-semibold text-white transition active:scale-95"
                  >
                    เข้าสู่ระบบ / สมัครสมาชิก
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="mt-6 flex items-center gap-4 rounded-3xl bg-[#14402c] p-5 text-white">
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#d9f27a] text-2xl font-bold uppercase text-[#14402c]">
                    {(user.name || user.username).charAt(0)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-lg font-bold">{user.name}</p>
                    <p className="truncate text-sm text-[#d9f27a]">@{user.username}</p>
                  </div>
                </div>

                <div className="mt-4 rounded-3xl border border-[#e3ecd6] bg-white p-5">
                  <h2 className="text-lg font-bold">ข้อมูลผู้ซื้อ</h2>
                  <p className="mt-1 text-sm text-[#4d6652]">ใช้กรอกข้อมูลให้อัตโนมัติตอนซื้อตั๋ว</p>
                  <div className="mt-4 space-y-4">
                    <label className="block">
                      <span className="text-sm font-medium">ชื่อ-นามสกุล</span>
                      <input
                        value={accName}
                        onChange={(e) => {
                          setAccName(e.target.value);
                          setAccSaved(false);
                        }}
                        autoComplete="name"
                        className={inputCls}
                      />
                    </label>
                    <label className="block">
                      <span className="text-sm font-medium">เบอร์โทร</span>
                      <input
                        value={accPhone}
                        onChange={(e) => {
                          setAccPhone(e.target.value);
                          setAccSaved(false);
                        }}
                        inputMode="numeric"
                        autoComplete="tel"
                        placeholder="0812345678"
                        className={inputCls}
                      />
                    </label>
                    {accError && (
                      <p role="alert" className="text-sm font-medium text-red-600">
                        {accError}
                      </p>
                    )}
                    {accSaved && (
                      <p role="status" className="text-sm font-medium text-[#2f8f5b]">
                        บันทึกแล้ว
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={saveProfile}
                      className="rounded-full bg-[#14402c] px-6 py-2.5 font-semibold text-white transition active:scale-95"
                    >
                      บันทึกข้อมูล
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={logout}
                  className="mt-4 w-full rounded-2xl border border-[#14402c] py-3.5 font-semibold transition active:scale-[0.99]"
                >
                  ออกจากระบบ
                </button>
              </>
            )}
          </section>
        )}

        {/* ===== เข้าสู่ระบบ / สมัครสมาชิก ===== */}
        {view === "auth" && (
          <section aria-label={authMode === "login" ? "เข้าสู่ระบบ" : "สมัครสมาชิก"}>
            <SubHeader title={authMode === "login" ? "เข้าสู่ระบบ" : "สมัครสมาชิก"} onBack={() => go(afterAuth === "pay" ? "buy" : "home")} />

            <div className="relative mt-6 overflow-hidden rounded-3xl bg-[#14402c] p-5 text-white">
              <p className="text-[11px] font-bold tracking-wider text-[#d9f27a]">PAYDAY IS PLAY DAY</p>
              <h2 className="mt-2 text-2xl font-bold leading-tight">
                {authMode === "login" ? "ยินดีต้อนรับกลับมา!" : "มาเป็นสมาชิก แล้วไปเล่นกัน!"}
              </h2>
              <p className="mt-1 text-xs text-white/70">
                {afterAuth === "pay" ? "เข้าสู่ระบบก่อน เพื่อชำระเงินและรับตั๋ว" : "เข้าสู่ระบบเพื่อซื้อและดูตั๋วของคุณ"}
              </p>
            </div>

            <div role="tablist" aria-label="โหมด" className="mt-5 grid grid-cols-2 rounded-2xl bg-[#e3ecd6] p-1">
              {(
                [
                  ["login", "เข้าสู่ระบบ"],
                  ["register", "สมัครสมาชิก"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={authMode === id}
                  onClick={() => {
                    setAuthMode(id);
                    setAuthError("");
                  }}
                  className={`rounded-xl py-2.5 text-sm font-bold transition ${
                    authMode === id ? "bg-[#14402c] text-white" : "text-[#4d6652]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <form
              className="mt-4 space-y-4 rounded-3xl border border-[#e3ecd6] bg-white p-5"
              onSubmit={(e) => {
                e.preventDefault();
                submitAuth();
              }}
            >
              {authMode === "register" && (
                <>
                  <label className="block">
                    <span className="text-sm font-medium">ชื่อ-นามสกุล</span>
                    <input
                      value={authName}
                      onChange={(e) => setAuthName(e.target.value)}
                      autoComplete="name"
                      className={inputCls}
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium">เบอร์โทร</span>
                    <input
                      value={authPhone}
                      onChange={(e) => setAuthPhone(e.target.value)}
                      inputMode="numeric"
                      autoComplete="tel"
                      placeholder="0812345678"
                      className={inputCls}
                    />
                  </label>
                </>
              )}
              <label className="block">
                <span className="text-sm font-medium">Username</span>
                <input
                  value={authUser}
                  onChange={(e) => setAuthUser(e.target.value)}
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="เช่น somchai99"
                  className={inputCls}
                />
                {authMode === "register" && (
                  <span className="mt-1 block text-xs text-[#6b7f6f]">3-20 ตัว ใช้ a-z 0-9 . _ ได้</span>
                )}
              </label>
              <label className="block">
                <span className="text-sm font-medium">รหัสผ่าน</span>
                <input
                  type="password"
                  value={authPass}
                  onChange={(e) => setAuthPass(e.target.value)}
                  autoComplete={authMode === "login" ? "current-password" : "new-password"}
                  className={inputCls}
                />
                {authMode === "register" && (
                  <span className="mt-1 block text-xs text-[#6b7f6f]">อย่างน้อย 6 ตัวอักษร</span>
                )}
              </label>

              {authError && (
                <p role="alert" className="text-sm font-medium text-red-600">
                  {authError}
                </p>
              )}

              <button
                type="submit"
                disabled={authBusy}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#14402c] py-4 text-base font-bold text-white transition active:scale-[0.99] disabled:opacity-60"
              >
                {authBusy ? "กำลังดำเนินการ..." : authMode === "login" ? "เข้าสู่ระบบ" : "สมัครสมาชิก"}
                {!authBusy && <IconArrow className="h-5 w-5 text-[#d9f27a]" />}
              </button>
            </form>
          </section>
        )}
      </main>

      {/* แถบด้านล่าง: หน้าเลือกตั๋ว */}
      {view === "buy" && (
        <CheckoutBar aboveNav>
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs text-[#6b7f6f]">ทั้งหมด {cartCount} ใบ</p>
              <p className="text-sm font-bold">ยอดรวม</p>
            </div>
            <p className="text-4xl font-extrabold">{baht(cartTotal)}</p>
          </div>
          <button
            type="button"
            onClick={toPay}
            disabled={cartCount === 0}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#14402c] py-4 text-base font-bold text-white transition active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-[#c7d3bb] disabled:text-white/80"
          >
            {user ? "ไปชำระเงิน" : "เข้าสู่ระบบเพื่อชำระเงิน"}
            <IconArrow className="h-5 w-5 text-[#d9f27a]" />
          </button>
        </CheckoutBar>
      )}

      {showNav && <BottomNav view={navView} badges={badges} onGo={go} />}

      {/* ===== หน้าต่างแสดงตั๋ว ===== */}
      {sheet && sheetDef && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="sheet-title"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
          onClick={() => {
            setSheet(null);
            setConfirmCode(null);
          }}
        >
          <div
            className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-[#f1f7e9] p-5 pb-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 id="sheet-title" className="text-xl font-bold">
                {sheetDef.title} · {sheetOrders.length} ใบ
              </h2>
              <button
                type="button"
                onClick={() => {
                  setSheet(null);
                  setConfirmCode(null);
                }}
                className="rounded-full bg-white px-4 py-1.5 text-sm font-semibold"
              >
                ปิด
              </button>
            </div>
            <p className="mt-1 text-xs text-[#4d6652]">ให้เจ้าหน้าที่สแกนก่อน แล้วค่อยกด “ใช้แล้ว”</p>

            <div className="mt-4 space-y-4">
              {sheetOrders.map((o) => (
                <div key={o.code}>
                  <TicketPass def={sheetDef} order={o} />
                  {confirmCode === o.code ? (
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => setConfirmCode(null)}
                        className="flex-1 rounded-2xl border border-[#14402c] py-3 text-sm font-semibold"
                      >
                        ยกเลิก
                      </button>
                      <button
                        type="button"
                        onClick={() => markUsed(o.code)}
                        className="flex-1 rounded-2xl bg-red-600 py-3 text-sm font-bold text-white"
                      >
                        ยืนยัน ใช้แล้ว
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmCode(o.code)}
                      className="mt-2 w-full rounded-2xl border border-[#14402c] py-3 text-sm font-semibold transition active:scale-[0.99]"
                    >
                      ทำเครื่องหมายว่าใช้แล้ว
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}