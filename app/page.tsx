"use client";

import { useEffect, useRef, useState } from "react";
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

// สถานะรายการโอนเงิน (ตรงกับ PaymentStatus ใน lib/tickets.ts)
type PayStatus = "awaiting_slip" | "reviewing" | "approved" | "rejected" | "expired";

// รายการโอนเงิน (มาจาก POST /api/orders, GET /api/orders และ GET /api/payments/[id])
type Payment = {
  id: string;
  amount: number;
  expiresAt: string;
  ref: string;
  status: PayStatus;
  qrUrl?: string;
  rejectReason?: string;
};

// ผลจาก GET /api/payments/[id]
type PayPoll = Payment & { orders?: Order[] };

const MAX_QTY = 20; // จำนวนสูงสุดต่อตั๋ว 1 ประเภท ต่อการซื้อ 1 ครั้ง (กันกดพลาด)
const CART_KEY = "payday-cart-v1";
const SLIP_POLL_MS = 5000; // เช็กสถานะรายการโอนทุกกี่มิลลิวินาที
const SWIPE_REVEAL = 88; // ความกว้างปุ่ม "ลบ" ที่โผล่ตอนปัดซ้าย (px)

const STATUS_LABEL: Record<PayStatus, string> = {
  awaiting_slip: "รอโอน / ส่งสลีป",
  reviewing: "รอเจ้าหน้าที่ตรวจสลีป",
  rejected: "สลีปไม่ผ่าน ส่งใหม่ได้",
  approved: "อนุมัติแล้ว",
  expired: "หมดเวลา",
};

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
  method: "GET" | "POST" | "PATCH" | "DELETE" = "GET",
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
      className="absolute inset-x-0 bottom-0 h-auto w-full md:left-auto md:w-1/2"
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

/* ---------- แถวที่ปัดซ้ายเพื่อลบ ----------
   ปัดไปทางซ้ายจนปุ่มแดง "ลบ" โผล่ แล้วกดปุ่มเพื่อยืนยัน
   แตะที่การ์ดตอนเปิดอยู่ = ปิดกลับ  ใช้ pointer events จึงลากด้วยเมาส์ได้เหมือนกัน */
function SwipeRow({
  children,
  onDelete,
  deleting = false,
  label,
}: {
  children: ReactNode;
  onDelete: () => void;
  deleting?: boolean;
  label: string;
}) {
  const [dx, setDx] = useState(0);
  const [drag, setDrag] = useState(false);
  const st = useRef({ x: 0, y: 0, base: 0, active: false, horizontal: false, moved: false });

  const end = () => {
    const s = st.current;
    if (!s.active) return;
    s.active = false;
    setDrag(false);
    if (s.horizontal) setDx((cur) => (cur <= -SWIPE_REVEAL / 2 ? -SWIPE_REVEAL : 0));
  };

  return (
    <div className="relative overflow-hidden rounded-2xl">
      <button
        type="button"
        onClick={onDelete}
        disabled={deleting}
        tabIndex={dx < 0 ? 0 : -1}
        aria-hidden={dx >= 0}
        aria-label={label}
        style={{ width: SWIPE_REVEAL, opacity: dx < 0 ? (deleting ? 0.6 : 1) : 0 }}
        className="absolute inset-y-0 right-0 flex items-center justify-center bg-red-600 text-sm font-bold text-white"
      >
        {deleting ? "กำลังลบ..." : "ลบ"}
      </button>

      <div
        style={{
          transform: `translateX(${dx}px)`,
          transition: drag ? "none" : "transform 200ms ease",
          touchAction: "pan-y",
        }}
        className="relative select-none"
        onPointerDown={(e) => {
          if (deleting) return;
          const s = st.current;
          s.x = e.clientX;
          s.y = e.clientY;
          s.base = dx <= -SWIPE_REVEAL / 2 ? -SWIPE_REVEAL : 0;
          s.active = true;
          s.horizontal = false;
          s.moved = false;
        }}
        onPointerMove={(e) => {
          const s = st.current;
          if (!s.active) return;
          const mx = e.clientX - s.x;
          const my = e.clientY - s.y;
          if (!s.horizontal) {
            if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
            if (Math.abs(my) > Math.abs(mx)) {
              s.active = false; // เลื่อนหน้าจอขึ้นลง ไม่ใช่การปัด
              return;
            }
            s.horizontal = true;
            s.moved = true;
            setDrag(true);
            e.currentTarget.setPointerCapture(e.pointerId);
          }
          setDx(Math.max(-SWIPE_REVEAL, Math.min(0, s.base + mx)));
        }}
        onPointerUp={end}
        onPointerCancel={end}
        onClickCapture={(e) => {
          const s = st.current;
          if (s.moved) {
            // เพิ่งลากเสร็จ ไม่นับเป็นการกด
            s.moved = false;
            e.preventDefault();
            e.stopPropagation();
          } else if (dx < 0) {
            // เปิดอยู่แล้วแตะที่การ์ด = ปิด
            e.preventDefault();
            e.stopPropagation();
            setDx(0);
          }
        }}
      >
        {children}
      </div>
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
            <span className={`text-xs md:text-sm ${active ? "font-bold text-[#14402c]" : "text-[#6b7f6f]"}`}>{s}</span>
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
      <h1 className="text-xl font-semibold text-[#14402c] md:text-2xl">{title}</h1>
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

/* ---------- เมนูหลัก ---------- */
type Badges = Partial<Record<View, number>>;

const NAV: { id: View; label: string; icon: ReactNode }[] = [
  { id: "home", label: "หน้าหลัก", icon: <IconHome /> },
  { id: "buy", label: "ซื้อตั๋ว", icon: <IconTicket /> },
  { id: "tickets", label: "ตั๋วของฉัน", icon: <IconGift /> },
  { id: "profile", label: "โปรไฟล์", icon: <IconUser /> },
];

// มือถือ: แถบล่าง (ซ่อนบนจอ md ขึ้นไป)
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
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[#e3ecd6] bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
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

// คอมพิวเตอร์/แท็บเล็ต: แถบบน (แสดงตั้งแต่จอ md ขึ้นไป)
function TopNav({
  view,
  badges,
  user,
  ready,
  onGo,
  onLogin,
}: {
  view: View;
  badges: Badges;
  user: User | null;
  ready: boolean;
  onGo: (v: View) => void;
  onLogin: () => void;
}) {
  return (
    <header className="sticky top-0 z-40 hidden border-b border-[#e3ecd6] bg-white/90 backdrop-blur md:block">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-8 py-3">
        <button
          type="button"
          onClick={() => onGo("home")}
          aria-label="ไปหน้าหลัก"
          className="flex items-center gap-3 text-left"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#14402c] text-[#d9f27a]">
            <IconTicket />
          </span>
          <span>
            <span className="block text-xl font-bold lowercase leading-none">{EVENT.name}</span>
            <span className="mt-1 block text-[11px] text-[#4d6652]">{EVENT.tagline}</span>
          </span>
        </button>

        <nav aria-label="เมนูหลักบนคอมพิวเตอร์">
          <ul className="flex items-center gap-1">
            {NAV.filter((n) => n.id !== "profile").map((n) => {
              const active = view === n.id;
              const badge = badges[n.id] ?? 0;
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => onGo(n.id)}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm transition ${
                      active ? "bg-[#d9f27a] font-bold" : "font-medium text-[#4d6652] hover:bg-[#e3ecd6]"
                    }`}
                  >
                    {n.label}
                    {badge > 0 && (
                      <span className="min-w-5 rounded-full bg-[#14402c] px-1.5 text-center text-[11px] leading-5 text-white">
                        {badge}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="flex min-w-[8rem] justify-end">
          {ready && user && (
            <button
              type="button"
              onClick={() => onGo("profile")}
              aria-label="โปรไฟล์"
              aria-current={view === "profile" ? "page" : undefined}
              className={`flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-4 text-sm font-semibold transition ${
                view === "profile" ? "bg-[#d9f27a]" : "bg-[#e3ecd6] hover:bg-[#d6e3c5]"
              }`}
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#14402c] text-sm font-bold uppercase text-[#d9f27a]">
                {(user.name || user.username).charAt(0)}
              </span>
              <span className="max-w-[10rem] truncate">{user.name}</span>
            </button>
          )}
          {ready && !user && (
            <button
              type="button"
              onClick={onLogin}
              className="rounded-full bg-[#14402c] px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90"
            >
              เข้าสู่ระบบ
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

/* ---------- แถบสรุปยอด ----------
   มือถือ: ติดขอบล่างจอ  /  จอใหญ่: เป็นการ์ดลอยอยู่คอลัมน์ขวา (sticky) */
function CheckoutBar({ children, aboveNav = false }: { children: ReactNode; aboveNav?: boolean }) {
  return (
    <div
      className={`fixed inset-x-0 z-40 rounded-t-3xl border-t border-[#e3ecd6] bg-white shadow-[0_-8px_24px_rgba(20,64,44,0.08)] md:sticky md:inset-x-auto md:bottom-auto md:top-24 md:z-10 md:rounded-3xl md:border md:pb-0 md:shadow-[0_2px_12px_rgba(20,64,44,0.08)] ${
        aboveNav ? "bottom-[calc(4rem+env(safe-area-inset-bottom))]" : "bottom-0 pb-[env(safe-area-inset-bottom)]"
      }`}
    >
      <div className="mx-auto w-full max-w-md px-5 py-4 md:max-w-none md:px-6 md:py-6">{children}</div>
    </div>
  );
}

/* ---------- โอนเงิน + ส่งสลีป ---------- */

// ย่อรูปใหญ่ก่อนส่ง (กันไฟล์ใหญ่เกินลิมิตของโฮสต์) รูปเล็กอยู่แล้วส่งตามเดิม
async function shrinkImage(file: File): Promise<File> {
  if (file.size <= 2.5 * 1024 * 1024) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 2200 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")?.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.9));
    return blob ? new File([blob], "slip.jpg", { type: "image/jpeg" }) : file;
  } catch {
    return file;
  }
}

function SlipPay({
  paymentId,
  onBack,
  onPaid,
  onNeedLogin,
}: {
  paymentId: string;
  onBack: () => void;
  onPaid: (orders: Order[]) => void;
  onNeedLogin: () => void;
}) {
  const [pay, setPay] = useState<Payment | null>(null);
  const [loadError, setLoadError] = useState("");
  const [now, setNow] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [qrFailed, setQrFailed] = useState(false);

  // เช็กสถานะทุก SLIP_POLL_MS: อนุมัติแล้ว → ไปหน้ารับตั๋วเอง
  useEffect(() => {
    let stopped = false;
    let running = false;

    const tick = async () => {
      if (running || stopped) return;
      running = true;
      const r = await api<PayPoll>(`/api/payments/${paymentId}`);
      running = false;
      if (stopped) return;

      if (!r.ok) {
        if (r.status === 401) {
          stopped = true;
          onNeedLogin();
        } else if (r.status === 404) {
          stopped = true;
          setLoadError("ไม่พบรายการชำระเงิน");
        } else {
          setLoadError(r.error); // เน็ตหลุดชั่วคราว ลองใหม่รอบถัดไปเอง
        }
        return;
      }

      setLoadError("");
      const { orders, ...p } = r.data;
      setPay(p);
      if (p.status === "approved" && orders) {
        stopped = true;
        onPaid(orders);
      } else if (p.status === "expired") {
        stopped = true;
      }
    };

    setNow(Date.now());
    tick();
    const poll = setInterval(tick, SLIP_POLL_MS);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      stopped = true;
      clearInterval(poll);
      clearInterval(clock);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentId]);

  // พรีวิวรูปที่เลือก
  useEffect(() => {
    if (!file) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function upload() {
    if (!file || busy) return;
    if (file.size > 25 * 1024 * 1024) return setErr("รูปใหญ่เกินไป เลือกรูปอื่น");
    setBusy(true);
    setErr("");
    try {
      const fd = new FormData();
      fd.append("slip", await shrinkImage(file));
      const res = await fetch(`/api/payments/${paymentId}/slip`, { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) return onNeedLogin();
      if (!res.ok) return setErr(data.error ?? "ส่งสลีปไม่สำเร็จ ลองใหม่อีกครั้ง");
      setFile(null);
      setPay((p) => (p ? { ...p, status: "reviewing", rejectReason: undefined } : p));
    } catch {
      setErr("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  }

  const secsLeft = pay ? Math.max(0, Math.ceil((new Date(pay.expiresAt).getTime() - now) / 1000)) : 0;
  const open = pay && (pay.status === "awaiting_slip" || pay.status === "rejected");

  return (
    <section aria-label="โอนเงินและส่งสลีป" className="md:mx-auto md:max-w-4xl">
      <SubHeader title="โอนเงินและส่งสลีป" onBack={onBack} />
      <div className="mt-6">
        <Steps current={2} />
      </div>

      {!pay && <p className="mt-6 text-sm text-[#4d6652]">{loadError || "กำลังโหลด..."}</p>}

      {open && (
        <div className="md:mt-6 md:grid md:grid-cols-2 md:items-start md:gap-6">
          {pay.status === "rejected" && (
            <div role="alert" className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 md:col-span-2 md:mt-0">
              <p className="text-sm font-bold text-red-700">สลีปไม่ผ่าน</p>
              <p className="mt-1 text-sm text-red-700">{pay.rejectReason ?? "กรุณาตรวจสอบแล้วส่งสลีปใหม่"}</p>
            </div>
          )}

          <div className="mt-6 rounded-3xl border border-[#e3ecd6] bg-white p-5 text-center md:mt-0 md:p-6">
            <p className="text-xs text-[#6b7f6f]">โอนตามยอดนี้เป๊ะ ๆ</p>
            <p className="mt-1 text-4xl font-extrabold">{baht(pay.amount)}</p>

            <div className="mx-auto mt-4 flex aspect-square w-full max-w-[16rem] items-center justify-center overflow-hidden rounded-2xl border border-[#e3ecd6] bg-white p-2 md:max-w-[19rem]">
              {qrFailed || !pay.qrUrl ? (
                <p className="px-4 text-sm text-red-600">แสดง QR ไม่ได้ ปิดหน้านี้แล้วเปิดใหม่</p>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={pay.qrUrl}
                  alt={`QR พร้อมเพย์ ยอด ${baht(pay.amount)}`}
                  className="h-full w-full object-contain"
                  onError={() => setQrFailed(true)}
                />
              )}
            </div>

            <p className="mt-3 text-sm text-[#4d6652]">สแกนด้วยแอปธนาคาร (ยอดและรหัสอ้างอิงอยู่ใน QR แล้ว)</p>
            <p className="mt-1 text-xs text-[#6b7f6f]">
              รหัสอ้างอิง <span className="font-mono font-bold text-[#14402c]">{pay.ref}</span>
            </p>
            {pay.qrUrl && (
              <a
                href={pay.qrUrl}
                download={`payday-${pay.ref}.png`}
                className="mt-3 inline-block rounded-full border border-[#14402c] px-4 py-2 text-xs font-semibold"
              >
                บันทึก QR ลงเครื่อง (สำหรับสแกนจากรูป)
              </a>
            )}
            <p className="mt-3 text-sm font-bold">
              {secsLeft > 0 ? `ส่งสลีปภายใน ${fmtCountdown(secsLeft)}` : "หมดเวลาแล้ว กำลังตรวจสอบ..."}
            </p>
          </div>

          <div className="mt-4 rounded-3xl border border-[#e3ecd6] bg-white p-5 md:mt-0 md:p-6">
            <h2 className="text-base font-bold">ส่งสลีปโอนเงิน</h2>
            <p className="mt-1 text-xs text-[#6b7f6f]">
              ใช้สลีปจากแอปธนาคาร ต้องเห็น QR บนสลีปชัด ไม่ครอป ไม่ตัดขอบ สลีป 1 ใบใช้ได้ครั้งเดียว
            </p>

            <label className="mt-3 flex min-h-40 cursor-pointer items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-[#b9cba6] bg-[#f1f7e9] p-3 text-center text-sm font-semibold text-[#4d6652] focus-within:ring-2 focus-within:ring-[#14402c] md:min-h-56">
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  setErr("");
                }}
              />
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="สลีปที่เลือก" className="max-h-72 rounded-xl object-contain md:max-h-96" />
              ) : (
                "แตะเพื่อเลือกรูปสลีป"
              )}
            </label>

            {err && (
              <p role="alert" className="mt-3 text-sm font-medium text-red-600">
                {err}
              </p>
            )}
            {loadError && <p className="mt-2 text-xs text-red-600">{loadError}</p>}

            <button
              type="button"
              onClick={upload}
              disabled={!file || busy || secsLeft === 0}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#14402c] py-4 text-base font-bold text-white transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "กำลังส่งสลีป..." : "ส่งสลีป"}
              {!busy && <IconArrow className="h-5 w-5 text-[#d9f27a]" />}
            </button>
          </div>
        </div>
      )}

      {pay?.status === "reviewing" && (
        <div className="mt-6 rounded-3xl border border-[#e3ecd6] bg-white p-6 text-center md:mx-auto md:max-w-xl md:p-8">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#d9f27a]">
            <IconReceipt className="h-7 w-7" />
          </span>
          <h2 className="mt-4 text-xl font-bold">ส่งสลีปแล้ว รอตรวจสอบ</h2>
          <p className="mt-2 text-sm text-[#4d6652]">
            {baht(pay.amount)} · รหัส <span className="font-mono font-bold">{pay.ref}</span>
          </p>
          <p className="mt-2 text-sm text-[#4d6652]">
            เจ้าหน้าที่อนุมัติแล้วตั๋วจะขึ้นที่หน้า “ตั๋วของฉัน” ปิดหน้านี้ได้เลย ไม่ต้องรอ
          </p>
          <button
            type="button"
            onClick={onBack}
            className="mt-5 rounded-full bg-[#14402c] px-6 py-2.5 font-semibold text-white transition active:scale-95"
          >
            ไปหน้าตั๋วของฉัน
          </button>
        </div>
      )}

      {pay?.status === "expired" && (
        <div className="mt-6 rounded-3xl border border-[#e3ecd6] bg-white p-6 text-center md:mx-auto md:max-w-xl md:p-8">
          <h2 className="text-xl font-bold">หมดเวลาแล้ว</h2>
          <p className="mt-2 text-sm text-[#4d6652]">
            ถ้าโอนเงินไปแล้ว ติดต่อเจ้าหน้าที่พร้อมรหัสอ้างอิง <span className="font-mono font-bold">{pay.ref}</span>
          </p>
          <button
            type="button"
            onClick={onBack}
            className="mt-5 rounded-full bg-[#14402c] px-6 py-2.5 font-semibold text-white transition active:scale-95"
          >
            กลับ
          </button>
        </div>
      )}

      <div className="mt-4 md:mx-auto md:mt-6 md:max-w-xl">
        <InfoBox
          icon={<IconInfo className="h-5 w-5" />}
          title="ส่งสลีปแล้วรอสักครู่"
          text="ปิดหน้านี้ได้ ตั๋วจะขึ้นที่หน้า “ตั๋วของฉัน” เมื่อเจ้าหน้าที่อนุมัติ"
        />
      </div>
    </section>
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

  // รายการโอนเงิน: id ของรายการที่เปิดอยู่ + รายการค้างทั้งหมด
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [pending, setPending] = useState<Payment[]>([]);
  const [cancelingId, setCancelingId] = useState<string | null>(null); // รายการที่กำลังลบ

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

  // กด Esc ปิดหน้าต่างแสดงตั๋ว (คอมพิวเตอร์)
  useEffect(() => {
    if (!sheet) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSheet(null);
        setConfirmCode(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheet]);

  // เข้าหน้า "ตั๋วของฉัน" ให้โหลดตั๋วใหม่เสมอ และโหลดซ้ำทุก 10 วิ
  // (ตั๋วถูกออกตอน admin อนุมัติสลีป ผู้ซื้ออาจปิดหน้าโอนเงินไปแล้ว ต้องดึงมาแสดง)
  useEffect(() => {
    if (view !== "tickets" || !user) return;
    let cancelled = false;
    const loadTickets = async () => {
      const r = await api<{ orders: Order[]; pending?: Payment[] }>("/api/orders");
      if (r.ok && !cancelled) {
        setOrders(r.data.orders);
        setPending(r.data.pending ?? []);
      }
    };
    loadTickets();
    const t = setInterval(loadTickets, 10000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [view, user]);

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
    setPaymentId(null);
    setPending([]);
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

  // admin อนุมัติแล้ว (หน้าโอนเงินเห็นสถานะ approved): เก็บตั๋ว ล้างตะกร้า ไปหน้ารับตั๋ว
  function finishPaid(made: Order[]) {
    const codes = new Set(made.map((o) => o.code));
    setOrders((prev) => [...made, ...prev.filter((o) => !codes.has(o.code))]);
    setCart({});
    save(CART_KEY, {});
    setPaymentId(null);
    setJustBought(made);
    setView("done");
  }

  // กดยืนยัน: ขอ QR จากเซิร์ฟเวอร์ ตั๋วยังไม่ถูกออกจนกว่า admin จะอนุมัติสลีป
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

    // เซิร์ฟเวอร์คิดราคาเอง สร้างรายการรอโอน + QR พร้อมเพย์ (ยอด + รหัสอ้างอิงอยู่ใน QR)
    // ตั๋วถูกสร้างใน MongoDB หลัง admin อนุมัติสลีปเท่านั้น
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

    setPaymentId(r.data.payment.id);
    setCart({}); // สร้างรายการแล้ว ล้างตะกร้า กันซื้อซ้ำ
    save(CART_KEY, {});
    setView("qr");
  }

  // ออกจากหน้าโอนเงิน: รายการยังค้างอยู่ ไปดู/ส่งสลีปต่อได้ที่ "ตั๋วของฉัน"
  function leaveQr() {
    setPaymentId(null);
    setTab("ready");
    go("tickets");
  }

  // ปัดซ้ายแล้วกด "ลบ" (หรือกดปุ่ม "ยกเลิก" บนคอมพิวเตอร์): ยกเลิกรายการที่ยังไม่ส่งสลีป (เซิร์ฟเวอร์ตรวจสถานะซ้ำอีกที)
  async function cancelPayment(id: string) {
    if (cancelingId) return;
    setCancelingId(id);
    const r = await api(`/api/payments/${id}`, "DELETE");
    setCancelingId(null);
    if (r.ok || (!r.ok && r.status === 404)) {
      setPending((prev) => prev.filter((p) => p.id !== id));
      return;
    }
    if (r.status === 401) return needLogin("tickets");
    alert(r.error);
    // สถานะอาจเปลี่ยนไปแล้ว (เช่นส่งสลีปจากเครื่องอื่น) โหลดรายการใหม่
    const o = await api<{ orders: Order[]; pending?: Payment[] }>("/api/orders");
    if (o.ok) {
      setOrders(o.data.orders);
      setPending(o.data.pending ?? []);
    }
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
    <div
      className={`min-h-screen bg-[#f1f7e9] text-[#14402c] [&_button:disabled]:cursor-not-allowed [&_button:not(:disabled)]:cursor-pointer ${appFont.className}`}
    >
      {/* แถบเมนูบน (เฉพาะแท็บเล็ต/คอมพิวเตอร์) */}
      <TopNav
        view={navView}
        badges={badges}
        user={user}
        ready={ready}
        onGo={go}
        onLogin={() => needLogin("home")}
      />

      <main
        className={`mx-auto w-full max-w-md px-5 pt-6 md:max-w-6xl md:px-8 md:pb-16 md:pt-8 ${
          view === "buy" ? "pb-64" : showNav ? "pb-28" : view === "done" || view === "qr" ? "pb-10" : "pb-64"
        }`}
      >
        {/* ===== หน้าหลัก ===== */}
        {view === "home" && (
          <>
            <header className="flex items-center justify-between md:hidden">
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

            <section className="relative mt-6 overflow-hidden rounded-3xl bg-[#14402c] p-5 text-white md:mt-0 md:flex md:min-h-[20rem] md:items-center md:p-12">
              <div className="md:max-w-[50%]">
                <p className="text-[11px] font-bold tracking-wider text-[#d9f27a] md:text-xs">PAYDAY IS PLAY DAY</p>
                <h2 className="mt-3 text-3xl font-bold leading-tight md:text-4xl lg:text-5xl">
                  เงินเดือนออกแล้ว
                  <br />
                  ออกมาเล่นกัน!
                </h2>
                <p className="mt-4 inline-flex items-center rounded-full bg-[#d9f27a] px-3 py-1.5 text-xs font-bold text-[#14402c] md:mt-6 md:text-sm">
                  {EVENT.pill}
                </p>
              </div>
              <div className="aspect-[967/496] md:hidden" />
              <HeroArt />
            </section>

            <div className="mt-3 flex items-center justify-between px-1 text-sm md:mt-4 md:text-base">
              <span className="flex items-center gap-2">
                <IconPin className="h-4 w-4 text-[#2f8f5b]" />
                {EVENT.place}
              </span>
              <a
                href={mapUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-semibold underline-offset-2 hover:underline md:text-sm"
              >
                ดูแผนที่ ↗
              </a>
            </div>

            <section aria-label="เลือกประเภทตั๋ว" className="mt-8 md:mt-12">
              <h2 className="text-xl font-bold md:text-2xl">วันนี้อยากสนุกแบบไหน?</h2>
              <p className="mt-1 text-sm text-[#4d6652] md:text-base">เลือกตั๋วที่ใช่ แล้วไปสนุกกันเลย</p>
              <div className="mt-4 grid grid-cols-2 gap-3 md:mt-6 md:gap-6">
                {TICKETS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => pick(t.id)}
                    aria-label={`${t.title} ${baht(t.price)} ต่อใบ`}
                    className="block text-left transition active:scale-[0.98] md:hover:-translate-y-0.5"
                  >
                    <Perforated
                      bg={t.card}
                      dash="border-[#14402c]/35"
                      top={
                        <div className="px-4 pb-3 pt-4 md:px-6 md:pb-4 md:pt-6">
                          {iconOf(t.id, "h-6 w-6 md:h-8 md:w-8")}
                          <p className="mt-2 text-lg font-bold leading-tight md:text-2xl">{t.title}</p>
                          <p className="mt-1 text-xs md:text-sm">{t.homeNote}</p>
                        </div>
                      }
                      bottom={
                        <div className="flex w-full items-end justify-between px-4 pb-4 pt-3 md:px-6 md:pb-6 md:pt-4">
                          <p className="text-3xl font-extrabold md:text-4xl">
                            {baht(t.price)}
                            <span className="text-xs font-medium"> / ใบ</span>
                          </p>
                          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#14402c] text-white md:h-11 md:w-11">
                            <IconArrow className="h-5 w-5" />
                          </span>
                        </div>
                      }
                    />
                  </button>
                ))}
              </div>

              <div className="mt-3 flex items-center gap-3 rounded-2xl bg-white p-4 md:mt-6 md:p-5">
                <IconSpark className="h-7 w-7 shrink-0 text-[#2f8f5b]" />
                <div>
                  <p className="text-sm font-bold md:text-base">ความโชคดีอาจเป็นของคุณ!</p>
                  <p className="mt-0.5 text-xs text-[#4d6652] md:text-sm">ซื้อ Lucky Draw แล้วรอลุ้นพร้อมกัน</p>
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

            <h2 className="mt-8 text-2xl font-bold md:text-3xl">พร้อมสนุกกี่ใบดี?</h2>
            <p className="mt-1 text-sm text-[#4d6652] md:text-base">เลือกจำนวนตั๋วทั้ง 2 แบบในครั้งเดียว</p>

            <div className="md:mt-6 md:grid md:grid-cols-[minmax(0,1fr)_22rem] md:items-start md:gap-8">
              <div className="mt-5 flex flex-col gap-4 md:mt-0 md:grid md:grid-cols-2">
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
                        <div className="flex items-center justify-between gap-2 px-4 pb-4 pt-3">
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

                <div className="md:col-span-2">
                  <InfoBox
                    icon={<IconShield className="h-5 w-5" />}
                    title="ตั๋วแต่ละประเภทใช้แทนกันไม่ได้"
                    text="ตั๋วใช้ได้เฉพาะวันงานที่ระบุเท่านั้น"
                  />
                </div>
              </div>

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

            <div className="md:mt-6 md:grid md:grid-cols-[minmax(0,1fr)_22rem] md:items-start md:gap-8">
              <div>
                <div className="mt-6 rounded-3xl border border-[#e3ecd6] bg-white p-4 md:mt-0 md:p-6">
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

                <div className="mt-4 rounded-3xl border border-[#e3ecd6] bg-white p-4 md:p-6">
                  <h2 className="text-base font-bold">วิธีชำระเงิน</h2>
                  <div className="mt-3 flex items-center justify-between rounded-2xl border-2 border-[#14402c] bg-[#f1f7e9] px-4 py-3">
                    <span className="text-sm font-bold">PromptPay (สแกน QR)</span>
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#14402c] text-white">
                      <IconCheck className="h-3.5 w-3.5" />
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-[#6b7f6f]">
                    กดยืนยันแล้วระบบจะสร้าง QR ให้สแกน โอนแล้วส่งสลีปภายใน 60 นาที รอเจ้าหน้าที่ตรวจสอบ
                  </p>
                </div>
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
            </div>
          </section>
        )}

        {/* ===== ชำระเงิน (ขั้นที่ 2): โอน + ส่งสลีป ===== */}
        {view === "qr" && paymentId && (
          <SlipPay
            paymentId={paymentId}
            onBack={leaveQr}
            onPaid={finishPaid}
            onNeedLogin={() => {
              setPaymentId(null);
              needLogin("tickets");
            }}
          />
        )}

        {/* ===== รับตั๋ว (ขั้นที่ 3) ===== */}
        {view === "done" && justBought && (
          <section aria-label="ซื้อตั๋วสำเร็จ">
            <Steps current={3} />
            <div className="mt-8 flex flex-col items-center text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#d9f27a]">
                <IconCheck className="h-9 w-9" />
              </span>
              <h1 className="mt-4 text-2xl font-bold md:text-3xl">ได้รับตั๋วแล้ว!</h1>
              <p className="mt-1 text-sm text-[#4d6652] md:text-base">
                {justBought.length} ใบ · รวม {baht(justBought.reduce((s, o) => s + o.price, 0))}
              </p>
            </div>

            <div className="mt-6 flex flex-col gap-4 md:mt-8 md:grid md:grid-cols-2 md:items-start md:gap-6 lg:grid-cols-3">
              {justBought.map((o) => (
                <TicketPass key={o.code} def={defOf(o.ticket)} order={o} />
              ))}
            </div>

            <div className="mt-6 flex gap-3 md:mx-auto md:mt-8 md:max-w-md">
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

            <div
              role="tablist"
              aria-label="สถานะตั๋ว"
              className="mt-5 grid grid-cols-2 rounded-2xl bg-[#e3ecd6] p-1 md:max-w-md"
            >
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

            {user && tab === "ready" && pending.length > 0 && (
              <div className="mt-5 flex flex-col gap-3 md:grid md:grid-cols-2 md:items-start md:gap-4">
                {pending.map((p) => {
                  const card = (
                    <div className="rounded-2xl border border-dashed border-[#14402c]/40 bg-white p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-bold">
                            รายการ {p.ref} · {baht(p.amount)}
                          </p>
                          <p className="mt-0.5 text-xs text-[#6b7f6f]">{STATUS_LABEL[p.status]}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {p.status === "awaiting_slip" && (
                            <button
                              type="button"
                              disabled={cancelingId === p.id}
                              onClick={() => {
                                if (window.confirm(`ยกเลิกรายการ ${p.ref} ใช่ไหม?`)) cancelPayment(p.id);
                              }}
                              className="hidden rounded-full border border-red-300 px-4 py-2 text-xs font-bold text-red-600 transition active:scale-95 disabled:opacity-60 md:inline-block"
                            >
                              ยกเลิก
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setPaymentId(p.id);
                              go("qr");
                            }}
                            className="rounded-full bg-[#14402c] px-4 py-2 text-xs font-bold text-white transition active:scale-95"
                          >
                            {p.status === "reviewing" ? "ดูสถานะ" : "ส่งสลีป"}
                          </button>
                        </div>
                      </div>
                    </div>
                  );

                  // ปัดซ้ายลบได้เฉพาะรายการที่ยังไม่ได้ส่งสลีป
                  return p.status === "awaiting_slip" ? (
                    <SwipeRow
                      key={p.id}
                      label={`ลบรายการ ${p.ref}`}
                      deleting={cancelingId === p.id}
                      onDelete={() => cancelPayment(p.id)}
                    >
                      {card}
                    </SwipeRow>
                  ) : (
                    <div key={p.id}>{card}</div>
                  );
                })}
                {pending.some((p) => p.status === "awaiting_slip") && (
                  <p className="px-1 text-xs text-[#6b7f6f] md:hidden">ปัดรายการที่ยังไม่ส่งสลีปไปทางซ้าย เพื่อยกเลิก</p>
                )}
              </div>
            )}

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
                  <div className="mt-5 flex flex-col gap-4 md:grid md:grid-cols-2 md:items-start md:gap-6">
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

                <div className="mt-4 md:mt-6">
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
                  <ul className="mt-5 flex flex-col gap-3 md:grid md:grid-cols-2 md:gap-4">
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
          <section aria-label="โปรไฟล์" className="md:mx-auto md:max-w-4xl">
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
              <div className="md:mt-6 md:grid md:grid-cols-[18rem_minmax(0,1fr)] md:items-start md:gap-6">
                <div className="mt-6 flex items-center gap-4 rounded-3xl bg-[#14402c] p-5 text-white md:col-start-1 md:row-start-1 md:mt-0">
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#d9f27a] text-2xl font-bold uppercase text-[#14402c]">
                    {(user.name || user.username).charAt(0)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-lg font-bold">{user.name}</p>
                    <p className="truncate text-sm text-[#d9f27a]">@{user.username}</p>
                  </div>
                </div>

                <div className="mt-4 rounded-3xl border border-[#e3ecd6] bg-white p-5 md:col-start-2 md:row-span-2 md:row-start-1 md:mt-0 md:p-6">
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
                  className="mt-4 w-full rounded-2xl border border-[#14402c] py-3.5 font-semibold transition active:scale-[0.99] md:col-start-1 md:row-start-2 md:mt-0"
                >
                  ออกจากระบบ
                </button>
              </div>
            )}
          </section>
        )}

        {/* ===== เข้าสู่ระบบ / สมัครสมาชิก ===== */}
        {view === "auth" && (
          <section
            aria-label={authMode === "login" ? "เข้าสู่ระบบ" : "สมัครสมาชิก"}
            className="md:mx-auto md:max-w-4xl"
          >
            <SubHeader
              title={authMode === "login" ? "เข้าสู่ระบบ" : "สมัครสมาชิก"}
              onBack={() => go(afterAuth === "pay" ? "buy" : "home")}
            />

            <div className="md:mt-6 md:grid md:grid-cols-2 md:items-start md:gap-8">
              <div className="relative mt-6 overflow-hidden rounded-3xl bg-[#14402c] p-5 text-white md:mt-0 md:p-8">
                <p className="text-[11px] font-bold tracking-wider text-[#d9f27a]">PAYDAY IS PLAY DAY</p>
                <h2 className="mt-2 text-2xl font-bold leading-tight md:text-3xl">
                  {authMode === "login" ? "ยินดีต้อนรับกลับมา!" : "มาเป็นสมาชิก แล้วไปเล่นกัน!"}
                </h2>
                <p className="mt-1 text-xs text-white/70 md:text-sm">
                  {afterAuth === "pay" ? "เข้าสู่ระบบก่อน เพื่อชำระเงินและรับตั๋ว" : "เข้าสู่ระบบเพื่อซื้อและดูตั๋วของคุณ"}
                </p>
              </div>

              <div>
                <div
                  role="tablist"
                  aria-label="โหมด"
                  className="mt-5 grid grid-cols-2 rounded-2xl bg-[#e3ecd6] p-1 md:mt-0"
                >
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
                  className="mt-4 space-y-4 rounded-3xl border border-[#e3ecd6] bg-white p-5 md:p-6"
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
              </div>
            </div>
          </section>
        )}
      </main>

      {showNav && <BottomNav view={navView} badges={badges} onGo={go} />}

      {/* ===== หน้าต่างแสดงตั๋ว (มือถือ: เลื่อนขึ้นจากด้านล่าง / คอมพิวเตอร์: กลางจอ) ===== */}
      {sheet && sheetDef && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="sheet-title"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 md:items-center md:p-6"
          onClick={() => {
            setSheet(null);
            setConfirmCode(null);
          }}
        >
          <div
            className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-[#f1f7e9] p-5 pb-8 md:max-w-3xl md:rounded-3xl md:p-8"
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

            <div className="mt-4 flex flex-col gap-4 md:grid md:grid-cols-2 md:items-start md:gap-6">
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