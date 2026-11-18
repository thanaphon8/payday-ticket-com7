"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Prompt } from "next/font/google";
import { code128Bars } from "@/lib/code128";

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

// รูปการ์ดหน้าหลัก + พื้นหลังหน้าซื้อตั๋ว (ไฟล์ใน public/img/)
const PAYCARD_IMG = "/img/paycard.jpg";
const PAYCARD2_IMG = "/img/paycard2.jpg"; // พื้นหลังหน้าซื้อตั๋ว

// สัดส่วนกรอบรูปตั๋ว = สัดส่วนรูปจริง (p1/p2 ประมาณ 715×349) ทุกใบใช้ค่าเดียวกัน จึงเท่ากัน
// ถ้าเปลี่ยนรูปใหม่ ให้แก้เป็น aspect-[กว้าง/สูง] ของรูปนั้น
const TICKET_IMG_ASPECT = "aspect-[715/349]";

// รหัสพนักงาน: ตัวเลขล้วน 7 หลัก (ต้องตรงกับ EMP_CODE_LENGTH ใน lib/tickets.ts)
const EMP_CODE_LENGTH = 7;

/* สีหลัก (ตามดีไซน์)
   เขียว #14402c · ไลม์ #d9f27a · เหลือง #ffcf5c · พื้นหลัง #f1f7e9 · กล่องเขียวอ่อน #e3ecd6 · midnight blue #0f1b4d · แดงเลือดหมู #6b1d24 */

type TicketId = "booth" | "lucky";

type TicketDef = {
  id: TicketId;
  title: string;
  sub: string; // ชื่ออังกฤษตัวเล็ก
  homeNote: string; // ข้อความในการ์ดหน้าหลัก
  homeImage?: string; // ถ้าใส่: หน้าหลัก/หน้าซื้อตั๋ว/หน้าตั๋วของฉัน แสดงรูปนี้เป็นส่วนบนของตั๋ว (ไฟล์ใน public/) ชื่อตั๋วจะอยู่เหนือกรอบ
  blurb: string; // คำอธิบายในหน้าเลือกตั๋ว
  price: number;
  layout: "banner" | "compact"; // รูปแบบการ์ดในหน้า "ตั๋วของฉัน"
  groupNote: string; // ข้อความในการ์ดหน้า "ตั๋วของฉัน"
  meta?: string; // บรรทัดรายละเอียด (แบบ banner)
  chips?: [string, string]; // ป้ายสถานะ (แบบ compact)
  showLabel: string; // ข้อความปุ่ม "แสดงตั๋ว"
  card: string; // สีการ์ด/ไอคอน
  fg: string; // สีตัวหนังสือบนการ์ด
  dash: string; // สีเส้นประ
  button: string; // สีปุ่ม
  soft: string; // สีอ่อนของป้ายสถานะ
};

const TICKETS: TicketDef[] = [
  {
    id: "booth",
    title: "ตั๋วเข้าซุ้ม",
    sub: "BOOTH PASS",
    homeNote: "เล่นเกมให้เต็มที่",
    homeImage: "/img/p1.png",
    blurb: "1 ใบ เล่นเกมได้ 1 ซุ้ม เลือกซุ้มได้ทั้งหน้างาน", // TODO: แก้ให้ตรงสิทธิ์จริง
    // TODO: 10 บาทเพื่อทดสอบ ก่อนขายจริงแก้ให้ตรงกับ TICKET_PRICES ใน lib/tickets.ts (ฝั่งเซิร์ฟเวอร์คิดเงินจากตัวนั้น)
    price: 10,
    layout: "banner",
    groupNote: "เลือกซุ้มที่ชอบ แล้วไปเล่นกัน!",
    meta: "1 ใบ / 1 ซุ้ม • ใช้ได้เฉพาะวันงาน",
    showLabel: "แสดงตั๋วเข้าซุ้ม",
    card: "bg-[#0f1b4d]",
    fg: "text-white",
    dash: "border-white/30",
    button: "bg-[#e50914] text-white",
    soft: "bg-[#eef9c8]",
  },
  {
    id: "lucky",
    title: "Lucky Draw",
    sub: "LUCKY DRAW TICKET",
    homeNote: "ลุ้นรางวัลสุดเซอร์ไพรส์",
    homeImage: "/img/p2.png",
    blurb: "1 ใบ = 1 สิทธิ์สุ่มของรางวัล ภายในงาน", // TODO: แก้ให้ตรงสิทธิ์จริง
    // TODO: 10 บาทเพื่อทดสอบ ก่อนขายจริงแก้ให้ตรงกับ TICKET_PRICES ใน lib/tickets.ts
    price: 10,
    layout: "compact",
    groupNote: "ลุ้นของรางวัล • 1 สิทธิ์",
    chips: ["รอสุ่มภายในงาน", "ยังไม่ได้ใช้สิทธิ์"],
    showLabel: "แสดงตั๋ว Lucky Draw",
    card: "bg-[#6b1d24]",
    fg: "text-white",
    dash: "border-white/30",
    button: "bg-[#6b1d24] text-white",
    soft: "bg-[#f3d9dc]",
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
  empCode?: string; // รหัสพนักงาน (ตั๋ว Lucky Draw)
  won?: boolean; // ตั๋วใบนี้ถูกรางวัลแล้ว
  wonAt?: string;
};

// empCode = รหัสพนักงานของบัญชี (null = บัญชีเก่าที่ยังไม่เคยกรอก ต้องกรอกในโปรไฟล์ก่อนซื้อ Lucky Draw)
type User = { id: string; username: string; name: string; phone: string; empCode: string | null };

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
  items?: { ticket: TicketId; qty: number }[]; // ตั๋วที่ซื้อในรายการนี้ (ประเภท + จำนวนใบ)
};

// ผลจาก GET /api/payments/[id]
type PayPoll = Payment & { orders?: Order[] };

const MAX_QTY = 20; // จำนวนสูงสุดต่อตั๋ว 1 ประเภท ต่อการซื้อ 1 ครั้ง (กันกดพลาด)
const CART_KEY = "payday-cart-v1";
const SLIP_POLL_MS = 5000; // เช็กสถานะรายการโอนทุกกี่มิลลิวินาที
const SCANNED_SHOW_MS = 3200; // ตั๋วที่เพิ่งถูกสแกน ค้างโชว์ตราประทับ "รับแล้ว" แล้วเฟดหายในหน้าต่างแสดงตั๋วกี่มิลลิวินาที (ต้องไม่น้อยกว่า 2.2s delay + 1s เฟด ใน CSS .pd-scan-out)
const seenKey = (userId: string) => `payday-won-seen-v1-${userId}`; // รหัสตั๋วที่ถูกรางวัลและผู้ใช้เห็นแล้ว

// ป้ายสถานะรายการโอนเงิน (ข้อความ + สี) ที่แสดงบนการ์ดในแท็บ "สถานะ"
const PAY_BADGE: Record<PayStatus, { label: string; cls: string }> = {
  awaiting_slip: { label: "รอส่งสลีป", cls: "bg-amber-100 text-amber-800" },
  reviewing: { label: "รออนุมัติ", cls: "bg-sky-100 text-sky-800" },
  rejected: { label: "ถูกปฏิเสธ", cls: "bg-red-100 text-red-700" },
  approved: { label: "อนุมัติแล้ว", cls: "bg-green-100 text-green-800" },
  expired: { label: "หมดเวลา", cls: "bg-gray-200 text-gray-600" },
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

const validEmp = (c: string) => new RegExp(`^\\d{${EMP_CODE_LENGTH}}$`).test(c);

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
const IconTrash = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M4 7h16" />
    <path d="M10 11v6M14 11v6" />
    <path d="M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12" />
    <path d="M9 7V4h6v3" />
  </Icon>
);

const iconOf = (id: TicketId, className?: string) =>
  id === "booth" ? <IconTicket className={className} /> : <IconGift className={className} />;

// บาร์โค้ด Code128 จริง (เจ้าหน้าที่ยิงด้วยกล้องที่หน้า /ticket ได้) วาดเป็น SVG สีตามตัวหนังสือของตั๋ว
// มีพื้นที่ว่างซ้ายขวาในตัว ต้องวางบนพื้นสีอ่อน (ตั๋วใช้พื้นขาว)
function Barcode({ code }: { code: string }) {
  let data: ReturnType<typeof code128Bars>;
  try {
    data = code128Bars(code);
  } catch {
    return null;
  }
  return (
    <svg
      viewBox={`0 0 ${data.total} 1`}
      preserveAspectRatio="none"
      shapeRendering="crispEdges"
      role="img"
      aria-label={`บาร์โค้ด ${code}`}
      className="block h-16 w-full"
    >
      {data.bars.map((b, i) => (
        <rect key={i} x={b.x} y={0} width={b.w} height={1} fill="currentColor" />
      ))}
    </svg>
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
  text = "text-neutral-900",
}: {
  top: ReactNode;
  bottom: ReactNode;
  className?: string;
  bg?: string; // สีพื้นตั๋ว
  dash?: string; // สีเส้นประ
  text?: string; // สีตัวหนังสือ
}) {
  return (
    <div className={`${text} drop-shadow-[0_2px_6px_rgba(20,64,44,0.14)] ${className}`}>
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

/* ---------- รูปตั๋ว: กรอบสัดส่วนเดียวกับรูปจริง ทุกใบเท่ากัน ไม่ครอป ---------- */
function TicketImage({ src, alt }: { src: string; alt: string }) {
  return (
    <div className={`flex w-full items-center justify-center ${TICKET_IMG_ASPECT}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="block h-full w-full object-contain" />
    </div>
  );
}

// ตำแหน่งประกายบนกรอบทอง (ตั๋วที่ถูกรางวัล)
const SPARKLES: { top: string; left: string; size: string; delay: string }[] = [
  { top: "2%", left: "6%", size: "h-4 w-4", delay: "0s" },
  { top: "6%", left: "48%", size: "h-3 w-3", delay: "0.5s" },
  { top: "3%", left: "90%", size: "h-5 w-5", delay: "1.1s" },
  { top: "48%", left: "1%", size: "h-3 w-3", delay: "0.8s" },
  { top: "52%", left: "95%", size: "h-4 w-4", delay: "0.3s" },
  { top: "92%", left: "10%", size: "h-5 w-5", delay: "1.4s" },
  { top: "94%", left: "52%", size: "h-3 w-3", delay: "0.2s" },
  { top: "90%", left: "88%", size: "h-4 w-4", delay: "0.9s" },
];

/* ---------- ตั๋ว 1 ใบ (ใช้ในหน้าซื้อสำเร็จ และตอนแสดงตั๋ว) ----------
   scanned = ตั๋วใบนี้เพิ่งถูกเจ้าหน้าที่สแกนรับแล้ว: ตั๋วเป็นสีเทา + ตราประทับ "รับแล้ว" เฉียงทับตั๋ว แล้วเฟดหายไปอย่างนุ่มนวล */
function TicketPass({ def, order, scanned = false }: { def: TicketDef; order: Order; scanned?: boolean }) {
  const pass = (
    <Perforated
      top={
        <div className="p-2">
          <div className={`flex items-center justify-between rounded-2xl px-4 py-3 ${def.card} ${def.fg}`}>
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
            {order.empCode && (
              <p className="mt-1 text-xs font-semibold text-neutral-600">
                รหัสพนักงาน <span className="font-mono font-bold text-neutral-900">{order.empCode}</span>
              </p>
            )}
          </div>
        </div>
      }
      bottom={
        def.id === "lucky" ? (
          // ตั๋ว Lucky Draw ไม่ใช้บาร์โค้ด: แสดงข้อความ + รหัสตั๋วเท่านั้น
          <div className="px-5 pb-5 pt-4 text-center">
            <p className="text-base font-extrabold tracking-wide">ตั๋วสุ่มรางวัล</p>
            <p className="mt-2 break-all font-mono text-xs font-bold tracking-wider">{order.code}</p>
          </div>
        ) : (
          <div className="px-2 pb-5 pt-4">
            <Barcode code={order.code} />
            <p className="mt-2 break-all text-center font-mono text-xs font-bold tracking-wider">{order.code}</p>
          </div>
        )
      }
    />
  );

  // ตั๋วถูกรางวัล: กรอบสีทองวิบวับ
  const shown = order.won ? (
    <div className="pd-gold-frame relative rounded-[2rem] p-2">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-[2rem]">
        {SPARKLES.map((s, i) => (
          <IconSpark key={i} className={`pd-twinkle absolute text-white ${s.size}`} />
        ))}
      </div>
      <p className="pb-2 text-center text-sm font-extrabold tracking-wide text-[#5a3b00]">
        ตั๋วใบนี้ถูกรางวัล! ยินดีด้วย
      </p>
      {pass}
    </div>
  ) : (
    pass
  );

  if (!scanned) return shown;

  // ตั๋วถูกสแกนแล้ว: ตัวตั๋วค่อย ๆ เป็นสีเทา แล้วมีตราประทับ "รับแล้ว" ตกลงมาทับเฉียง ๆ จากนั้นทั้งใบ (ตั๋ว + ตราประทับ) เฟดหายไปเบา ๆ
  return (
    <div className="pd-scan-out relative">
      <div className="pd-scanned">{shown}</div>
      <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <span className="pd-stamp rounded-2xl border-4 border-red-500 bg-black/40 px-6 py-2 text-4xl font-extrabold tracking-widest text-red-500 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
          รับแล้ว
        </span>
      </div>
      <span role="status" className="sr-only">
        ตั๋วใบนี้รับแล้ว
      </span>
    </div>
  );
}

/* ---------- ปุ่มเพิ่ม/ลดจำนวน ---------- */
function Stepper({
  value,
  max,
  name,
  onChange,
  onDark = false,
}: {
  value: number;
  max: number;
  name: string;
  onChange: (n: number) => void;
  onDark?: boolean; // ใช้บนพื้นหลังดำ/รูปภาพ: ตัวเลขสีขาว ปุ่มบวกสีไลม์
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        aria-label={`ลดจำนวน${name}`}
        onClick={() => onChange(value - 1)}
        disabled={value <= 0}
        className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-black shadow-[0_1px_4px_rgba(0,0,0,0.4)] transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <IconMinus className="h-5 w-5" />
      </button>
      <span aria-live="polite" className={`min-w-6 text-center text-lg font-semibold ${onDark ? "text-white" : ""}`}>
        {value}
      </span>
      <button
        type="button"
        aria-label={`เพิ่มจำนวน${name}`}
        onClick={() => onChange(value + 1)}
        disabled={value >= max}
        className={`flex h-10 w-10 items-center justify-center rounded-full transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 ${
          onDark ? "bg-white text-black" : "bg-[#e50914] text-white"
        }`}
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
    <ol className="flex items-center justify-center gap-4" aria-label="ขั้นตอนการซื้อ">
      {steps.map((s, i) => {
        const n = i + 1;
        const active = n === current;
        const done = n < current;
        return (
          <li key={s} className="flex items-center gap-1.5" aria-current={active ? "step" : undefined}>
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                active || done ? "bg-[#e50914] text-white" : "bg-white/15 text-white/60"
              }`}
            >
              {done ? <IconCheck className="h-3.5 w-3.5" /> : n}
            </span>
            <span className={`text-xs md:text-sm ${active ? "font-bold text-white" : "text-white/50"}`}>{s}</span>
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
          className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/10 text-white backdrop-blur-md"
        >
          <IconBack />
        </button>
      ) : (
        <span className="h-11 w-0" />
      )}
      <h1 className="text-xl font-semibold text-white md:text-2xl">{title}</h1>
    </div>
  );
}

function InfoBox({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-[#1f1f1f] p-4 text-white">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div>
        <p className="text-sm font-bold">{title}</p>
        <p className="mt-0.5 text-xs text-white/60">{text}</p>
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

// มือถือ: แถบล่างลอย ธีมเดียวกับแอป (พื้นดำ #1f1f1f ขอบบาง ปุ่มที่เลือกเป็นแดง #e50914) ซ่อนบนจอ md ขึ้นไป
// golden = มีตั๋วถูกรางวัลที่ผู้ใช้ยังไม่เคยเปิดดู: ปุ่ม "ตั๋วของฉัน" เป็นสีทองวิบวับ จนกว่าจะกดเข้าไปดู
function BottomNav({
  view,
  badges,
  golden,
  onGo,
}: {
  view: View;
  badges: Badges;
  golden: boolean;
  onGo: (v: View) => void;
}) {
  return (
    <nav
      aria-label="เมนูหลัก"
      className="fixed inset-x-4 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-40 md:hidden"
    >
      <div className="relative overflow-hidden rounded-full border border-white/10 bg-[#1f1f1f]/90 shadow-[0_10px_30px_rgba(0,0,0,0.6)] backdrop-blur-xl supports-[not(backdrop-filter:blur(1px))]:bg-[#1f1f1f]">
        <ul className="relative mx-auto grid max-w-md grid-cols-4 gap-1 p-1.5">
          {NAV.map((n) => {
            const active = view === n.id;
            const badge = badges[n.id] ?? 0;
            const gold = golden && n.id === "tickets" && !active;
            return (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => onGo(n.id)}
                  aria-label={gold ? `${n.label} (มีตั๋วที่ถูกรางวัล)` : n.label}
                  aria-current={active ? "page" : undefined}
                  className={`relative flex w-full flex-col items-center gap-0.5 rounded-full px-1 py-2 transition duration-300 active:scale-95 ${
                    active
                      ? "bg-[#e50914] text-white shadow-[0_4px_14px_rgba(229,9,20,0.45)]"
                      : gold
                        ? "pd-gold-frame text-[#5a3b00]"
                        : "text-white/60"
                  }`}
                >
                  <span className="relative">
                    {n.icon}
                    {badge > 0 && (
                      <span className="absolute -right-2.5 -top-1.5 min-w-4 rounded-full bg-white px-1 text-center text-[10px] font-bold leading-4 text-black shadow-[0_1px_4px_rgba(0,0,0,0.4)]">
                        {badge}
                      </span>
                    )}
                  </span>
                  <span className={`text-[11px] ${active || gold ? "font-bold" : "font-medium"}`}>{n.label}</span>
                  {gold && (
                    <>
                      <IconSpark className="pd-spark pointer-events-none absolute left-1 top-0.5 h-3 w-3 text-white" />
                      <IconSpark className="pd-spark pointer-events-none absolute bottom-1 right-1 h-2.5 w-2.5 text-white [animation-delay:0.7s]" />
                    </>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}

// คอมพิวเตอร์/แท็บเล็ต: แถบบน (แสดงตั้งแต่จอ md ขึ้นไป) พื้นดำเบลอ ปุ่มที่เลือกเป็นแดง
function TopNav({
  view,
  badges,
  golden,
  user,
  ready,
  onGo,
  onLogin,
}: {
  view: View;
  badges: Badges;
  golden: boolean;
  user: User | null;
  ready: boolean;
  onGo: (v: View) => void;
  onLogin: () => void;
}) {
  return (
    <header className="sticky top-0 z-40 hidden border-b border-white/10 bg-[#141414]/85 backdrop-blur-xl md:block">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-8 py-3">
        <button
          type="button"
          onClick={() => onGo("home")}
          aria-label="ไปหน้าหลัก"
          className="flex items-center gap-3 text-left"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e50914] text-white">
            <IconTicket />
          </span>
          <span>
            <span className="block text-xl font-bold lowercase leading-none">{EVENT.name}</span>
            <span className="mt-1 block text-[11px] text-white/60">{EVENT.tagline}</span>
          </span>
        </button>

        <nav aria-label="เมนูหลักบนคอมพิวเตอร์">
          <ul className="flex items-center gap-1 rounded-full border border-white/10 bg-[#1f1f1f] p-1">
            {NAV.filter((n) => n.id !== "profile").map((n) => {
              const active = view === n.id;
              const badge = badges[n.id] ?? 0;
              const gold = golden && n.id === "tickets" && !active;
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => onGo(n.id)}
                    aria-current={active ? "page" : undefined}
                    aria-label={gold ? `${n.label} (มีตั๋วที่ถูกรางวัล)` : undefined}
                    className={`relative flex items-center gap-2 rounded-full px-4 py-2 text-sm transition ${
                      active
                        ? "bg-[#e50914] font-bold text-white"
                        : gold
                          ? "pd-gold-frame font-bold text-[#5a3b00]"
                          : "font-medium text-white/70 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    {n.label}
                    {badge > 0 && (
                      <span className="min-w-5 rounded-full bg-white px-1.5 text-center text-[11px] font-bold leading-5 text-black">
                        {badge}
                      </span>
                    )}
                    {gold && (
                      <>
                        <IconSpark className="pd-spark pointer-events-none absolute -left-1 -top-1 h-3.5 w-3.5 text-white" />
                        <IconSpark className="pd-spark pointer-events-none absolute -bottom-1 -right-1 h-3 w-3 text-white [animation-delay:0.7s]" />
                      </>
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
              className={`flex items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-4 text-sm font-semibold transition ${
                view === "profile"
                  ? "border-[#e50914] bg-[#e50914] text-white"
                  : "border-white/10 bg-[#1f1f1f] text-white hover:bg-white/10"
              }`}
            >
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold uppercase ${
                  view === "profile" ? "bg-white text-[#e50914]" : "bg-[#e50914] text-white"
                }`}
              >
                {(user.name || user.username).charAt(0)}
              </span>
              <span className="max-w-[10rem] truncate">{user.name}</span>
            </button>
          )}
          {ready && !user && (
            <button
              type="button"
              onClick={onLogin}
              className="rounded-full bg-[#e50914] px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90"
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
   ติดขอบล่างจอ พื้นกระจกเบลอ
   มือถือ: aboveNav = ลอยเหนือแถบเมนูล่าง / คอมพิวเตอร์: ชิดขอบล่างเลย */
function CheckoutBar({
  children,
  aboveNav = false,
  compact = false,
}: {
  children: ReactNode;
  aboveNav?: boolean;
  compact?: boolean; // มือถือ: แถบเตี้ยลง (ยอด + ปุ่มอยู่แถวเดียว) จะได้ไม่บังตั๋ว
}) {
  return (
    <div
      className={`fixed z-40 border border-white/15 bg-black/55 shadow-[0_-8px_32px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.15)] backdrop-blur-2xl backdrop-saturate-150 ${
        aboveNav
          ? "inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] rounded-[2rem] md:inset-x-0 md:bottom-0 md:rounded-b-none md:rounded-t-3xl md:border-x-0 md:border-b-0"
          : "inset-x-0 bottom-0 rounded-t-3xl border-x-0 border-b-0 pb-[env(safe-area-inset-bottom)]"
      }`}
    >
      <div className="mx-auto w-full max-w-md px-5 py-4 md:max-w-6xl md:px-8 md:py-5">{children}</div>
    </div>
  );
}

/* ---------- โอนเงิน + ส่งสลีป ---------- */

// ย่อรูปใหญ่ก่อนส่ง (ส่งไวขึ้น + กันไฟล์ใหญ่เกินลิมิตของโฮสต์) รูปเล็กอยู่แล้วส่งตามเดิม
// 1600px ยังอ่าน QR บนสลีปได้ชัด
async function shrinkImage(file: File): Promise<File> {
  if (file.size <= 1024 * 1024) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")?.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.85));
    return blob && blob.size < file.size ? new File([blob], "slip.jpg", { type: "image/jpeg" }) : file;
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
  const [shrunk, setShrunk] = useState<File | null>(null); // รูปที่ย่อเตรียมไว้แล้ว (ย่อตั้งแต่เลือกรูป กดส่งแล้วไม่ต้องรอ)
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

  // พรีวิวรูปที่เลือก + ย่อรูปเตรียมไว้เบื้องหลังทันที
  useEffect(() => {
    setShrunk(null);
    if (!file) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    let cancelled = false;
    shrinkImage(file).then((f) => {
      if (!cancelled) setShrunk(f);
    });
    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
    };
  }, [file]);

  async function upload() {
    if (!file || busy) return;
    if (file.size > 25 * 1024 * 1024) return setErr("รูปใหญ่เกินไป เลือกรูปอื่น");
    setBusy(true);
    setErr("");
    try {
      const fd = new FormData();
      fd.append("slip", shrunk ?? (await shrinkImage(file)));
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

      {!pay && <p className="mt-6 text-sm text-white/60">{loadError || "กำลังโหลด..."}</p>}

      {open && (
        <div className="md:mt-6 md:grid md:grid-cols-2 md:items-start md:gap-6">
          {pay.status === "rejected" && (
            <div role="alert" className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 md:col-span-2 md:mt-0">
              <p className="text-sm font-bold text-red-700">สลีปไม่ผ่าน</p>
              <p className="mt-1 text-sm text-red-700">{pay.rejectReason ?? "กรุณาตรวจสอบแล้วส่งสลีปใหม่"}</p>
            </div>
          )}

          <div className="mt-6 rounded-3xl border border-white/10 bg-[#1f1f1f] p-5 text-center md:mt-0 md:p-6">
            <p className="text-xs text-white/50">โอนตามยอดนี้เป๊ะ ๆ</p>
            <p className="mt-1 text-4xl font-extrabold">{baht(pay.amount)}</p>

            <div className="mx-auto mt-4 flex aspect-square w-full max-w-[16rem] items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white p-2 md:max-w-[19rem]">
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

            <p className="mt-3 text-sm text-white/60">สแกนด้วยแอปธนาคาร (ยอดและรหัสอ้างอิงอยู่ใน QR แล้ว)</p>
            <p className="mt-1 text-xs text-white/50">
              รหัสอ้างอิง <span className="font-mono font-bold text-white">{pay.ref}</span>
            </p>
            {pay.qrUrl && (
              <a
                href={pay.qrUrl}
                download={`payday-${pay.ref}.png`}
                className="mt-3 inline-block rounded-full border border-white/40 px-4 py-2 text-xs font-semibold"
              >
                บันทึก QR ลงเครื่อง (สำหรับสแกนจากรูป)
              </a>
            )}
            <p className="mt-3 text-sm font-bold">
              {secsLeft > 0 ? `ส่งสลีปภายใน ${fmtCountdown(secsLeft)}` : "หมดเวลาแล้ว กำลังตรวจสอบ..."}
            </p>
          </div>

          <div className="mt-4 rounded-3xl border border-white/10 bg-[#1f1f1f] p-5 md:mt-0 md:p-6">
            <h2 className="text-base font-bold">ส่งสลีปโอนเงิน</h2>
            <p className="mt-1 text-xs text-white/50">
              ใช้สลีปจากแอปธนาคาร ต้องเห็น QR บนสลีปชัด ไม่ครอป ไม่ตัดขอบ สลีป 1 ใบใช้ได้ครั้งเดียว
            </p>

            <label className="mt-3 flex min-h-40 cursor-pointer items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-white/20 bg-[#2a2a2a] p-3 text-center text-sm font-semibold text-white/60 focus-within:ring-2 focus-within:ring-white md:min-h-56">
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
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#e50914] py-4 text-base font-bold text-white transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "กำลังส่งสลีป..." : "ส่งสลีป"}
              {!busy && <IconArrow className="h-5 w-5 text-white" />}
            </button>
          </div>
        </div>
      )}

      {pay?.status === "reviewing" && (
        <div className="mt-6 rounded-3xl border border-white/10 bg-[#1f1f1f] p-6 text-center md:mx-auto md:max-w-xl md:p-8">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-white text-black">
            <IconReceipt className="h-7 w-7" />
          </span>
          <h2 className="mt-4 text-xl font-bold">ส่งสลีปแล้ว รอตรวจสอบ</h2>
          <p className="mt-2 text-sm text-white/60">
            {baht(pay.amount)} · รหัส <span className="font-mono font-bold">{pay.ref}</span>
          </p>
          <p className="mt-2 text-sm text-white/60">
            เจ้าหน้าที่อนุมัติแล้วตั๋วจะขึ้นที่หน้า “ตั๋วของฉัน” ปิดหน้านี้ได้เลย ไม่ต้องรอ
          </p>
          <button
            type="button"
            onClick={onBack}
            className="mt-5 rounded-full bg-[#e50914] px-6 py-2.5 font-semibold text-white transition active:scale-95"
          >
            ไปหน้าตั๋วของฉัน
          </button>
        </div>
      )}

      {pay?.status === "expired" && (
        <div className="mt-6 rounded-3xl border border-white/10 bg-[#1f1f1f] p-6 text-center md:mx-auto md:max-w-xl md:p-8">
          <h2 className="text-xl font-bold">หมดเวลาแล้ว</h2>
          <p className="mt-2 text-sm text-white/60">
            ถ้าโอนเงินไปแล้ว ติดต่อเจ้าหน้าที่พร้อมรหัสอ้างอิง <span className="font-mono font-bold">{pay.ref}</span>
          </p>
          <button
            type="button"
            onClick={onBack}
            className="mt-5 rounded-full bg-[#e50914] px-6 py-2.5 font-semibold text-white transition active:scale-95"
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
  const [cancelTarget, setCancelTarget] = useState<Payment | null>(null); // รายการที่รอยืนยันการยกเลิก (popup)

  // เข้าสู่ระบบ / สมัครสมาชิก
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authUser, setAuthUser] = useState("");
  const [authPass, setAuthPass] = useState("");
  const [authName, setAuthName] = useState("");
  const [authPhone, setAuthPhone] = useState("");
  const [authEmp, setAuthEmp] = useState("");
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [afterAuth, setAfterAuth] = useState<View>("home");

  // บัญชี/โปรไฟล์
  const [accName, setAccName] = useState("");
  const [accPhone, setAccPhone] = useState("");
  const [accEmp, setAccEmp] = useState("");
  const [accError, setAccError] = useState("");
  const [accSaved, setAccSaved] = useState(false);
  const [returnToPay, setReturnToPay] = useState(false); // ถูกส่งมากรอกรหัสพนักงานจากการกดชำระเงิน: บันทึกแล้วกลับไปหน้าชำระเงิน

  // ตั๋วของฉัน
  const [tab, setTab] = useState<"ready" | "used" | "status">("ready");
  const [sheet, setSheet] = useState<TicketId | null>(null);
  const [seenWon, setSeenWon] = useState<string[]>([]); // ตั๋วถูกรางวัลที่ผู้ใช้เห็นแล้ว
  const [scanned, setScanned] = useState<string[]>([]); // รหัสตั๋วที่เพิ่งถูกสแกนขณะเปิดหน้าต่างแสดงตั๋วอยู่ (ค้างโชว์ตราประทับ "รับแล้ว" ชั่วคราว)
  const prevSheetRef = useRef<string[]>([]); // รหัสตั๋วที่ยังพร้อมใช้ในหน้าต่างแสดงตั๋วรอบก่อน ไว้เทียบหาใบที่เพิ่งถูกสแกน

  const userId = user?.id ?? null;

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

  // โหลดรายการตั๋วถูกรางวัลที่เคยเห็นแล้ว (แยกตามผู้ใช้)
  useEffect(() => {
    setSeenWon(userId ? load<string[]>(seenKey(userId), []) : []);
  }, [userId]);

  // เข้าหน้า "ตั๋วของฉัน" = เห็นตั๋วที่ถูกรางวัลแล้ว: ปุ่มเมนูกลับเป็นปกติ
  useEffect(() => {
    if (view !== "tickets" || !userId) return;
    const won = orders.filter((o) => o.won).map((o) => o.code);
    if (won.length === 0) return;
    setSeenWon((prev) => {
      if (won.every((c) => prev.includes(c))) return prev;
      const next = Array.from(new Set([...prev, ...won]));
      save(seenKey(userId), next);
      return next;
    });
  }, [view, orders, userId]);

  // กด Esc ปิดหน้าต่างแสดงตั๋ว (คอมพิวเตอร์)
  useEffect(() => {
    if (!sheet) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSheet(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheet]);

  // กด Esc ปิด popup ยืนยันการยกเลิกรายการ
  useEffect(() => {
    if (!cancelTarget) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCancelTarget(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cancelTarget]);

  // โหลดตั๋วใหม่ทุก 10 วิ ตลอดที่ login อยู่ (เข้าหน้า "ตั๋วของฉัน" โหลดทันที)
  // (ตั๋วถูกออกตอน admin อนุมัติสลีป ผู้ซื้ออาจปิดหน้าโอนเงินไปแล้ว ต้องดึงมาแสดง
  //  และสถานะถูกรางวัลก็มาทางนี้ด้วย ปุ่มเมนูสีทองจะขึ้นแม้อยู่หน้าอื่น)
  // ตอนเปิดหน้าต่างแสดงตั๋วอยู่ = ใกล้ถูกเจ้าหน้าที่ยิงที่หน้างาน: โหลดทุก 3 วิ
  // ตั๋วที่ถูกยิงแล้วจะขึ้นตราประทับ "รับแล้ว" ค้างไว้แล้วเฟดหายไป (SCANNED_SHOW_MS) แล้วย้ายไปแท็บ "ใช้แล้ว" (ขึ้น "รับแล้ว")
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const loadTickets = async () => {
      const r = await api<{ orders: Order[]; pending?: Payment[] }>("/api/orders");
      if (r.ok && !cancelled) {
        setOrders(r.data.orders);
        setPending(r.data.pending ?? []);
      }
    };
    if (view === "tickets") loadTickets();
    const t = setInterval(loadTickets, sheet ? 3000 : 10000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [view, user, sheet]);

  const defOf = (id: TicketId) => TICKETS.find((t) => t.id === id)!;
  const cartLines = TICKETS.flatMap((t) => {
    const q = cart[t.id] ?? 0;
    return q > 0 ? [{ def: t, qty: q }] : [];
  });
  const cartCount = cartLines.reduce((s, l) => s + l.qty, 0);
  const cartTotal = cartLines.reduce((s, l) => s + l.qty * l.def.price, 0);
  const cartHasLucky = cartLines.some((l) => l.def.id === "lucky");

  const readyOrders = orders.filter((o) => !o.used);
  const usedOrders = orders
    .filter((o) => o.used)
    .sort((a, b) => (b.usedAt ?? "").localeCompare(a.usedAt ?? ""));

  // มีตั๋วถูกรางวัลที่ผู้ใช้ยังไม่เคยเปิดดู
  const hasNewWin = orders.some((o) => o.won && !seenWon.includes(o.code));

  function go(v: View) {
    setView(v);
    setPayError("");
    if (v !== "profile") setReturnToPay(false);
  }

  function applyUser(u: User) {
    setUser(u);
    setAccName(u.name);
    setAccPhone(u.phone);
    setAccEmp(u.empCode ?? "");
  }

  // ไปหน้า login แล้วเมื่อสำเร็จให้เด้งกลับมาหน้าที่ต้องการ
  function needLogin(next: View) {
    setAfterAuth(next);
    setAuthError("");
    setAuthMode("login");
    setView("auth");
  }

  // บัญชีเก่ายังไม่มีรหัสพนักงาน: พาไปกรอกในโปรไฟล์ก่อนซื้อ Lucky Draw
  function needEmpCode() {
    setReturnToPay(true);
    setAccError("");
    setAccSaved(false);
    go("profile");
  }

  async function submitAuth() {
    const username = authUser.trim();
    if (authMode === "register") {
      if (authName.trim().length < 2) return setAuthError("กรอกชื่อ-นามสกุลให้ครบ");
      if (!validPhone(authPhone.replace(/\D/g, ""))) return setAuthError("เบอร์โทรต้องมี 10 หลัก ขึ้นต้นด้วย 0");
      if (!validEmp(authEmp.replace(/\D/g, ""))) return setAuthError(`รหัสพนักงานต้องเป็นตัวเลข ${EMP_CODE_LENGTH} หลัก`);
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
        : { username, password: authPass, name: authName, phone: authPhone, empCode: authEmp.replace(/\D/g, "") },
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
    setAuthEmp("");
    setAuthUser("");
    go(afterAuth);
  }

  async function logout() {
    await api("/api/auth/logout", "POST");
    setUser(null);
    setOrders([]);
    setPaymentId(null);
    setPending([]);
    setCancelTarget(null);
    setAccName("");
    setAccPhone("");
    setAccEmp("");
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

  // กดตั๋วจากการ์ดหน้าหลัก: ไปหน้าเลือกตั๋วเฉย ๆ (ไม่เพิ่มจำนวนให้ ผู้ใช้กด + เองในหน้าซื้อตั๋ว)
  function pick() {
    go("buy");
  }

  function toPay() {
    if (cartCount === 0) return;
    if (!user) return needLogin("pay"); // ซื้อตั๋วต้อง login ก่อน
    if (cartHasLucky && !user.empCode) return needEmpCode(); // ซื้อ Lucky Draw ต้องมีรหัสพนักงานในบัญชี
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
    if (cartHasLucky && !user.empCode) return needEmpCode();
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
    // รหัสพนักงานเซิร์ฟเวอร์ดึงจากบัญชีเอง ตั๋วถูกสร้างใน MongoDB หลัง admin อนุมัติสลีปเท่านั้น
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

  // ออกจากหน้าโอนเงิน: รายการยังค้างอยู่ ไปดู/ส่งสลีปต่อได้ที่แท็บ "สถานะ" ใน "ตั๋วของฉัน"
  function leaveQr() {
    setPaymentId(null);
    setTab("status");
    go("tickets");
  }

  // กดไอคอนถังขยะแล้วยืนยันใน popup: ยกเลิกรายการที่ยังไม่ส่งสลีป (เซิร์ฟเวอร์ตรวจสถานะซ้ำอีกที)
  async function cancelPayment(id: string) {
    if (cancelingId) return;
    setCancelingId(id);
    const r = await api(`/api/payments/${id}`, "DELETE");
    setCancelingId(null);
    setCancelTarget(null);
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

  async function saveProfile() {
    const cleanPhone = accPhone.replace(/\D/g, "");
    const cleanEmp = accEmp.replace(/\D/g, "");
    setAccSaved(false);
    if (accName.trim().length < 2) {
      setAccError("กรอกชื่อ-นามสกุลให้ครบ");
      return;
    }
    if (!validPhone(cleanPhone)) {
      setAccError("เบอร์โทรต้องมี 10 หลัก ขึ้นต้นด้วย 0");
      return;
    }
    // รหัสพนักงานตั้งได้ครั้งเดียว (เฉพาะบัญชีที่ยังไม่มีรหัส) ตั้งแล้วแก้ไม่ได้
    const settingEmp = !user?.empCode && cleanEmp.length > 0;
    if (settingEmp && !validEmp(cleanEmp)) {
      setAccError(`รหัสพนักงานต้องเป็นตัวเลข ${EMP_CODE_LENGTH} หลัก`);
      return;
    }
    if (returnToPay && !user?.empCode && !settingEmp) {
      setAccError(`กรอกรหัสพนักงาน ${EMP_CODE_LENGTH} หลักก่อนซื้อ Lucky Draw`);
      return;
    }
    const r = await api<{ user: User }>("/api/auth/me", "PATCH", {
      name: accName.trim(),
      phone: cleanPhone,
      ...(settingEmp ? { empCode: cleanEmp } : {}),
    });
    if (!r.ok) {
      setAccError(r.error);
      return;
    }
    applyUser(r.data.user);
    setAccError("");
    setAccSaved(true);
    // มากรอกรหัสพนักงานจากการกดชำระเงิน: ได้รหัสแล้วกลับไปหน้าชำระเงินต่อ
    if (returnToPay && r.data.user.empCode && cartCount > 0) {
      setReturnToPay(false);
      setPayName(r.data.user.name);
      setPayPhone(r.data.user.phone);
      go("pay");
    }
  }

  const badges: Badges = { tickets: readyOrders.length };
  const showNav =
    view === "home" || view === "buy" || view === "tickets" || view === "profile" || view === "auth";
  const navView: View =
    view === "pay" || view === "qr" || view === "done" ? "buy" : view === "auth" ? "profile" : view;

  const inputCls =
    "mt-1 w-full rounded-xl border border-white/15 bg-[#2a2a2a] px-4 py-3 text-base text-white outline-none focus:border-white/60 focus:ring-2 focus:ring-white/20";

  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(EVENT.place)}`;

  const sheetDef = sheet ? defOf(sheet) : null;
  // ตั๋วที่พร้อมใช้ + ตั๋วที่เพิ่งถูกสแกน (ค้างโชว์ตราประทับชั่วคราว) ตั๋วที่ถูกรางวัลขึ้นก่อน
  const sheetOrders = sheet
    ? orders
        .filter((o) => o.ticket === sheet && (!o.used || scanned.includes(o.code)))
        .sort((a, b) => Number(b.won === true) - Number(a.won === true))
    : [];
  const sheetReadyCount = sheetOrders.filter((o) => !o.used).length;

  // เทียบรอบก่อน: ตั๋วที่หายจาก "พร้อมใช้" เพราะถูกสแกน (used) → ค้างโชว์ตราประทับแล้วเฟดหาย SCANNED_SHOW_MS
  // ตั๋วในหน้าต่างหมดแล้ว และไม่มีใบที่กำลังโชว์ตราประทับ = ปิดหน้าต่างเอง
  useEffect(() => {
    if (!sheet) {
      prevSheetRef.current = [];
      setScanned((prev) => (prev.length ? [] : prev));
      return;
    }
    const readyCodes = orders.filter((o) => o.ticket === sheet && !o.used).map((o) => o.code);
    const newlyUsed = prevSheetRef.current.filter(
      (c) => !readyCodes.includes(c) && orders.some((o) => o.code === c && o.used),
    );
    prevSheetRef.current = readyCodes;

    if (newlyUsed.length > 0) {
      setScanned((prev) => Array.from(new Set([...prev, ...newlyUsed])));
      setTimeout(() => {
        setScanned((prev) => prev.filter((c) => !newlyUsed.includes(c)));
      }, SCANNED_SHOW_MS);
      return;
    }

    if (readyCodes.length === 0 && scanned.length === 0) setSheet(null);
  }, [sheet, orders, scanned]);

  // ระยะเว้นด้านล่างของหน้า: หน้าซื้อ/ชำระเงินมีแถบสรุปยอดติดขอบล่าง ต้องเว้นที่ให้ทั้งมือถือและคอมพิวเตอร์
  const mainPad =
    view === "buy" || view === "pay"
      ? "pb-64 md:pb-48"
      : showNav
        ? "pb-28 md:pb-16"
        : view === "done" || view === "qr"
          ? "pb-10 md:pb-16"
          : "pb-64 md:pb-16";

  return (
    <div
      className={`min-h-screen overflow-x-clip bg-[#141414] text-white [color-scheme:dark] [&_button:disabled]:cursor-not-allowed [&_button:not(:disabled)]:cursor-pointer ${appFont.className}`}
    >
      {/* แอนิเมชันกรอบทองวิบวับ (ตั๋วที่ถูกรางวัล + ปุ่มเมนู "ตั๋วของฉัน") และเอฟเฟคตั๋วถูกสแกน (สีเทา + ตราประทับ "รับแล้ว" + เฟดหาย) */}
      <style>{`
        @keyframes pdGold {
          0% { background-position: 0% 50%; }
          100% { background-position: 200% 50%; }
        }
        @keyframes pdGlow {
          0%, 100% { box-shadow: 0 0 16px 2px rgba(255, 200, 40, 0.55), 0 0 36px 6px rgba(255, 170, 0, 0.3); }
          50% { box-shadow: 0 0 28px 6px rgba(255, 228, 100, 0.95), 0 0 64px 14px rgba(255, 190, 0, 0.55); }
        }
        @keyframes pdTwinkle {
          0%, 100% { opacity: 0; transform: scale(0.3) rotate(0deg); }
          50% { opacity: 1; transform: scale(1.15) rotate(25deg); }
        }
        @keyframes pdScanGray {
          from { filter: none; opacity: 1; }
          to { filter: grayscale(1) brightness(0.8); opacity: 0.75; }
        }
        @keyframes pdStamp {
          0% { opacity: 0; transform: rotate(-14deg) scale(2.6); }
          60% { opacity: 1; transform: rotate(-14deg) scale(0.92); }
          100% { opacity: 1; transform: rotate(-14deg) scale(1); }
        }
        @keyframes pdFadeOut {
          from { opacity: 1; transform: translateY(0) scale(1); }
          to { opacity: 0; transform: translateY(10px) scale(0.97); }
        }
        .pd-gold-frame {
          background: linear-gradient(110deg, #b8860b, #ffe27a, #fff6c9, #ffd54a, #b8860b, #ffe27a, #b8860b);
          background-size: 200% 100%;
          animation: pdGold 2.2s linear infinite, pdGlow 1.5s ease-in-out infinite;
        }
        .pd-twinkle { animation: pdTwinkle 1.6s ease-in-out infinite; }
        .pd-spark { animation: pdTwinkle 1.6s ease-in-out infinite; }
        .pd-twinkle:nth-child(1) { top: 2%; left: 6%; width: 1rem; height: 1rem; animation-delay: 0s; }
        .pd-twinkle:nth-child(2) { top: 5%; left: 48%; width: 0.75rem; height: 0.75rem; animation-delay: 0.5s; }
        .pd-twinkle:nth-child(3) { top: 3%; left: 90%; width: 1.25rem; height: 1.25rem; animation-delay: 1.1s; }
        .pd-twinkle:nth-child(4) { top: 48%; left: 1%; width: 0.75rem; height: 0.75rem; animation-delay: 0.8s; }
        .pd-twinkle:nth-child(5) { top: 52%; left: 94%; width: 1rem; height: 1rem; animation-delay: 0.3s; }
        .pd-twinkle:nth-child(6) { top: 92%; left: 9%; width: 1.25rem; height: 1.25rem; animation-delay: 1.4s; }
        .pd-twinkle:nth-child(7) { top: 94%; left: 52%; width: 0.75rem; height: 0.75rem; animation-delay: 0.2s; }
        .pd-twinkle:nth-child(8) { top: 90%; left: 88%; width: 1rem; height: 1rem; animation-delay: 0.9s; }
        .pd-scanned { animation: pdScanGray 0.5s ease-out forwards; }
        .pd-scanned .pd-gold-frame, .pd-scanned .pd-twinkle { animation: none; }
        .pd-stamp { transform: rotate(-14deg); animation: pdStamp 0.5s cubic-bezier(0.2, 0.8, 0.3, 1.2) 0.15s both; }
        .pd-scan-out { animation: pdFadeOut 1s ease-in 2.2s forwards; }
        @media (prefers-reduced-motion: reduce) {
          .pd-gold-frame, .pd-twinkle, .pd-spark { animation: none; }
          .pd-twinkle, .pd-spark { opacity: 1; }
          .pd-scanned { animation: none; filter: grayscale(1) brightness(0.8); opacity: 0.75; }
          .pd-stamp { animation: none; }
          .pd-scan-out { animation: none; }
        }
      `}</style>

      {/* พื้นหลังหน้าซื้อตั๋ว: รูปอยู่ด้านบน ติดจอ ไม่เลื่อนตาม ด้านล่างไล่เป็นสีเข้มมาชนรูป */}
      {view === "buy" && (
        <div aria-hidden className="pointer-events-none fixed inset-0 z-0 bg-[#141414]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={PAYCARD2_IMG} alt="" className="h-[60vh] w-full object-cover object-top" />
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(to bottom, rgba(20,20,20,0) 0%, rgba(20,20,20,0.15) 20%, rgba(20,20,20,0.75) 45%, #141414 62%)",
            }}
          />
        </div>
      )}

      {/* แถบเมนูบน (เฉพาะแท็บเล็ต/คอมพิวเตอร์) */}
      <TopNav
        view={navView}
        badges={badges}
        golden={hasNewWin}
        user={user}
        ready={ready}
        onGo={go}
        onLogin={() => needLogin("home")}
      />

      <main className={`relative z-10 mx-auto w-full max-w-md px-5 pt-6 md:max-w-6xl md:px-8 md:pt-8 ${mainPad}`}>
        {/* ===== หน้าหลัก ===== */}
        {view === "home" && (
          <>
            {/* มือถือ: เว้นด้านบนไว้ให้แถบหัว (โลโก้ + ปุ่มเข้าสู่ระบบ) อยู่บนพื้นดำ แล้วรูปใหญ่อยู่ต่ำลงมา */}
            <section className="relative -mt-6 ml-[calc(50%-50vw)] w-screen pt-[5.5rem] md:-mt-8 md:pt-6">
              <header className="absolute inset-x-0 top-0 flex items-center justify-between px-5 pt-6 md:hidden">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#e50914] text-white">
                    <IconTicket />
                  </span>
                  <div>
                    <h1 className="text-2xl font-bold lowercase leading-none">{EVENT.name}</h1>
                    <p className="mt-1 text-[11px] text-white/60">{EVENT.tagline}</p>
                  </div>
                </div>
                {user ? (
                  <button
                    type="button"
                    onClick={() => go("profile")}
                    aria-label="โปรไฟล์"
                    className="flex h-11 w-11 items-center justify-center rounded-full bg-[#e50914] text-base font-bold uppercase text-white ring-2 ring-white/20 transition active:scale-95"
                  >
                    {(user.name || user.username).charAt(0)}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => needLogin("home")}
                    className="rounded-full bg-[#e50914] px-4 py-2.5 text-sm font-bold text-white transition active:scale-95"
                  >
                    เข้าสู่ระบบ
                  </button>
                )}
              </header>

              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={PAYCARD_IMG}
                  alt={`${EVENT.name} ${EVENT.tagline}`}
                  className="block h-auto min-h-[15rem] w-full object-cover object-center md:h-[18rem] lg:h-[22rem]"
                />
                {/* ไล่สีเข้มจากด้านล่างขึ้นบน กลืนกับพื้นหลังเว็บ (เริ่มไล่ต่ำลง ให้เห็นรูปมากขึ้น) */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0"
                  style={{
                    background:
                      "linear-gradient(to top, #141414 0%, rgba(20,20,20,0.6) 14%, rgba(20,20,20,0) 45%)",
                  }}
                />
                {/* ขอบบนของรูปกลืนกับพื้นดำ */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-[#141414] to-transparent"
                />
              </div>
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
              <p className="mt-1 text-sm text-white/60 md:text-base">เลือกตั๋วที่ใช่ แล้วไปสนุกกันเลย</p>
              <div className="mt-4 grid grid-cols-2 gap-3 md:mt-6 md:gap-6">
                {TICKETS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={pick}
                    aria-label={`${t.title} ${baht(t.price)} ต่อใบ`}
                    className="block text-left transition active:scale-[0.98] md:hover:-translate-y-0.5"
                  >
                    {/* ชื่อตั๋ว (ตั๋วที่มีรูป): อยู่เหนือกรอบ */}
                    {t.homeImage && (
                      <p className="px-1 pb-2 text-lg font-bold text-white md:pb-3 md:text-2xl">{t.title}</p>
                    )}
                    <Perforated
                      bg={t.card}
                      text={t.fg}
                      dash={t.dash}
                      top={
                        t.homeImage ? (
                          <TicketImage src={t.homeImage} alt={`${t.title} ${baht(t.price)} ต่อใบ`} />
                        ) : (
                          <div className="px-4 pb-3 pt-4 md:px-6 md:pb-4 md:pt-6">
                            {iconOf(t.id, "h-6 w-6 md:h-8 md:w-8")}
                            <p className="mt-2 text-lg font-bold leading-tight md:text-2xl">{t.title}</p>
                            <p className="mt-1 text-xs md:text-sm">{t.homeNote}</p>
                          </div>
                        )
                      }
                      bottom={
                        <div className="flex w-full items-end justify-between px-4 pb-4 pt-3 md:px-6 md:pb-6 md:pt-4">
                          <p className="text-3xl font-extrabold md:text-4xl">
                            {baht(t.price)}
                            <span className="text-xs font-medium"> / ใบ</span>
                          </p>
                          <span
                            className={`flex h-9 w-9 items-center justify-center rounded-full md:h-11 md:w-11 ${
                              t.homeImage ? "bg-white text-black" : "bg-[#e50914] text-white"
                            }`}
                          >
                            <IconArrow className="h-5 w-5" />
                          </span>
                        </div>
                      }
                    />
                  </button>
                ))}
              </div>

              <div className="mt-3 flex items-center gap-3 rounded-2xl bg-[#1f1f1f] p-4 md:mt-6 md:p-5">
                <IconSpark className="h-7 w-7 shrink-0 text-[#2f8f5b]" />
                <div>
                  <p className="text-sm font-bold md:text-base">ความโชคดีอาจเป็นของคุณ!</p>
                  <p className="mt-0.5 text-xs text-white/60 md:text-sm">ซื้อ Lucky Draw แล้วรอลุ้นพร้อมกัน</p>
                </div>
              </div>
            </section>
          </>
        )}

        {/* ===== เลือกตั๋ว (ขั้นที่ 1) ===== */}
        {view === "buy" && (
          <section aria-label="เลือกตั๋ว" className="md:mx-auto md:max-w-5xl">
            <SubHeader title="เลือกตั๋วของคุณ" onBack={() => go("home")} />
            <div className="mt-6">
              <Steps current={1} />
            </div>

            {/* มือถือ: เรียงลง / คอมพิวเตอร์: 2 ตั๋วเรียงซ้ายขวา */}
            <div className="mt-8 flex flex-col gap-4 md:mt-10 md:grid md:grid-cols-2 md:items-start md:gap-6">
              {TICKETS.map((t) => {
                const q = cart[t.id] ?? 0;

                // ส่วนบน: ตั๋วที่มีรูปใช้รูปเดียวกับหน้าหลัก (ชื่อตั๋วอยู่เหนือกรอบ) / ตั๋วอื่นใช้การ์ดข้อความ
                // ส่วนล่าง (หลังรอยประ): ราคา + ปุ่ม + - แยกจากตัวตั๋วเหมือนกันทุกใบ
                return (
                  <div key={t.id}>
                    {t.homeImage && <p className="px-1 pb-2 text-lg font-bold text-white">{t.title}</p>}
                    <Perforated
                      bg={t.card}
                      text={t.fg}
                      dash={t.dash}
                      top={
                        t.homeImage ? (
                          <TicketImage src={t.homeImage} alt={t.title} />
                        ) : (
                          <div className="p-4">
                            <div className="flex items-center gap-3">
                              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/50">
                                {iconOf(t.id, "h-6 w-6")}
                              </span>
                              <div>
                                <p className="text-lg font-bold leading-tight">{t.title}</p>
                                <p className="text-[10px] font-semibold tracking-widest opacity-70">{t.sub}</p>
                              </div>
                            </div>
                            <p className="mt-4 text-sm opacity-80">{t.blurb}</p>
                          </div>
                        )
                      }
                      bottom={
                        <div className="flex items-center justify-between gap-2 px-4 pb-4 pt-3">
                          <p className="text-3xl font-extrabold">
                            {baht(t.price)}
                            <span className="text-xs font-medium opacity-70"> / ใบ</span>
                          </p>
                          <Stepper
                            value={q}
                            max={MAX_QTY}
                            name={t.title}
                            onChange={(n) => setQty(t.id, n)}
                            onDark={!!t.homeImage}
                          />
                        </div>
                      }
                    />
                  </div>
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

            {/* แถบสรุปยอดติดขอบล่าง (มือถือ: เหนือแถบเมนู / คอมพิวเตอร์: ชิดล่างสุด) พื้นกระจกเบลอ */}
            <CheckoutBar aboveNav>
              <div className="md:flex md:items-center md:justify-between md:gap-8">
                <div className="flex items-end justify-between md:items-center md:gap-8">
                  <div>
                    <p className="text-xs text-white/70">ทั้งหมด {cartCount} ใบ</p>
                    <p className="text-sm font-bold">ยอดรวม</p>
                  </div>
                  <p className="text-4xl font-extrabold">{baht(cartTotal)}</p>
                </div>
                <button
                  type="button"
                  onClick={toPay}
                  disabled={cartCount === 0}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#e50914] py-4 text-base font-bold text-white transition active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-white/15 disabled:text-white/50 md:mt-0 md:w-80 md:shrink-0"
                >
                  {user ? "ชำระเงิน" : "เข้าสู่ระบบเพื่อชำระเงิน"}
                  <IconArrow className="h-5 w-5 text-white" />
                </button>
              </div>
            </CheckoutBar>
          </section>
        )}

        {/* ===== ชำระเงิน (ขั้นที่ 2): สรุปรายการ ===== */}
        {view === "pay" && (
          <section aria-label="ชำระเงิน" className="md:mx-auto md:max-w-3xl">
            <SubHeader title="ชำระเงิน" onBack={() => go("buy")} />
            <div className="mt-6">
              <Steps current={2} />
            </div>

            <div className="mt-6 rounded-3xl border border-white/10 bg-[#1f1f1f] p-4 md:p-6">
              <h2 className="text-base font-bold">สรุปรายการ</h2>
              <p className="mt-0.5 text-xs text-white/50">
                {EVENT.name} · {EVENT.date}
              </p>
              <ul className="mt-3 divide-y divide-white/10">
                {cartLines.map(({ def, qty: q }) => (
                  <li key={def.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="flex items-center gap-3">
                      {def.homeImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={def.homeImage}
                          alt={def.title}
                          className="h-12 w-auto shrink-0 object-contain md:h-14"
                        />
                      ) : (
                        <span
                          className={`flex h-10 w-10 items-center justify-center rounded-xl ${def.card} ${def.fg}`}
                        >
                          {iconOf(def.id, "h-5 w-5")}
                        </span>
                      )}
                      <div>
                        <p className="text-sm font-bold">{def.title}</p>
                        <p className="text-xs text-white/50">
                          {baht(def.price)} × {q}
                        </p>
                      </div>
                    </div>
                    <p className="text-base font-bold">{baht(def.price * q)}</p>
                  </li>
                ))}
              </ul>
              {/* รหัสพนักงานมาจากบัญชี (ตั้งตอนสมัคร) ไม่ต้องกรอกซ้ำ */}
              {cartHasLucky && user?.empCode && (
                <p className="mt-3 border-t border-white/10 pt-3 text-xs text-white/60">
                  รหัสพนักงานสำหรับลุ้น Lucky Draw:{" "}
                  <span className="font-mono font-bold text-white">{user.empCode}</span>
                </p>
              )}
            </div>

            <div className="mt-4 rounded-3xl border border-white/10 bg-[#1f1f1f] p-4 md:p-6">
              <h2 className="text-base font-bold">วิธีชำระเงิน</h2>
              <div className="mt-3 flex items-center justify-between rounded-2xl border-2 border-white/40 bg-[#2a2a2a] px-4 py-3">
                <span className="text-sm font-bold">PromptPay (สแกน QR)</span>
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#e50914] text-white">
                  <IconCheck className="h-3.5 w-3.5" />
                </span>
              </div>
              <p className="mt-2 text-xs text-white/50">
                กดยืนยันแล้วระบบจะสร้าง QR ให้สแกน โอนแล้วส่งสลีปภายใน 60 นาที รอเจ้าหน้าที่ตรวจสอบ
              </p>
            </div>

            <CheckoutBar>
              {payError && (
                <p role="alert" className="mb-2 text-sm font-medium text-red-600">
                  {payError}
                </p>
              )}
              <div className="md:flex md:items-center md:justify-between md:gap-8">
                <div className="flex items-end justify-between md:items-center md:gap-8">
                  <div>
                    <p className="text-xs text-white/50">ทั้งหมด {cartCount} ใบ</p>
                    <p className="text-sm font-bold">ยอดรวม</p>
                  </div>
                  <p className="text-4xl font-extrabold">{baht(cartTotal)}</p>
                </div>
                <button
                  type="button"
                  onClick={confirmPay}
                  disabled={payBusy}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#e50914] py-4 text-base font-bold text-white transition active:scale-[0.99] disabled:opacity-60 md:mt-0 md:w-80 md:shrink-0"
                >
                  {payBusy ? "กำลังสร้าง QR..." : "สร้าง QR เพื่อชำระเงิน"}
                  <IconArrow className="h-5 w-5 text-white" />
                </button>
              </div>
            </CheckoutBar>
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
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-black">
                <IconCheck className="h-9 w-9" />
              </span>
              <h1 className="mt-4 text-2xl font-bold md:text-3xl">ได้รับตั๋วแล้ว!</h1>
              <p className="mt-1 text-sm text-white/60 md:text-base">
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
                className="flex-1 rounded-2xl border border-white/40 px-5 py-3.5 font-semibold transition active:scale-[0.99]"
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
                className="flex-1 rounded-2xl bg-[#e50914] px-5 py-3.5 font-semibold text-white transition active:scale-[0.99]"
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
                <p className="mt-1 text-sm text-white/60">ความสนุกรอบนี้ พร้อมแล้ว!</p>
              </div>
              <button
                type="button"
                onClick={() => setTab("used")}
                aria-label="ดูตั๋วที่ใช้แล้ว"
                className="flex h-11 w-11 items-center justify-center rounded-full bg-[#1f1f1f] shadow-[0_1px_4px_rgba(20,64,44,0.15)]"
              >
                <IconReceipt />
              </button>
            </header>

            <div
              role="tablist"
              aria-label="สถานะตั๋ว"
              className="mt-5 grid grid-cols-3 rounded-2xl bg-[#2a2a2a] p-1 md:max-w-lg"
            >
              {(
                [
                  ["ready", `พร้อมใช้ (${readyOrders.length})`],
                  ["status", `สถานะ (${pending.length})`],
                  ["used", `ใช้แล้ว (${usedOrders.length})`],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  onClick={() => setTab(id)}
                  className={`rounded-xl px-1 py-2.5 text-sm font-bold transition ${
                    tab === id ? "bg-[#e50914] text-white" : "text-white/60"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {user && tab === "status" && (
              <>
                {pending.length === 0 ? (
                  <div className="mt-6 rounded-3xl border border-dashed border-white/20 bg-white/5 p-8 text-center">
                    <p className="text-white/60">ไม่มีรายการที่รอดำเนินการ</p>
                  </div>
                ) : (
                  <div className="mt-5 flex flex-col gap-3 md:grid md:grid-cols-2 md:items-start md:gap-4">
                    {pending.map((p) => {
                      const badge = PAY_BADGE[p.status];
                      const openPayment = () => {
                        setPaymentId(p.id);
                        go("qr");
                      };

                      // กดที่การ์ด = เปิดหน้าโอนเงิน/ส่งสลีป/ดูสถานะ (หน้าเดียวกับเดิม)
                      return (
                        <div
                          key={p.id}
                          role="button"
                          tabIndex={0}
                          aria-label={`ดูรายการ ${p.ref} สถานะ ${badge.label}`}
                          onClick={openPayment}
                          onKeyDown={(e) => {
                            if (e.target !== e.currentTarget) return;
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              openPayment();
                            }
                          }}
                          className="cursor-pointer rounded-2xl border border-dashed border-white/25 bg-[#1f1f1f] p-4 transition active:scale-[0.99] md:hover:border-white/40"
                        >
                          {/* ตั๋วที่ซื้อในรายการนี้: รูป + ชื่อ + จำนวนใบ */}
                          {p.items && p.items.length > 0 && (
                            <ul className="mb-3 flex flex-col gap-2 border-b border-white/10 pb-3">
                              {p.items.map((it) => {
                                const d = defOf(it.ticket);
                                return (
                                  <li key={it.ticket} className="flex items-center gap-3">
                                    {d.homeImage ? (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img
                                        src={d.homeImage}
                                        alt={d.title}
                                        className="h-14 w-auto shrink-0 object-contain"
                                      />
                                    ) : (
                                      <span
                                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${d.card} ${d.fg}`}
                                      >
                                        {iconOf(d.id, "h-5 w-5")}
                                      </span>
                                    )}
                                    <div className="min-w-0">
                                      <p className="text-sm font-bold">{d.title}</p>
                                      <p className="text-xs text-white/50">{it.qty} ใบ</p>
                                    </div>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-bold">
                                รายการ {p.ref} · {baht(p.amount)}
                              </p>
                              <span
                                className={`mt-1.5 inline-block rounded-full px-2.5 py-1 text-xs font-bold ${badge.cls}`}
                              >
                                {badge.label}
                              </span>
                              {p.status === "rejected" && p.rejectReason && (
                                <p className="mt-1 text-xs text-red-600">{p.rejectReason}</p>
                              )}
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              {/* ยกเลิกได้เฉพาะรายการที่ยังไม่ได้ส่งสลีป */}
                              {p.status === "awaiting_slip" && (
                                <button
                                  type="button"
                                  disabled={cancelingId === p.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setCancelTarget(p);
                                  }}
                                  aria-label={`ยกเลิกรายการ ${p.ref}`}
                                  className="flex h-10 w-10 items-center justify-center rounded-full border border-red-200 bg-red-50 text-red-600 transition active:scale-95 disabled:opacity-60"
                                >
                                  <IconTrash className="h-5 w-5" />
                                </button>
                              )}
                              <IconArrow className="h-5 w-5 text-white/50" />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {ready && !user && (
              <div className="mt-6 rounded-3xl border border-dashed border-white/20 bg-white/5 p-8 text-center">
                <p className="text-white/60">เข้าสู่ระบบเพื่อดูตั๋วของคุณ</p>
                <button
                  type="button"
                  onClick={() => needLogin("tickets")}
                  className="mt-4 rounded-full bg-[#e50914] px-6 py-2.5 font-semibold text-white transition active:scale-95"
                >
                  เข้าสู่ระบบ
                </button>
              </div>
            )}

            {(user || !ready) && tab === "ready" && (
              <>
                {!ready || readyOrders.length === 0 ? (
                  <div className="mt-6 rounded-3xl border border-dashed border-white/20 bg-white/5 p-8 text-center">
                    <p className="text-white/60">ยังไม่มีตั๋วที่พร้อมใช้</p>
                    <button
                      type="button"
                      onClick={() => go("buy")}
                      className="mt-4 rounded-full bg-[#e50914] px-6 py-2.5 font-semibold text-white transition active:scale-95"
                    >
                      ไปซื้อตั๋ว
                    </button>
                  </div>
                ) : (
                  <div className="mt-5 flex flex-col gap-4 md:grid md:grid-cols-2 md:items-start md:gap-6">
                    {TICKETS.map((t) => {
                      const count = readyOrders.filter((o) => o.ticket === t.id).length;
                      if (count === 0) return null;
                      const wonCount = readyOrders.filter((o) => o.ticket === t.id && o.won).length;

                      // หน้าตาเหมือนหน้า "ซื้อตั๋ว" แต่ไม่มีราคา: ส่วนล่างเป็นจำนวนใบ + ปุ่มแสดงตั๋ว
                      return (
                        <div key={t.id}>
                          {t.homeImage && <p className="px-1 pb-2 text-lg font-bold text-white">{t.title}</p>}
                          <Perforated
                            bg={t.card}
                            text={t.fg}
                            dash={t.dash}
                            top={
                              t.homeImage ? (
                                <TicketImage src={t.homeImage} alt={t.title} />
                              ) : (
                                <div className="p-4">
                                  <div className="flex items-center gap-3">
                                    <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/50">
                                      {iconOf(t.id, "h-6 w-6")}
                                    </span>
                                    <div>
                                      <p className="text-lg font-bold leading-tight">{t.title}</p>
                                      <p className="text-[10px] font-semibold tracking-widest opacity-70">{t.sub}</p>
                                    </div>
                                  </div>
                                  <p className="mt-4 text-sm opacity-80">{t.groupNote}</p>
                                </div>
                              )
                            }
                            bottom={
                              <div className="flex items-center justify-between gap-3 px-4 pb-4 pt-3">
                                <div>
                                  <p className="text-3xl font-extrabold">
                                    {count}
                                    <span className="text-xs font-medium opacity-70"> ใบ</span>
                                  </p>
                                  {wonCount > 0 && (
                                    <span className="pd-gold-frame mt-1 inline-block rounded-full px-3 py-1 text-xs font-extrabold text-[#5a3b00]">
                                      ถูกรางวัล {wonCount} ใบ
                                    </span>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setSheet(t.id)}
                                  className="flex items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-bold text-black transition active:scale-[0.99]"
                                >
                                  {t.showLabel}
                                  <IconArrow className="h-5 w-5" />
                                </button>
                              </div>
                            }
                          />
                        </div>
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
                  <div className="mt-6 rounded-3xl border border-dashed border-white/20 bg-white/5 p-8 text-center">
                    <p className="text-white/60">ยังไม่มีตั๋วที่ใช้แล้ว</p>
                  </div>
                ) : (
                  <ul className="mt-5 flex flex-col gap-3 md:grid md:grid-cols-2 md:gap-4">
                    {usedOrders.map((o) => {
                      const d = defOf(o.ticket);
                      return (
                        <li key={o.code} className="flex items-center gap-3 rounded-2xl bg-[#1f1f1f] p-4 opacity-80">
                          {d.homeImage ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={d.homeImage} alt={d.title} className="h-12 w-auto shrink-0 object-contain" />
                          ) : (
                            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#2a2a2a]">
                              {iconOf(o.ticket, "h-5 w-5")}
                            </span>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold">{d.title}</p>
                            <p className="truncate font-mono text-xs text-white/50">{o.code}</p>
                            {o.won && <p className="text-xs font-bold text-[#ffd54a]">ถูกรางวัล</p>}
                          </div>
                          <div className="shrink-0 text-right">
                            <span className="inline-block rounded-full bg-green-100 px-2.5 py-1 text-xs font-bold text-green-800">
                              รับแล้ว
                            </span>
                            <p className="mt-1 text-xs text-white/50">{fmtTime(o.usedAt)}</p>
                          </div>
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
              <div className="mt-6 rounded-3xl border border-dashed border-white/20 bg-white/5 p-8 text-center">
                <p className="text-white/60">{ready ? "ยังไม่ได้เข้าสู่ระบบ" : "กำลังโหลด..."}</p>
                {ready && (
                  <button
                    type="button"
                    onClick={() => needLogin("profile")}
                    className="mt-4 rounded-full bg-[#e50914] px-6 py-2.5 font-semibold text-white transition active:scale-95"
                  >
                    เข้าสู่ระบบ / สมัครสมาชิก
                  </button>
                )}
              </div>
            ) : (
              <div className="md:mt-6 md:grid md:grid-cols-[18rem_minmax(0,1fr)] md:items-start md:gap-6">
                <div className="mt-6 flex items-center gap-4 rounded-3xl bg-gradient-to-br from-[#e50914] to-[#7a0a10] p-5 text-white md:col-start-1 md:row-start-1 md:mt-0">
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white text-2xl font-bold uppercase text-black">
                    {(user.name || user.username).charAt(0)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-lg font-bold">{user.name}</p>
                    <p className="truncate text-sm text-white">@{user.username}</p>
                  </div>
                </div>

                <div className="mt-4 rounded-3xl border border-white/10 bg-[#1f1f1f] p-5 md:col-start-2 md:row-span-2 md:row-start-1 md:mt-0 md:p-6">
                  <h2 className="text-lg font-bold">ข้อมูลผู้ซื้อ</h2>
                  <p className="mt-1 text-sm text-white/60">ใช้กรอกข้อมูลให้อัตโนมัติตอนซื้อตั๋ว</p>
                  {returnToPay && !user.empCode && (
                    <p role="alert" className="mt-3 rounded-xl bg-amber-100 px-4 py-3 text-sm font-semibold text-amber-800">
                      กรอกรหัสพนักงานก่อนซื้อ Lucky Draw กรอกแล้วแก้ไขภายหลังไม่ได้ บันทึกแล้วระบบพากลับไปชำระเงินต่อ
                    </p>
                  )}
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
                    <label className="block">
                      <span className="text-sm font-medium">รหัสพนักงาน ({EMP_CODE_LENGTH} หลัก)</span>
                      <input
                        value={user.empCode ?? accEmp}
                        onChange={(e) => {
                          setAccEmp(e.target.value.replace(/\D/g, "").slice(0, EMP_CODE_LENGTH));
                          setAccSaved(false);
                        }}
                        disabled={!!user.empCode}
                        inputMode="numeric"
                        autoComplete="off"
                        maxLength={EMP_CODE_LENGTH}
                        placeholder={"0".repeat(EMP_CODE_LENGTH)}
                        className={`${inputCls} font-mono tracking-[0.3em] disabled:opacity-60`}
                      />
                      <span className="mt-1 block text-xs text-white/50">
                        {user.empCode
                          ? "แก้ไขเองไม่ได้ ถ้าผิดให้แจ้งเจ้าหน้าที่"
                          : "ใช้ลุ้นรางวัล Lucky Draw กรอกแล้วแก้ไขภายหลังไม่ได้"}
                      </span>
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
                      className="rounded-full bg-[#e50914] px-6 py-2.5 font-semibold text-white transition active:scale-95"
                    >
                      บันทึกข้อมูล
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={logout}
                  className="mt-4 w-full rounded-2xl border border-white/40 py-3.5 font-semibold transition active:scale-[0.99] md:col-start-1 md:row-start-2 md:mt-0"
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
              <div className="relative mt-6 overflow-hidden rounded-3xl bg-gradient-to-br from-[#e50914] to-[#7a0a10] p-5 text-white md:mt-0 md:p-8">
                <p className="text-[11px] font-bold tracking-wider text-white">PAYDAY IS PLAY DAY</p>
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
                  className="mt-5 grid grid-cols-2 rounded-2xl bg-[#2a2a2a] p-1 md:mt-0"
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
                        authMode === id ? "bg-[#e50914] text-white" : "text-white/60"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <form
                  className="mt-4 space-y-4 rounded-3xl border border-white/10 bg-[#1f1f1f] p-5 md:p-6"
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
                      <label className="block">
                        <span className="text-sm font-medium">รหัสพนักงาน ({EMP_CODE_LENGTH} หลัก)</span>
                        <input
                          value={authEmp}
                          onChange={(e) => setAuthEmp(e.target.value.replace(/\D/g, "").slice(0, EMP_CODE_LENGTH))}
                          inputMode="numeric"
                          autoComplete="off"
                          maxLength={EMP_CODE_LENGTH}
                          placeholder={"0".repeat(EMP_CODE_LENGTH)}
                          className={`${inputCls} font-mono tracking-[0.3em]`}
                        />
                        <span className="mt-1 block text-xs text-white/50">
                          ใช้ลุ้นรางวัล Lucky Draw กรอกแล้วแก้ไขภายหลังไม่ได้
                        </span>
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
                      <span className="mt-1 block text-xs text-white/50">3-20 ตัว ใช้ a-z 0-9 . _ ได้</span>
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
                      <span className="mt-1 block text-xs text-white/50">อย่างน้อย 6 ตัวอักษร</span>
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
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#e50914] py-4 text-base font-bold text-white transition active:scale-[0.99] disabled:opacity-60"
                  >
                    {authBusy ? "กำลังดำเนินการ..." : authMode === "login" ? "เข้าสู่ระบบ" : "สมัครสมาชิก"}
                    {!authBusy && <IconArrow className="h-5 w-5 text-white" />}
                  </button>
                </form>
              </div>
            </div>
          </section>
        )}
      </main>

      {showNav && <BottomNav view={navView} badges={badges} golden={hasNewWin} onGo={go} />}

      {/* ===== popup ยืนยันการยกเลิกรายการโอนเงิน ===== */}
      {cancelTarget && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="cancel-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
          onClick={() => {
            if (!cancelingId) setCancelTarget(null);
          }}
        >
          <div
            className="w-full max-w-sm rounded-3xl bg-[#1f1f1f] p-6 text-center text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-red-600">
              <IconTrash className="h-7 w-7" />
            </span>
            <h2 id="cancel-title" className="mt-4 text-lg font-bold">
              ยกเลิกรายการนี้ใช่ไหม?
            </h2>
            <p className="mt-1 text-sm text-white/60">
              รายการ <span className="font-mono font-bold">{cancelTarget.ref}</span> · {baht(cancelTarget.amount)}
            </p>
            <p className="mt-1 text-xs text-white/50">ยกเลิกแล้วกู้คืนไม่ได้ ถ้าโอนเงินไปแล้วอย่ายกเลิก</p>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setCancelTarget(null)}
                disabled={cancelingId !== null}
                className="flex-1 rounded-2xl border border-white/40 py-3 text-sm font-semibold transition active:scale-[0.99] disabled:opacity-60"
              >
                ไม่ยกเลิก
              </button>
              <button
                type="button"
                onClick={() => cancelPayment(cancelTarget.id)}
                disabled={cancelingId !== null}
                className="flex-1 rounded-2xl bg-red-600 py-3 text-sm font-bold text-white transition active:scale-[0.99] disabled:opacity-60"
              >
                {cancelingId ? "กำลังยกเลิก..." : "ยืนยันยกเลิก"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== หน้าต่างแสดงตั๋ว (มือถือ: เลื่อนขึ้นจากด้านล่าง / คอมพิวเตอร์: กลางจอ) ===== */}
      {sheet && sheetDef && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="sheet-title"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 md:items-center md:p-6"
          onClick={() => setSheet(null)}
        >
          <div
            className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-[#1f1f1f] p-5 pb-8 text-white md:max-w-3xl md:rounded-3xl md:p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 id="sheet-title" className="text-xl font-bold">
                {sheetDef.title} · {sheetReadyCount} ใบ
              </h2>
              <button
                type="button"
                onClick={() => setSheet(null)}
                className="rounded-full bg-[#1f1f1f] px-4 py-1.5 text-sm font-semibold"
              >
                ปิด
              </button>
            </div>
            <p className="mt-1 text-xs text-white/60">แสดงตั๋วนี้ให้เจ้าหน้าที่สแกนที่หน้างาน</p>

            <div className="mt-4 flex flex-col gap-4 md:grid md:grid-cols-2 md:items-start md:gap-6">
              {sheetOrders.map((o) => (
                <TicketPass key={o.code} def={sheetDef} order={o} scanned={o.used === true} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}