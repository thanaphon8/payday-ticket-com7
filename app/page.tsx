"use client";

import { memo, useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Prompt } from "next/font/google";
import { code128Bars } from "@/lib/code128";
import LoginForm from "./components/LoginForm";
import RegisterForm from "./components/RegisterForm";
import { EMP_CODE_LENGTH, validEmp, validPhone } from "./components/auth-shared";
import type { AuthMode, User } from "./components/auth-shared";
import { departmentsOf, getCompany } from "./components/departments";
import { branchesOf, branchFullLabel } from "./components/branches";

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
  card: string; // สีการ์ด/ไอคอน (ใช้ในตั๋วที่แสดงให้เจ้าหน้าที่สแกน/สรุปรายการ)
  fg: string; // สีตัวหนังสือบนการ์ด
  dash: string; // สีเส้นประ
  button: string; // สีปุ่ม
  soft: string; // สีอ่อนของป้ายสถานะ
  shimmer: string; // class พื้นตั๋ววิบวับตามสีตั๋ว (หน้าหลัก/หน้าซื้อตั๋ว/หน้าตั๋วของฉัน) ไม่มีกรอบ ไม่มีออร่า
};

const TICKETS: TicketDef[] = [
  {
    id: "booth",
    title: "ตั๋วเข้าซุ้ม",
    sub: "BOOTH PASS",
    homeNote: "เล่นเกมให้เต็มที่",
    homeImage: "/img/p1.png",
    blurb: "1 ชุด = ตั๋วเล่นซุ้ม 2 ใบ (ใบละ ฿50) + ตั๋วรับตั๋วกระดาษ 1 ใบ", // TODO: แก้ให้ตรงสิทธิ์จริง
    // ราคา 100 บาท / ชุด (ออกเป็น 3 ใบ: 50 + 50 + 0) ถ้าจะเปลี่ยนให้แก้ให้ตรงกับ TICKET_PRICES และ BOOTH_SET ใน lib/tickets.ts (ฝั่งเซิร์ฟเวอร์คิดเงินจากตัวนั้น)
    price: 100,
    layout: "banner",
    groupNote: "เลือกซุ้มที่ชอบ แล้วไปเล่นกัน!",
    meta: "1 ชุด = 3 ใบ • ใช้ได้เฉพาะวันงาน",
    showLabel: "แสดงตั๋วเข้าซุ้ม",
    card: "bg-[#0f1b4d]",
    fg: "text-white",
    dash: "border-white/30",
    button: "bg-[#e50914] text-white",
    soft: "bg-[#eef9c8]",
    shimmer: "pd-shimmer-blue",
  },
  {
    id: "lucky",
    title: "Lucky Draw",
    sub: "LUCKY DRAW TICKET",
    homeNote: "ลุ้นรางวัลสุดเซอร์ไพรส์",
    homeImage: "/img/p2.png",
    blurb: "1 ใบ = 1 สิทธิ์สุ่มของรางวัล ภายในงาน", // TODO: แก้ให้ตรงสิทธิ์จริง
    // ราคา 50 บาท ถ้าจะเปลี่ยนให้แก้ให้ตรงกับ TICKET_PRICES ใน lib/tickets.ts
    price: 50,
    layout: "compact",
    groupNote: "ลุ้นของรางวัล • 1 สิทธิ์",
    chips: ["รอสุ่มภายในงาน", "ยังไม่ได้ใช้สิทธิ์"],
    showLabel: "แสดงตั๋ว Lucky Draw",
    card: "bg-[#6b1d24]",
    fg: "text-white",
    dash: "border-white/30",
    button: "bg-[#6b1d24] text-white",
    soft: "bg-[#f3d9dc]",
    shimmer: "pd-shimmer-red",
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
  part?: "booth" | "paper"; // ตั๋วเข้าซุ้ม: booth = ตั๋วเล่นซุ้ม (฿50) / paper = ตั๋วรับตั๋วกระดาษ (ไม่มีมูลค่า)
};

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
  items?: { ticket: TicketId; qty: number }[]; // ตั๋วที่ซื้อในรายการนี้ (ประเภท + จำนวน)
};

// ผลจาก GET /api/payments/[id]
type PayPoll = Payment & { orders?: Order[] };

const MAX_QTY = 20; // จำนวนสูงสุดต่อตั๋ว 1 ประเภท ต่อการซื้อ 1 ครั้ง (กันกดพลาด)
const CART_KEY = "payday-cart-v1";
const SLIP_POLL_MS = 5000; // เช็กสถานะรายการโอนทุกกี่มิลลิวินาที
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

// ลำดับหน่วงของเอฟเฟคค่อย ๆ ขึ้น (ใช้คู่กับ class pd-rise)
const stagger = (i: number) => ({ "--i": i }) as CSSProperties;

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
const IconCamera = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
    <circle cx="12" cy="13" r="3.5" />
  </Icon>
);

const iconOf = (id: TicketId, className?: string) =>
  id === "booth" ? <IconTicket className={className} /> : <IconGift className={className} />;

// รูปโปรไฟล์วงกลม: มีรูป (user.avatarAt) แสดงรูปจาก /api/avatar/[id] / ไม่มีหรือโหลดไม่ได้ แสดงตัวอักษรย่อ
// className = ขนาด + ขนาดตัวอักษร (เช่น "h-8 w-8 text-sm") / fallbackCls = สีพื้นและตัวอักษรของวงกลมตัวอักษรย่อ
function Avatar({
  user,
  className = "h-10 w-10 text-base",
  fallbackCls = "bg-[#e50914] text-white",
}: {
  user: User;
  className?: string;
  fallbackCls?: string;
}) {
  const [failed, setFailed] = useState(false);
  const src = user.avatarAt ? `/api/avatar/${user.id}?v=${encodeURIComponent(user.avatarAt)}` : "";

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
        className={`block shrink-0 rounded-full bg-[#2a2a2a] object-cover ${className}`}
      />
    );
  }
  const letter = Array.from((user.name || user.username).trim())[0] ?? "?";
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-full font-bold uppercase ${className} ${fallbackCls}`}
    >
      {letter}
    </span>
  );
}

/* ---------- ปรับรูปโปรไฟล์ก่อนบันทึก ----------
   เลือกรูปแล้วเปิดหน้าต่างนี้: ลากรูปเพื่อขยับ / เลื่อนแถบหรือหมุนล้อเมาส์เพื่อซูม / กด "บันทึก"
   จึงตัดตามกรอบวงกลมเป็นรูปจัตุรัส 512×512 แล้วส่งไปอัปโหลด */
const AVATAR_FRAME = 280; // ขนาดกรอบวงกลมบนจอ (px)
const AVATAR_OUT = 512; // ขนาดรูปที่บันทึกจริง (px)
const AVATAR_MAX_ZOOM = 4;

function AvatarCropper({
  file,
  busy,
  error,
  onCancel,
  onSave,
}: {
  file: File;
  busy: boolean;
  error: string;
  onCancel: () => void;
  onSave: (f: File) => void;
}) {
  const [src, setSrc] = useState("");
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [loadErr, setLoadErr] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [off, setOff] = useState({ x: 0, y: 0 }); // ระยะที่รูปเลื่อนจากกึ่งกลางกรอบ
  const drag = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    setImg(null);
    setLoadErr(false);
    setZoom(1);
    setOff({ x: 0, y: 0 });
    const im = new Image();
    im.onload = () => setImg(im);
    im.onerror = () => setLoadErr(true);
    im.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // กด Esc ปิด (ระหว่างบันทึกไม่ปิด)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  const F = AVATAR_FRAME;
  const base = img ? F / Math.min(img.naturalWidth, img.naturalHeight) : 1; // ขนาดพอดีเต็มกรอบ (cover)
  const dw = img ? img.naturalWidth * base * zoom : 0;
  const dh = img ? img.naturalHeight * base * zoom : 0;

  // รูปต้องคลุมกรอบเต็มเสมอ ไม่ให้เห็นขอบว่าง
  const clamp = (x: number, y: number, w: number, h: number) => ({
    x: Math.max(-(w - F) / 2, Math.min((w - F) / 2, x)),
    y: Math.max(-(h - F) / 2, Math.min((h - F) / 2, y)),
  });

  const changeZoom = (z: number) => {
    if (!img) return;
    const nz = Math.max(1, Math.min(AVATAR_MAX_ZOOM, z));
    setZoom(nz);
    setOff((o) => clamp(o.x, o.y, img.naturalWidth * base * nz, img.naturalHeight * base * nz));
  };

  const move = (dx: number, dy: number) => setOff((o) => clamp(o.x + dx, o.y + dy, dw, dh));

  const save = () => {
    if (!img || busy) return;
    const k = AVATAR_OUT / F;
    const canvas = document.createElement("canvas");
    canvas.width = AVATAR_OUT;
    canvas.height = AVATAR_OUT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, AVATAR_OUT, AVATAR_OUT);
    ctx.drawImage(img, (F / 2 + off.x - dw / 2) * k, (F / 2 + off.y - dh / 2) * k, dw * k, dh * k);
    canvas.toBlob(
      (b) => {
        if (b) onSave(new File([b], `avatar-${Date.now()}.jpg`, { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.9,
    );
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="avatar-crop-title"
      className="pd-fade fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
    >
      <div className="pd-dialog w-full max-w-sm rounded-3xl bg-[#1f1f1f] p-6 text-center text-white">
        <h2 id="avatar-crop-title" className="text-lg font-bold">
          ปรับรูปโปรไฟล์
        </h2>
        <p className="mt-1 text-xs text-white/60">ลากรูปเพื่อขยับ เลื่อนแถบเพื่อซูม แล้วกดบันทึก</p>

        <div
          tabIndex={0}
          role="img"
          aria-label="กรอบปรับรูปโปรไฟล์ ใช้ปุ่มลูกศรเพื่อขยับรูป"
          style={{ width: F, height: F, touchAction: "none" }}
          className="relative mx-auto mt-5 cursor-grab select-none overflow-hidden rounded-full bg-[#2a2a2a] ring-4 ring-white/20 active:cursor-grabbing"
          onPointerDown={(e) => {
            if (!img || busy) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.current = { px: e.clientX, py: e.clientY, ox: off.x, oy: off.y };
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d) return;
            setOff(clamp(d.ox + (e.clientX - d.px), d.oy + (e.clientY - d.py), dw, dh));
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
          onWheel={(e) => changeZoom(zoom - e.deltaY * 0.002)}
          onKeyDown={(e) => {
            const step = 10;
            if (e.key === "ArrowLeft") move(step, 0);
            else if (e.key === "ArrowRight") move(-step, 0);
            else if (e.key === "ArrowUp") move(0, step);
            else if (e.key === "ArrowDown") move(0, -step);
            else return;
            e.preventDefault();
          }}
        >
          {img && src && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={src}
              alt=""
              draggable={false}
              style={{
                width: dw,
                height: dh,
                left: F / 2 + off.x - dw / 2,
                top: F / 2 + off.y - dh / 2,
              }}
              className="pointer-events-none absolute max-w-none select-none"
            />
          )}
          {!img && !loadErr && (
            <span className="absolute inset-0 flex items-center justify-center text-sm text-white/60">
              กำลังโหลดรูป...
            </span>
          )}
          {loadErr && (
            <span className="absolute inset-0 flex items-center justify-center px-6 text-sm text-red-400">
              เปิดรูปนี้ไม่ได้ เลือกรูปอื่น
            </span>
          )}
        </div>

        <div className="mx-auto mt-5 flex items-center gap-3" style={{ maxWidth: F }}>
          <IconMinus className="h-4 w-4 shrink-0 text-white/60" />
          <input
            type="range"
            min={1}
            max={AVATAR_MAX_ZOOM}
            step={0.01}
            value={zoom}
            onChange={(e) => changeZoom(Number(e.target.value))}
            disabled={!img || busy}
            aria-label="ซูมรูป"
            className="h-2 w-full cursor-pointer accent-[#e50914] disabled:opacity-50"
          />
          <IconPlus className="h-4 w-4 shrink-0 text-white/60" />
        </div>

        {error && (
          <p role="alert" className="mt-3 text-sm font-medium text-red-500">
            {error}
          </p>
        )}

        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="flex-1 rounded-2xl border border-white/40 py-3 text-sm font-semibold transition active:scale-[0.98] disabled:opacity-60"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!img || busy}
            className="flex-1 rounded-2xl bg-[#e50914] py-3 text-sm font-bold text-white transition active:scale-[0.98] disabled:opacity-60"
          >
            {busy ? "กำลังบันทึก..." : "บันทึก"}
          </button>
        </div>
      </div>
    </div>
  );
}

// บาร์โค้ด Code128 จริง (เจ้าหน้าที่ยิงด้วยกล้องที่หน้า /ticket ได้) วาดเป็น SVG สีตามตัวหนังสือของตั๋ว
// มีพื้นที่ว่างซ้ายขวาในตัว ต้องวางบนพื้นสีอ่อน (ตั๋วใช้พื้นขาว)
function Barcode({ code, className = "block h-16 w-full" }: { code: string; className?: string }) {
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
      className={className}
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

/* ---------- กรอบทอง + ออร่า + ประกาย (ตั๋วที่ถูกรางวัล ในหน้า "ตั๋วของฉัน") ---------- */
function GoldFrame({ children }: { children: ReactNode }) {
  return (
    <div className="pd-gold-frame relative rounded-[2rem] p-1.5">
      <div aria-hidden className="pointer-events-none absolute inset-0 z-10 overflow-hidden rounded-[2rem]">
        {SPARKLES.map((s, i) => (
          <IconSpark key={i} className={`pd-twinkle absolute text-white ${s.size}`} />
        ))}
      </div>
      {children}
    </div>
  );
}

/* ---------- ตั๋ว 1 ใบ (ใช้ในหน้าซื้อสำเร็จ และตอนแสดงตั๋ว) ----------
   scanned = ตั๋วใบนี้ถูกเจ้าหน้าที่สแกนแล้ว: ตั๋วเป็นสีเทา + ตราประทับเฉียงทับตั๋วค้างไว้ถาวร (ไม่เฟดหาย) ผู้ใช้จะรู้ว่าใบไหนใช้แล้ว ใบไหนยังไม่ใช้
     ตั๋วเล่นซุ้มที่มีมูลค่า ขึ้นว่า "ใช้แล้ว" / ตั๋วที่ไม่มีมูลค่า (รับตั๋วกระดาษ) และ Lucky Draw ขึ้นว่า "รับแล้ว"
   calm = โหมดเบา (หน้าต่างแสดงตั๋ว): ตั๋วถูกรางวัลเป็นกรอบทองนิ่ง ไม่มีประกาย/ออร่า/แอนิเมชัน กันเครื่องค้างเมื่อถูกรางวัลหลายใบ
   onBarcode = (ตั๋วเข้าซุ้มในหน้าต่างแสดงตั๋ว) ยังไม่แสดงบาร์โค้ด ต้องแตะที่ตั๋วอีกครั้งเพื่อเปิดบาร์โค้ดเต็มจอ
   ตั๋วเล่นซุ้ม (มีมูลค่า ฿50) = พื้นขาว หัวสีกรมท่า ป้ายราคาสีไลม์ / ตั๋วรับตั๋วกระดาษ (ไม่มีมูลค่า) = พื้นครีม หัวสีส้มน้ำตาล เส้นประสีส้ม ไอคอนใบเสร็จ */
const TicketPass = memo(function TicketPass({
  def,
  order,
  scanned = false,
  calm = false,
  onBarcode,
}: {
  def: TicketDef;
  order: Order;
  scanned?: boolean;
  calm?: boolean;
  onBarcode?: (code: string) => void;
}) {
  const isPaper = def.id === "booth" && order.part === "paper";
  const isValue = def.id === "booth" && !isPaper;
  const heading = isPaper ? "ตั๋วรับตั๋วกระดาษ" : isValue ? "ตั๋วเล่นซุ้ม" : def.title;
  const subHeading = isPaper ? "PAPER TICKET · ไม่มีมูลค่า" : isValue ? "BOOTH PLAY TICKET" : def.sub;
  const tapBarcode = !!onBarcode && def.id === "booth" && !scanned && !order.used;
  const usedWord = isValue ? "ใช้แล้ว" : "รับแล้ว"; // ตั๋วมีมูลค่า = ใช้แล้ว / ตั๋วไม่มีมูลค่า = รับแล้ว

  const pass = (
    <Perforated
      bg={isPaper ? "bg-[#fff1c2]" : "bg-white"}
      dash={isPaper ? "border-[#b45309]" : undefined}
      top={
        <div className="p-2">
          <div
            className={`flex items-center justify-between rounded-2xl px-4 py-3 ${
              isPaper ? "bg-[#b45309] text-white" : `${def.card} ${def.fg}`
            }`}
          >
            <div>
              <p className="text-[10px] font-bold tracking-widest">{subHeading}</p>
              <p className="text-lg font-extrabold leading-tight">{heading}</p>
            </div>
            {isValue ? (
              <span className="rounded-full bg-[#d9f27a] px-3 py-1 text-xl font-extrabold text-[#14402c]">
                {baht(order.price)}
              </span>
            ) : isPaper ? (
              <IconReceipt className="h-8 w-8" />
            ) : (
              iconOf(def.id, "h-8 w-8")
            )}
          </div>
          <div className="px-3 pb-3 pt-3">
            <p className="text-[10px] font-bold tracking-widest text-[#2f8f5b]">
              {EVENT.name.toUpperCase()} · {EVENT.date}
            </p>
            <p className="mt-1 text-sm font-semibold">
              {order.name} · {order.phone}
            </p>
            {def.id === "booth" && (
              <p className="mt-1 text-xs font-semibold text-neutral-600">
                {isPaper ? "ไม่มีมูลค่า · ให้เจ้าหน้าที่สแกนเพื่อรับตั๋วกระดาษ" : `มูลค่า ${baht(order.price)} · ใช้เล่นซุ้ม`}
              </p>
            )}
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
        ) : scanned || order.used ? (
          // ตั๋วที่สแกนแล้ว ไม่แสดงบาร์โค้ดอีก (กันยิงซ้ำ) แสดงแค่สถานะ + รหัส
          <div className="px-5 pb-5 pt-4 text-center">
            <p className="text-base font-extrabold tracking-wide">{usedWord}</p>
            <p className="mt-2 break-all font-mono text-xs font-bold tracking-wider">{order.code}</p>
          </div>
        ) : tapBarcode ? (
          // ยังไม่โชว์บาร์โค้ด: แตะอีกครั้งเพื่อเปิดบาร์โค้ดเต็มจอแนวนอน (กันผู้ยิงตั๋วยิงผิดใบ)
          <button
            type="button"
            onClick={() => onBarcode?.(order.code)}
            aria-label={`แตะเพื่อแสดงบาร์โค้ด ${heading}`}
            className="block w-full px-5 pb-5 pt-4 text-center transition active:scale-[0.98]"
          >
            <p className="text-base font-extrabold tracking-wide">
              {isPaper ? "แตะเพื่อแสดงบาร์โค้ด (รับตั๋วกระดาษ)" : `แตะเพื่อแสดงบาร์โค้ด (${baht(order.price)})`}
            </p>
            <p className="mt-2 break-all font-mono text-xs font-bold tracking-wider">{order.code}</p>
          </button>
        ) : (
          <div className="px-2 pb-5 pt-4">
            <Barcode code={order.code} />
            <p className="mt-2 break-all text-center font-mono text-xs font-bold tracking-wider">{order.code}</p>
          </div>
        )
      }
    />
  );

  // ตั๋วถูกรางวัล: กรอบสีทอง (โหมดเบา = ทองนิ่ง ไม่มีประกาย/ออร่า)
  const shown = order.won ? (
    calm ? (
      <div className="pd-gold-static relative rounded-[2rem] p-2">
        <p className="pb-2 text-center text-sm font-extrabold tracking-wide text-[#5a3b00]">
          ตั๋วใบนี้ถูกรางวัล! ยินดีด้วย
        </p>
        {pass}
      </div>
    ) : (
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
    )
  ) : (
    pass
  );

  if (!scanned) return shown;

  // ตั๋วถูกสแกนแล้ว: ตัวตั๋วเป็นสีเทา + ตราประทับเฉียงทับตั๋วค้างไว้ถาวร พร้อมเวลาที่ใช้
  return (
    <div className="relative">
      <div className="pd-scanned">{shown}</div>
      <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <span className="pd-stamp rounded-2xl border-4 border-red-500 bg-black/40 px-6 py-2 text-4xl font-extrabold tracking-widest text-red-500 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
            {usedWord}
          </span>
          {order.usedAt && (
            <span className="rounded-full bg-black/60 px-3 py-1 text-xs font-semibold text-white">
              {fmtTime(order.usedAt)}
            </span>
          )}
        </div>
      </div>
      <span role="status" className="sr-only">
        ตั๋วใบนี้{usedWord}
      </span>
    </div>
  );
});

/* ---------- บาร์โค้ดเต็มจอแนวนอน ----------
   จอแนวตั้ง: หมุนเนื้อหา 90° ด้วย CSS (ไม่ต้องหมุนจอ) / จอแนวนอน: ไม่หมุน
   แตะที่ไหนก็ได้เพื่อปิด แสดงทีละใบ กันผู้ยิงตั๋วยิงผิดใบ
   ตั๋วเล่นซุ้ม (฿50) = พื้นขาว กรอบกรมท่า / ตั๋วรับตั๋วกระดาษ = พื้นครีม กรอบส้มน้ำตาล เพื่อให้ staff แยกออกทันที */
function BarcodeFullscreen({ order, def, onClose }: { order: Order; def: TicketDef; onClose: () => void }) {
  const isPaper = def.id === "booth" && order.part === "paper";
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="บาร์โค้ดตั๋ว"
      onClick={onClose}
      className={`pd-fade fixed inset-0 z-[60] border-[14px] text-black ${
        isPaper ? "border-[#b45309] bg-[#fff1c2]" : "border-[#0f1b4d] bg-white"
      }`}
    >
      <div className="pd-land absolute left-1/2 top-1/2 flex flex-col items-center justify-center gap-3 p-6">
        {isPaper ? (
          <p className="rounded-full bg-[#b45309] px-6 py-2 text-center text-xl font-extrabold text-white">
            ตั๋วรับตั๋วกระดาษ · ไม่มีมูลค่า
          </p>
        ) : (
          <p className="rounded-full bg-[#0f1b4d] px-6 py-2 text-center text-xl font-extrabold text-white">
            ตั๋วเล่นซุ้ม · มูลค่า <span className="text-[#d9f27a]">{baht(order.price)}</span>
          </p>
        )}
        <div className="min-h-0 w-full max-w-4xl flex-1">
          <Barcode code={order.code} className="block h-full w-full" />
        </div>
        <p className="break-all text-center font-mono text-base font-bold tracking-wider">{order.code}</p>
        <p className="text-xs text-neutral-500">แตะที่ไหนก็ได้เพื่อปิด</p>
      </div>
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
        className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-black shadow-[0_1px_4px_rgba(0,0,0,0.4)] transition active:scale-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <IconMinus className="h-5 w-5" />
      </button>
      <span aria-live="polite" className={`min-w-6 text-center text-lg font-semibold ${onDark ? "text-white" : ""}`}>
        <span key={value} className="pd-pop inline-block">
          {value}
        </span>
      </span>
      <button
        type="button"
        aria-label={`เพิ่มจำนวน${name}`}
        onClick={() => onChange(value + 1)}
        disabled={value >= max}
        className={`flex h-10 w-10 items-center justify-center rounded-full transition active:scale-90 disabled:cursor-not-allowed disabled:opacity-40 ${
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
          className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/10 text-white backdrop-blur-md transition active:scale-90"
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
      <div className="relative overflow-hidden rounded-full border border-white/15 bg-white/10 shadow-[0_10px_30px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-2xl backdrop-saturate-150 supports-[not(backdrop-filter:blur(1px))]:bg-[#2a2a2a]">
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
                      <span key={badge} className="pd-pop absolute -right-2.5 -top-1.5 min-w-4 rounded-full bg-white px-1 text-center text-[10px] font-bold leading-4 text-black shadow-[0_1px_4px_rgba(0,0,0,0.4)]">
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
    <header className="sticky top-0 z-40 hidden border-b border-white/15 bg-white/[0.07] backdrop-blur-2xl backdrop-saturate-150 md:block">
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
                    className={`relative flex items-center gap-2 rounded-full px-4 py-2 text-sm transition duration-300 active:scale-95 ${
                      active
                        ? "bg-[#e50914] font-bold text-white"
                        : gold
                          ? "pd-gold-frame font-bold text-[#5a3b00]"
                          : "font-medium text-white/70 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    {n.label}
                    {badge > 0 && (
                      <span key={badge} className="pd-pop min-w-5 rounded-full bg-white px-1.5 text-center text-[11px] font-bold leading-5 text-black">
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
              <Avatar
                user={user}
                className="h-8 w-8 text-sm"
                fallbackCls={view === "profile" ? "bg-white text-[#e50914]" : "bg-[#e50914] text-white"}
              />
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
      className={`pd-bar fixed z-40 border border-white/15 bg-white/10 shadow-[0_-8px_32px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.15)] backdrop-blur-2xl backdrop-saturate-150 ${
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

// ส่งฟอร์มด้วย XMLHttpRequest เพื่อรู้ความคืบหน้าการอัปโหลด (fetch ดึงความคืบหน้าขาขึ้นไม่ได้)
// onProgress ได้ค่า 0–1 / ล้มเหลวที่เครือข่าย = reject
function sendForm(
  url: string,
  body: FormData,
  onProgress: (ratio: number) => void,
): Promise<{ status: number; data: { error?: string } }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      let data: { error?: string } = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        /* ignore */
      }
      resolve({ status: xhr.status, data });
    };
    xhr.onerror = () => reject(new Error("network"));
    xhr.onabort = () => reject(new Error("abort"));
    xhr.send(body);
  });
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
  const [progress, setProgress] = useState(0); // ความคืบหน้าตอนส่งสลีป 0–100
  const [stage, setStage] = useState<"upload" | "verify">("upload"); // upload = กำลังอัปโหลดรูป / verify = รอเซิร์ฟเวอร์ตรวจสลีป
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

  // อัปโหลดเสร็จแล้วแต่เซิร์ฟเวอร์ยังตรวจสลีปอยู่: ค่อย ๆ ขยับหลอดไปจนเกือบเต็ม (ไม่ถึง 100 จนกว่าจะตอบกลับ)
  useEffect(() => {
    if (!busy || stage !== "verify") return;
    const t = setInterval(() => {
      setProgress((p) => (p >= 95 ? p : Math.min(95, p + Math.max(0.4, (95 - p) * 0.06))));
    }, 400);
    return () => clearInterval(t);
  }, [busy, stage]);

  async function upload() {
    if (!file || busy) return;
    if (file.size > 25 * 1024 * 1024) return setErr("รูปใหญ่เกินไป เลือกรูปอื่น");
    setBusy(true);
    setErr("");
    setProgress(0);
    setStage("upload");
    try {
      const fd = new FormData();
      fd.append("slip", shrunk ?? (await shrinkImage(file)));
      // ช่วงอัปโหลดรูปใช้ 0–70% ที่เหลือเป็นช่วงรอเซิร์ฟเวอร์ตรวจสลีป
      const { status, data } = await sendForm(`/api/payments/${paymentId}/slip`, fd, (ratio) => {
        setProgress(Math.round(ratio * 70));
        if (ratio >= 1) setStage("verify");
      });
      if (status === 401) return onNeedLogin();
      if (status < 200 || status >= 300) return setErr(data.error ?? "ส่งสลีปไม่สำเร็จ ลองใหม่อีกครั้ง");
      setProgress(100);
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
  const pct = Math.min(100, Math.floor(progress));

  return (
    <section aria-label="โอนเงินและส่งสลีป" className="md:mx-auto md:max-w-4xl">
      <SubHeader title="โอนเงินและส่งสลีป" onBack={onBack} />
      <div className="mt-6">
        <Steps current={2} />
      </div>

      {!pay && <p className="mt-6 animate-pulse text-sm text-white/60">{loadError || "กำลังโหลด..."}</p>}

      {open && (
        <div className="md:mt-6 md:grid md:grid-cols-2 md:items-start md:gap-6">
          {pay.status === "rejected" && (
            <div role="alert" className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 md:col-span-2 md:mt-0">
              <p className="text-sm font-bold text-red-700">สลีปไม่ผ่าน</p>
              <p className="mt-1 text-sm text-red-700">{pay.rejectReason ?? "กรุณาตรวจสอบแล้วส่งสลีปใหม่"}</p>
            </div>
          )}

          {busy ? (
            // ระหว่างส่งสลีป: ซ่อน QR แล้วแสดงหลอดความคืบหน้าแทน
            <div
              role="status"
              aria-live="polite"
              className="pd-rise mt-6 rounded-3xl border border-white/10 bg-[#1f1f1f] p-5 text-center md:mt-0 md:p-6"
            >
              <p className="text-xs text-white/50">กำลังส่งสลีป กรุณาอย่าปิดหน้านี้</p>
              <p className="mt-1 text-5xl font-extrabold tabular-nums">{pct}%</p>
              <div
                role="progressbar"
                aria-label="ความคืบหน้าการส่งสลีป"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={pct}
                className="mt-5 h-3 w-full overflow-hidden rounded-full bg-white/15"
              >
                <div
                  className="h-full rounded-full bg-[#e50914] transition-[width] duration-300 ease-out"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="mt-4 text-sm font-semibold">
                {stage === "upload" ? "กำลังอัปโหลดรูปสลีป" : "กำลังตรวจสอบสลีป อาจใช้เวลาสักครู่"}
              </p>
              <p className="mt-1 text-xs text-white/50">
                ยอด {baht(pay.amount)} · รหัสอ้างอิง <span className="font-mono font-bold text-white">{pay.ref}</span>
              </p>
            </div>
          ) : (
            <div className="pd-rise mt-6 rounded-3xl border border-white/10 bg-[#1f1f1f] p-5 text-center md:mt-0 md:p-6">
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
                  บันทึก QR Code
                </a>
              )}
              <p className="mt-3 text-sm font-bold">
                {secsLeft > 0 ? `ส่งสลีปภายใน ${fmtCountdown(secsLeft)}` : "หมดเวลาแล้ว กำลังตรวจสอบ..."}
              </p>
            </div>
          )}

          <div className="pd-rise mt-4 rounded-3xl border border-white/10 bg-[#1f1f1f] p-5 md:mt-0 md:p-6" style={stagger(1)}>
            <h2 className="text-base font-bold">ส่งสลีปโอนเงิน</h2>
            <p className="mt-1 text-xs text-white/50">
              ใช้สลีปจากแอปธนาคาร ต้องเห็น QR บนสลีปชัด ไม่ครอป ไม่ตัดขอบ สลีป 1 ใบใช้ได้ครั้งเดียว
            </p>

            <label className="mt-3 flex min-h-40 cursor-pointer items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-white/20 bg-[#2a2a2a] p-3 text-center text-sm font-semibold text-white/60 focus-within:ring-2 focus-within:ring-white md:min-h-56">
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                disabled={busy}
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
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#e50914] py-4 text-base font-bold text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "กำลังส่งสลีป..." : "ส่งสลีป"}
              {!busy && <IconArrow className="h-5 w-5 text-white" />}
            </button>
          </div>
        </div>
      )}

      {pay?.status === "reviewing" && (
        <div className="pd-rise mt-6 rounded-3xl border border-white/10 bg-[#1f1f1f] p-6 text-center md:mx-auto md:max-w-xl md:p-8">
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
        <div className="pd-rise mt-6 rounded-3xl border border-white/10 bg-[#1f1f1f] p-6 text-center md:mx-auto md:max-w-xl md:p-8">
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

  // เข้าสู่ระบบ / สมัครสมาชิก (ฟอร์มอยู่ใน components/LoginForm.tsx และ components/RegisterForm.tsx)
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [afterAuth, setAfterAuth] = useState<View>("home");

  // บัญชี/โปรไฟล์
  const [accName, setAccName] = useState("");
  const [accPhone, setAccPhone] = useState("");
  const [accEmp, setAccEmp] = useState("");
  const [accError, setAccError] = useState("");
  const [accSaved, setAccSaved] = useState(false);
  const [accBusy, setAccBusy] = useState(false);
  const [returnToPay, setReturnToPay] = useState(false); // ถูกส่งมากรอกรหัสพนักงานจากการกดชำระเงิน: บันทึกแล้วกลับไปหน้าชำระเงิน

  // รูปโปรไฟล์ (เก็บใน Google Drive โฟลเดอร์ profile ผ่าน /api/profile/avatar)
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const [avatarDraft, setAvatarDraft] = useState<File | null>(null); // รูปที่เลือกแล้ว รอผู้ใช้ปรับตำแหน่งและกดบันทึก
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // ตั๋วของฉัน (แท็บ "ready" = ตั๋วทั้งหมดที่ได้รับ ทั้งที่ยังไม่ใช้และใช้แล้ว / "status" = รายการโอนเงินที่ค้างอยู่)
  const [tab, setTab] = useState<"ready" | "status">("ready");
  const [sheet, setSheet] = useState<TicketId | null>(null);
  const [sheetClosing, setSheetClosing] = useState(false); // กำลังเล่นแอนิเมชันปิดหน้าต่างแสดงตั๋ว
  const closingRef = useRef(false);
  const [barcodeCode, setBarcodeCode] = useState<string | null>(null); // รหัสตั๋วที่เปิดบาร์โค้ดเต็มจอแนวนอนอยู่
  const [seenWon, setSeenWon] = useState<string[]>([]); // ตั๋วถูกรางวัลที่ผู้ใช้เห็นแล้ว

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

  // กด Esc: ถ้าบาร์โค้ดเต็มจอเปิดอยู่ ปิดบาร์โค้ดก่อน ไม่งั้นปิดหน้าต่างแสดงตั๋ว (คอมพิวเตอร์)
  useEffect(() => {
    if (!sheet) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (barcodeCode) setBarcodeCode(null);
      else closeSheet();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet, barcodeCode]);

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
  // ตั๋วที่ถูกยิงแล้วจะเป็นสีเทา + ตราประทับ ("ใช้แล้ว" / "รับแล้ว") ค้างอยู่ในหน้าต่างแสดงตั๋วถาวร
  // ถ้าข้อมูลไม่เปลี่ยน ไม่ setState (กัน render ซ้ำโดยไม่จำเป็น ลดอาการค้างบนมือถือ)
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const loadTickets = async () => {
      const r = await api<{ orders: Order[]; pending?: Payment[] }>("/api/orders");
      if (r.ok && !cancelled) {
        const nextOrders = r.data.orders;
        const nextPending = r.data.pending ?? [];
        setOrders((prev) => (JSON.stringify(prev) === JSON.stringify(nextOrders) ? prev : nextOrders));
        setPending((prev) => (JSON.stringify(prev) === JSON.stringify(nextPending) ? prev : nextPending));
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

  // มีตั๋วถูกรางวัลที่ผู้ใช้ยังไม่เคยเปิดดู
  const hasNewWin = orders.some((o) => o.won && !seenWon.includes(o.code));

  function go(v: View) {
    setView(v);
    setPayError("");
    if (v !== "profile") setReturnToPay(false);
  }

  // กด "แสดงตั๋ว" ครั้งแรก = เห็นตั๋วที่ถูกรางวัลของประเภทนั้นแล้ว: กรอบทอง/ปุ่มเมนูกลับเป็นปกติ
  // ปิดหน้าต่างแสดงตั๋ว: เลื่อนกลับลง/เฟดหาย แล้วค่อยถอดออกจากหน้า
  function closeSheet() {
    if (closingRef.current) return;
    closingRef.current = true;
    setBarcodeCode(null);
    setSheetClosing(true);
    setTimeout(() => {
      setSheet(null);
      setSheetClosing(false);
      closingRef.current = false;
    }, 300);
  }

  function openSheet(id: TicketId) {
    setSheet(id);
    if (!userId) return;
    const won = orders.filter((o) => o.ticket === id && o.won).map((o) => o.code);
    if (won.length === 0) return;
    setSeenWon((prev) => {
      if (won.every((c) => prev.includes(c))) return prev;
      const next = Array.from(new Set([...prev, ...won]));
      save(seenKey(userId), next);
      return next;
    });
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

  // LoginForm / RegisterForm เรียกตอนสำเร็จ: เก็บ user โหลดตั๋ว แล้วเด้งกลับหน้าที่ต้องการ
  // ดึง user จาก /api/auth/me อีกครั้ง เพื่อให้ได้ข้อมูลรูปโปรไฟล์ครบ (ผล login/register อาจไม่มี avatarAt)
  async function handleAuthed(u: User) {
    applyUser(u);
    const me = await api<{ user: User | null }>("/api/auth/me");
    if (me.ok && me.data.user) applyUser(me.data.user);
    const o = await api<{ orders: Order[] }>("/api/orders");
    if (o.ok) setOrders(o.data.orders);
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
    setAvatarError("");
    setAvatarDraft(null);
    setSheet(null);
    setBarcodeCode(null);
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

  // คืนค่าฟอร์มโปรไฟล์กลับเป็นข้อมูลล่าสุดของบัญชี
  function resetProfile() {
    setAccName(user?.name ?? "");
    setAccPhone(user?.phone ?? "");
    setAccEmp("");
    setAccError("");
    setAccSaved(false);
  }

  async function saveProfile() {
    if (accBusy) return;
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
    setAccBusy(true);
    setAccError("");
    const r = await api<{ user: User }>("/api/auth/me", "PATCH", {
      name: accName.trim(),
      phone: cleanPhone,
      ...(settingEmp ? { empCode: cleanEmp } : {}),
    });
    setAccBusy(false);
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

  // เลือกรูปโปรไฟล์: ตรวจไฟล์ แล้วเปิดหน้าต่างให้ผู้ใช้ปรับตำแหน่ง (ยังไม่อัปโหลดจนกว่าจะกดบันทึก)
  function pickAvatarFile(file: File) {
    if (avatarBusy) return;
    setAvatarError("");
    if (!file.type.startsWith("image/")) {
      setAvatarError("เลือกไฟล์รูปภาพเท่านั้น");
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setAvatarError("รูปใหญ่เกินไป เลือกรูปอื่น");
      return;
    }
    setAvatarDraft(file);
  }

  // อัปโหลดรูปโปรไฟล์ (รูปที่ปรับแล้ว): เซิร์ฟเวอร์ครอปจัตุรัส 512×512 แล้วเก็บลง Drive โฟลเดอร์ profile
  // คืน true เมื่อบันทึกสำเร็จ
  async function uploadAvatarFile(file: File): Promise<boolean> {
    if (avatarBusy) return false;
    setAvatarError("");
    setAvatarBusy(true);
    try {
      const fd = new FormData();
      fd.append("avatar", await shrinkImage(file));
      const res = await fetch("/api/profile/avatar", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        setAvatarDraft(null);
        needLogin("profile");
        return false;
      }
      if (!res.ok) {
        setAvatarError(data.error ?? "อัปโหลดรูปไม่สำเร็จ ลองใหม่อีกครั้ง");
        return false;
      }
      setUser((prev) => (prev ? { ...prev, avatarAt: data.avatarAt as string } : prev));
      return true;
    } catch {
      setAvatarError("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง");
      return false;
    } finally {
      setAvatarBusy(false);
    }
  }

  // กดบันทึกในหน้าต่างปรับรูป: อัปโหลดสำเร็จแล้วค่อยปิดหน้าต่าง
  async function saveAvatarDraft(file: File) {
    const ok = await uploadAvatarFile(file);
    if (ok) setAvatarDraft(null);
  }

  // ลบรูปโปรไฟล์ กลับไปใช้ตัวอักษรย่อ
  async function removeAvatar() {
    if (avatarBusy) return;
    setAvatarBusy(true);
    setAvatarError("");
    const r = await api("/api/profile/avatar", "DELETE");
    setAvatarBusy(false);
    if (!r.ok) {
      if (r.status === 401) return needLogin("profile");
      setAvatarError(r.error);
      return;
    }
    setUser((prev) => (prev ? { ...prev, avatarAt: null } : prev));
  }

  // โปรไฟล์: มีอะไรเปลี่ยนจากข้อมูลบัญชีไหม (ใช้เปิดปุ่มบันทึก / ยกเลิก)
  const profileDirty =
    !!user &&
    (accName.trim() !== user.name ||
      accPhone.replace(/\D/g, "") !== user.phone ||
      (!user.empCode && accEmp.length > 0));
  const profileRows: [string, string][] = [];
  if (user) {
    profileRows.push(["รหัสพนักงาน", user.empCode ?? "ยังไม่ได้ระบุ"]);
    // บริษัท / แผนก (สำนักงานใหญ่) / สาขา (หน้าร้าน) ที่เลือกตอนสมัคร
    const cid = user.companyId ?? null;
    const company = cid ? getCompany(cid) : undefined;
    const dept =
      cid && user.departmentId
        ? departmentsOf(cid).find((d) => d.id === user.departmentId)
        : undefined;
    const branch =
      cid && user.branchId ? branchesOf(cid).find((b) => b.id === user.branchId) : undefined;
    if (company) profileRows.push(["บริษัท", company.name]);
    if (dept) profileRows.push(["แผนก", dept.name]);
    if (branch) profileRows.push(["สาขา", branchFullLabel(branch)]);
  }

  const badges: Badges = { tickets: readyOrders.length };
  // หน้า auth เป็นกรอบเต็มจอของตัวเอง (AuthShell) ไม่แสดงแถบเมนูล่าง
  const showNav = view === "home" || view === "buy" || view === "tickets" || view === "profile";
  const navView: View = view === "pay" || view === "qr" || view === "done" ? "buy" : view;

  const inputCls =
    "mt-1 w-full rounded-xl border border-white/15 bg-[#2a2a2a] px-4 py-3 text-base text-white outline-none focus:border-white/60 focus:ring-2 focus:ring-white/20";

  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(EVENT.place)}`;

  const sheetDef = sheet ? defOf(sheet) : null;
  // ตั๋วทั้งหมดของประเภทนี้ (ทั้งที่ยังไม่ใช้และใช้แล้ว): ยังไม่ใช้ขึ้นก่อน (ถูกรางวัลก่อน) ตั๋วที่ใช้แล้วอยู่ท้าย ค้างอยู่ในหน้าต่างนี้ถาวร
  const sheetOrders = sheet
    ? orders
        .filter((o) => o.ticket === sheet)
        .sort(
          (a, b) =>
            Number(a.used === true) - Number(b.used === true) ||
            Number(b.won === true) - Number(a.won === true),
        )
    : [];
  const sheetReadyCount = sheetOrders.filter((o) => !o.used).length;
  // ตั๋วเข้าซุ้ม: แยกกลุ่ม "ตั๋วเล่นซุ้ม (มีมูลค่า)" กับ "ตั๋วรับตั๋วกระดาษ (ไม่มีมูลค่า)" ให้ชัด กดผิดใบยาก
  const sheetGroups: { key: "value" | "paper" | "all"; list: Order[] }[] =
    sheetDef?.id === "booth"
      ? [
          { key: "value", list: sheetOrders.filter((o) => o.part !== "paper") },
          { key: "paper", list: sheetOrders.filter((o) => o.part === "paper") },
        ]
      : [{ key: "all", list: sheetOrders }];

  // ตั๋วที่เปิดบาร์โค้ดเต็มจออยู่
  const barcodeOrder = barcodeCode ? (orders.find((o) => o.code === barcodeCode) ?? null) : null;

  // ปิดบาร์โค้ดเต็มจออัตโนมัติ: หน้าต่างแสดงตั๋วปิดแล้ว หรือตั๋วใบนั้นถูกสแกนแล้ว (จะขึ้นตราประทับในหน้าต่างแสดงตั๋วแทน)
  useEffect(() => {
    if (!barcodeCode) return;
    if (!sheet || orders.some((o) => o.code === barcodeCode && o.used)) setBarcodeCode(null);
  }, [barcodeCode, sheet, orders]);

  // ระยะเว้นด้านล่างของหน้า: หน้าซื้อ/ชำระเงินมีแถบสรุปยอดติดขอบล่าง ต้องเว้นที่ให้ทั้งมือถือและคอมพิวเตอร์
  // หน้า auth ซ่อน <main> ไว้ (ฟอร์มวาดนอก <main> ทับเต็มจอ)
  const mainPad =
    view === "auth"
      ? "hidden"
      : view === "buy" || view === "pay"
        ? "pb-64 md:pb-48"
        : showNav
          ? "pb-28 md:pb-16"
          : view === "done" || view === "qr"
            ? "pb-10 md:pb-16"
            : "pb-64 md:pb-16";

  return (
    <div
      style={{ touchAction: "pan-x pan-y" }}
      className={`min-h-screen overflow-x-clip bg-[#141414] text-white [color-scheme:dark] [&_button:disabled]:cursor-not-allowed [&_button:not(:disabled)]:cursor-pointer ${appFont.className}`}
    >
      {/* แอนิเมชันกรอบทองวิบวับ + ออร่า (ตั๋วที่ถูกรางวัล + ปุ่มเมนู "ตั๋วของฉัน"), พื้นตั๋ววิบวับตามสีตั๋ว (ไม่มีกรอบ ไม่มีออร่า) และเอฟเฟคตั๋วถูกสแกน (สีเทา + ตราประทับค้างถาวร) */}
      <style>{`
        @keyframes pdGold {
          0% { background-position: 0% 50%; }
          100% { background-position: 200% 50%; }
        }
        @keyframes pdSheen {
          0% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
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
        @keyframes pdPage { from { opacity: 0; } to { opacity: 1; } }
        @keyframes pdRise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
        @keyframes pdPop { 0% { transform: scale(1); } 40% { transform: scale(1.14); } 100% { transform: scale(1); } }
        @keyframes pdBarUp { from { opacity: 0; transform: translateY(28px); } to { opacity: 1; transform: none; } }
        @keyframes pdFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes pdSheetUp { from { opacity: 0; transform: translateY(36px); } to { opacity: 1; transform: none; } }
        @keyframes pdDialogIn { from { opacity: 0; transform: scale(0.94); } to { opacity: 1; transform: none; } }
        .pd-gold-card {
          background: linear-gradient(110deg, #b8860b, #ffe27a, #fff6c9, #ffd54a, #b8860b, #ffe27a, #b8860b);
          background-size: 200% 100%;
          animation: pdGold 2.2s linear infinite;
        }
        .pd-gold-frame {
          background: linear-gradient(110deg, #b8860b, #ffe27a, #fff6c9, #ffd54a, #b8860b, #ffe27a, #b8860b);
          background-size: 200% 100%;
          animation: pdGold 2.2s linear infinite, pdGlow 1.5s ease-in-out infinite;
        }
        .pd-gold-static {
          background: linear-gradient(110deg, #b8860b, #ffe27a, #fff6c9, #ffd54a, #b8860b);
        }
        .pd-land {
          width: 100%;
          height: 100%;
          transform: translate(-50%, -50%);
        }
        @media (orientation: portrait) {
          .pd-land {
            width: 100dvh;
            height: 100dvw;
            transform: translate(-50%, -50%) rotate(90deg);
          }
        }
        .pd-shimmer-blue {
          background: linear-gradient(110deg, #0f1b4d 0%, #0f1b4d 32%, #2c45b8 44%, #8aa4ff 50%, #2c45b8 56%, #0f1b4d 68%, #0f1b4d 100%);
          background-size: 300% 100%;
          animation: pdSheen 3.2s linear infinite;
        }
        .pd-shimmer-red {
          background: linear-gradient(110deg, #6b1d24 0%, #6b1d24 32%, #b83a4b 44%, #ff9fb0 50%, #b83a4b 56%, #6b1d24 68%, #6b1d24 100%);
          background-size: 300% 100%;
          animation: pdSheen 3.2s linear infinite;
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
        .pd-page { animation: pdPage 0.35s ease-out; }
        .pd-rise { animation: pdRise 0.5s cubic-bezier(0.22, 1, 0.36, 1) backwards; animation-delay: calc(var(--i, 0) * 70ms); }
        .pd-pop { animation: pdPop 0.28s ease-out; }
        .pd-bar { animation: pdBarUp 0.45s cubic-bezier(0.22, 1, 0.36, 1) 0.1s backwards; }
        .pd-fade { animation: pdFade 0.25s ease-out; }
        @keyframes pdSlideIn { from { transform: translateY(100%); } to { transform: none; } }
        @keyframes pdSlideOut { from { transform: none; } to { transform: translateY(100%); } }
        @keyframes pdFadeOutBg { from { opacity: 1; } to { opacity: 0; } }
        @keyframes pdDialogOut { from { opacity: 1; transform: none; } to { opacity: 0; transform: scale(0.96) translateY(12px); } }
        .pd-sheet { animation: pdSlideIn 0.45s cubic-bezier(0.32, 0.72, 0, 1); }
        .pd-sheet-out { animation: pdSlideOut 0.3s cubic-bezier(0.4, 0, 1, 1) forwards; }
        .pd-fade-out { animation: pdFadeOutBg 0.3s ease-in forwards; }
        @media (min-width: 768px) {
          .pd-sheet { animation: pdSheetUp 0.4s cubic-bezier(0.22, 1, 0.36, 1); }
          .pd-sheet-out { animation: pdDialogOut 0.25s ease-in forwards; }
        }
        .pd-dialog { animation: pdDialogIn 0.25s cubic-bezier(0.22, 1, 0.36, 1); }
        @media (prefers-reduced-motion: reduce) {
          .pd-page, .pd-rise, .pd-pop, .pd-bar, .pd-fade, .pd-sheet, .pd-dialog, .pd-sheet-out, .pd-fade-out { animation: none; }
          .pd-gold-frame, .pd-gold-card, .pd-shimmer-blue, .pd-shimmer-red, .pd-twinkle, .pd-spark { animation: none; }
          .pd-twinkle, .pd-spark { opacity: 1; }
          .pd-scanned { animation: none; filter: grayscale(1) brightness(0.8); opacity: 0.75; }
          .pd-stamp { animation: none; }
        }
      `}</style>

      {/* พื้นหลังหน้าซื้อตั๋ว: รูปอยู่ด้านบน ติดจอ ไม่เลื่อนตาม ด้านล่างไล่เป็นสีเข้มมาชนรูป */}
      {view === "buy" && (
        <div aria-hidden className="pd-fade pointer-events-none fixed inset-0 z-0 bg-[#141414]">
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

      <main
        key={view}
        className={`pd-page relative z-10 mx-auto w-full max-w-md px-5 pt-6 md:max-w-6xl md:px-8 md:pt-8 ${mainPad}`}
      >
        {/* ===== หน้าหลัก ===== */}
        {view === "home" && (
          <>
            {/* มือถือ: เว้นด้านบนไว้ให้แถบหัว (ข้อความ Home + ปุ่มเข้าสู่ระบบ) อยู่บนพื้นดำ แล้วรูปใหญ่อยู่ต่ำลงมา */}
            <section className="relative -mt-6 ml-[calc(50%-50vw)] w-screen pt-[5.5rem] md:-mt-8 md:pt-6">
              <header className="absolute inset-x-0 top-0 flex items-center justify-between px-5 pt-6 md:hidden">
                <div>
                  <h1 className="text-2xl font-bold leading-none">Home</h1>
                  <p className="mt-1 text-[11px] text-white/60">เงินเดือนออกแล้ว มาเล่นกัน!</p>
                </div>
                {user ? (
                  <button
                    type="button"
                    onClick={() => go("profile")}
                    aria-label="โปรไฟล์"
                    className="rounded-full ring-2 ring-white/20 transition active:scale-95"
                  >
                    <Avatar user={user} className="h-11 w-11 text-base" />
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
                    className="pd-rise block text-left transition duration-300 active:scale-[0.97] md:hover:scale-[1.03]"
                  >
                    {/* ชื่อตั๋ว (ตั๋วที่มีรูป): อยู่เหนือกรอบ */}
                    {t.homeImage && (
                      <p className="px-1 pb-2 text-lg font-bold text-white md:pb-3 md:text-2xl">{t.title}</p>
                    )}
                    <Perforated
                      bg={t.shimmer}
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
                          <p className="text-xl font-extrabold md:text-4xl">
                            {baht(t.price)}
                            <span className="text-xs font-medium"> / ใบ</span>
                          </p>
                          <span
                            className={`hidden h-9 w-9 items-center justify-center rounded-full md:flex md:h-11 md:w-11 ${
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
                // กดที่ตัวตั๋วไม่เปิดหน้าแสดงตั๋ว (หน้าแสดงตั๋วอยู่เฉพาะหน้า "ตั๋วของฉัน")
                return (
                  <div key={t.id} className="pd-rise">
                    {t.homeImage && <p className="px-1 pb-2 text-lg font-bold text-white">{t.title}</p>}
                    <Perforated
                      bg={t.shimmer}
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
                  text="ตั๋วเข้าซุ้ม 1 ใบ = ตั๋วเล่นซุ้ม 2 ใบ (ใบละ ฿50) + ตั๋วรับตั๋วกระดาษ 1 ใบ ใช้ได้เฉพาะวันงานที่ระบุเท่านั้น"
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
                  <p className="text-4xl font-extrabold">
                    <span key={cartTotal} className="pd-pop inline-block">
                      {baht(cartTotal)}
                    </span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={toPay}
                  disabled={cartCount === 0}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#e50914] py-4 text-base font-bold text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-white/15 disabled:text-white/50 md:mt-0 md:w-80 md:shrink-0"
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
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#e50914] py-4 text-base font-bold text-white transition active:scale-[0.98] disabled:opacity-60 md:mt-0 md:w-80 md:shrink-0"
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
              <span className="pd-pop flex h-16 w-16 items-center justify-center rounded-full bg-white text-black">
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
                className="flex-1 rounded-2xl border border-white/40 px-5 py-3.5 font-semibold transition active:scale-[0.98]"
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
                className="flex-1 rounded-2xl bg-[#e50914] px-5 py-3.5 font-semibold text-white transition active:scale-[0.98]"
              >
                ดูตั๋วของฉัน
              </button>
            </div>
          </section>
        )}

        {/* ===== ตั๋วของฉัน ===== */}
        {view === "tickets" && (
          <section aria-label="ตั๋วของฉัน">
            <header>
              <h1 className="text-3xl font-bold">ตั๋วของฉัน</h1>
              <p className="mt-1 text-sm text-white/60">ความสนุกรอบนี้ พร้อมแล้ว!</p>
            </header>

            <div
              role="tablist"
              aria-label="สถานะตั๋ว"
              className="mt-5 grid grid-cols-2 rounded-full border border-white/10 bg-[#1f1f1f] p-1 md:max-w-md"
            >
              {(
                [
                  ["ready", `ตั๋ว (${orders.length})`],
                  ["status", `สถานะ (${pending.length})`],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  onClick={() => setTab(id)}
                  className={`rounded-full px-1 py-2.5 text-sm font-bold transition duration-300 active:scale-95 ${
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
                          className="pd-rise cursor-pointer rounded-2xl border border-dashed border-white/25 bg-[#1f1f1f] p-4 transition duration-300 active:scale-[0.98] md:hover:border-white/40"
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
                {!ready || orders.length === 0 ? (
                  <div className="mt-6 rounded-3xl border border-dashed border-white/20 bg-white/5 p-8 text-center">
                    <p className="text-white/60">ยังไม่มีตั๋ว</p>
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
                      const mine = orders.filter((o) => o.ticket === t.id);
                      if (mine.length === 0) return null;
                      const count = mine.filter((o) => !o.used).length; // ใบที่ยังไม่ใช้
                      const usedCount = mine.length - count; // ใบที่ใช้แล้ว
                      const wonCount = mine.filter((o) => !o.used && o.won).length;
                      // มีตั๋วถูกรางวัล: กรอบทอง + ออร่า + ประกาย + พื้นการ์ดสีทองวิบวับ / ไม่มี: พื้นวิบวับตามสีตั๋ว (ไม่มีกรอบ ไม่มีออร่า)
                      const goldWin = wonCount > 0;

                      // หน้าตาเหมือนหน้า "ซื้อตั๋ว" แต่ไม่มีราคา: ส่วนล่างเป็นจำนวนใบที่เหลือ (+ ใช้แล้วกี่ใบ) + ปุ่มแสดงตั๋ว
                      const card = (
                        <Perforated
                          bg={goldWin ? "pd-gold-card" : t.shimmer}
                          text={goldWin ? "text-[#5a3b00]" : t.fg}
                          dash={goldWin ? "border-[#5a3b00]/30" : t.dash}
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
                                {usedCount > 0 && (
                                  <p className="text-xs font-semibold opacity-70">ใช้แล้ว {usedCount} ใบ</p>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                {wonCount > 0 && (
                                  <span
                                    className={`rounded-full px-3 py-1.5 text-xs font-extrabold ${
                                      goldWin ? "bg-white text-[#5a3b00]" : "pd-gold-frame text-[#5a3b00]"
                                    }`}
                                  >
                                    ถูกรางวัล {wonCount} ใบ
                                  </span>
                                )}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openSheet(t.id);
                                  }}
                                  className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black transition active:scale-[0.96]"
                                >
                                  แสดงตั๋ว
                                </button>
                              </div>
                            </div>
                          }
                        />
                      );

                      return (
                        <div key={t.id} className="pd-rise">
                          {t.homeImage && <p className="px-1 pb-2 text-lg font-bold text-white">{t.title}</p>}
                          {goldWin ? <GoldFrame>{card}</GoldFrame> : card}
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="mt-4 md:mt-6">
                  <InfoBox
                    icon={<IconInfo className="h-5 w-5" />}
                    title="ใช้ตั๋วง่าย ๆ ที่หน้างาน"
                    text="เปิดตั๋ว แล้วให้เจ้าหน้าที่สแกนก่อนร่วมสนุก ตั๋วที่สแกนแล้วจะเป็นสีเทาและมีตราประทับ"
                  />
                </div>
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
                <div className="mt-6 flex flex-col items-center rounded-3xl border border-white/10 bg-[#1f1f1f] p-5 text-center text-white md:col-start-1 md:row-start-1 md:mt-0">
                  <div className="relative">
                    <Avatar user={user} className="h-44 w-44 text-7xl md:h-56 md:w-56 md:text-8xl" />
                    {avatarBusy && !avatarDraft && (
                      <span
                        role="status"
                        className="absolute inset-0 flex items-center justify-center rounded-full bg-black/60 text-sm font-semibold"
                      >
                        กำลังอัปโหลด...
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => avatarInputRef.current?.click()}
                      disabled={avatarBusy}
                      aria-label={user.avatarAt ? "เปลี่ยนรูปโปรไฟล์" : "อัปโหลดรูปโปรไฟล์"}
                      className="absolute bottom-1 right-1 flex h-12 w-12 items-center justify-center rounded-full border-4 border-[#1f1f1f] bg-white text-black shadow-[0_2px_8px_rgba(0,0,0,0.5)] transition active:scale-90 disabled:opacity-60"
                    >
                      <IconCamera className="h-6 w-6" />
                    </button>
                    <input
                      ref={avatarInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="sr-only"
                      tabIndex={-1}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = ""; // เลือกรูปเดิมซ้ำได้
                        if (f) pickAvatarFile(f);
                      }}
                    />
                  </div>
                  {user.avatarAt && (
                    <button
                      type="button"
                      onClick={removeAvatar}
                      disabled={avatarBusy}
                      className="mt-3 rounded-full px-4 py-1.5 text-xs font-semibold text-white/70 transition hover:bg-white/10 active:opacity-60 disabled:opacity-50"
                    >
                      ลบรูปโปรไฟล์
                    </button>
                  )}
                  {avatarError && !avatarDraft && (
                    <p role="alert" className="mt-2 text-sm font-medium text-red-500">
                      {avatarError}
                    </p>
                  )}
                  <p className="mt-3 max-w-full truncate text-lg font-bold md:text-xl">{user.name}</p>
                  <p className="max-w-full truncate text-xs text-white/60 md:text-sm">@{user.username}</p>
                </div>

                <div className="mt-4 rounded-3xl border border-white/10 bg-[#1f1f1f] p-5 md:col-start-2 md:row-span-2 md:row-start-1 md:mt-0 md:p-6">
                  <h2 className="text-lg font-bold">ข้อมูลผู้ซื้อ</h2>
                  <p className="mt-1 text-sm text-white/60">ใช้กรอกข้อมูลให้อัตโนมัติตอนซื้อตั๋ว</p>
                  <dl className="mt-4 divide-y divide-white/10 overflow-hidden rounded-2xl bg-[#2a2a2a] text-sm">
                    {profileRows.map(([label, value]) => (
                      <div key={label} className="flex items-start justify-between gap-4 px-4 py-2.5">
                        <dt className="shrink-0 text-white/60">{label}</dt>
                        <dd className="min-w-0 break-words text-right font-semibold">{value}</dd>
                      </div>
                    ))}
                  </dl>
                  {returnToPay && !user.empCode && (
                    <p role="alert" className="mt-3 rounded-xl bg-amber-100 px-4 py-3 text-sm font-semibold text-amber-800">
                      กรอกรหัสพนักงานก่อนซื้อ Lucky Draw กรอกแล้วแก้ไขภายหลังไม่ได้ บันทึกแล้วระบบพากลับไปชำระเงินต่อ
                    </p>
                  )}
                  <div className="mt-4 space-y-4">
                    <label className="block">
                      <span className="text-sm font-medium">ชื่อที่แสดง</span>
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
                    {/* รหัสพนักงานแสดงในแถวข้อมูลด้านบน แก้ไม่ได้ (กรอกตอนสมัคร) ช่องนี้ขึ้นเฉพาะบัญชีเก่าที่ยังไม่มีรหัส */}
                    {!user.empCode && (
                      <label className="block">
                        <span className="text-sm font-medium">รหัสพนักงาน ({EMP_CODE_LENGTH} หลัก)</span>
                        <input
                          value={accEmp}
                          onChange={(e) => {
                            setAccEmp(e.target.value.replace(/\D/g, "").slice(0, EMP_CODE_LENGTH));
                            setAccSaved(false);
                          }}
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
                    )}
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
                      disabled={!profileDirty || accBusy}
                      className="flex h-14 w-full items-center justify-center rounded-full bg-[#e50914] text-base font-bold text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-white/15 disabled:text-white/50"
                    >
                      {accBusy ? "กำลังบันทึก" : "บันทึก"}
                    </button>
                    {profileDirty && !accBusy && (
                      <button
                        type="button"
                        onClick={resetProfile}
                        className="h-10 w-full rounded-full text-sm font-semibold text-white/70 transition hover:bg-white/10 active:opacity-60"
                      >
                        ยกเลิกการเปลี่ยนแปลง
                      </button>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={logout}
                  className="mt-4 w-full rounded-2xl border border-white/40 py-3.5 font-semibold transition active:scale-[0.98] md:col-start-1 md:row-start-2 md:mt-0"
                >
                  ออกจากระบบ
                </button>
              </div>
            )}
          </section>
        )}
      </main>

      {/* ===== เข้าสู่ระบบ / สมัครสมาชิก =====
          วางนอก <main> เพราะ AuthShell เป็นกรอบเต็มจอ z-50 ต้องชนะแถบเมนู z-40 */}
      {view === "auth" &&
        (authMode === "login" ? (
          <LoginForm
            onAuthed={handleAuthed}
            onSwitch={setAuthMode}
            onBack={() => go(afterAuth === "pay" ? "buy" : "home")}
            subtitle={afterAuth === "pay" ? "เข้าสู่ระบบก่อน เพื่อชำระเงินและรับตั๋ว" : undefined}
          />
        ) : (
          <RegisterForm
            onAuthed={handleAuthed}
            onSwitch={setAuthMode}
            onBack={() => go(afterAuth === "pay" ? "buy" : "home")}
          />
        ))}

      {showNav && <BottomNav view={navView} badges={badges} golden={hasNewWin} onGo={go} />}

      {/* ===== หน้าต่างปรับรูปโปรไฟล์ (ลากขยับ/ซูม แล้วกดบันทึก) ===== */}
      {avatarDraft && (
        <AvatarCropper
          file={avatarDraft}
          busy={avatarBusy}
          error={avatarError}
          onCancel={() => {
            setAvatarDraft(null);
            setAvatarError("");
          }}
          onSave={saveAvatarDraft}
        />
      )}

      {/* ===== popup ยืนยันการยกเลิกรายการโอนเงิน ===== */}
      {cancelTarget && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="cancel-title"
          className="pd-fade fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
          onClick={() => {
            if (!cancelingId) setCancelTarget(null);
          }}
        >
          <div
            className="pd-dialog w-full max-w-sm rounded-3xl bg-[#1f1f1f] p-6 text-center text-white"
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
                className="flex-1 rounded-2xl border border-white/40 py-3 text-sm font-semibold transition active:scale-[0.98] disabled:opacity-60"
              >
                ไม่ยกเลิก
              </button>
              <button
                type="button"
                onClick={() => cancelPayment(cancelTarget.id)}
                disabled={cancelingId !== null}
                className="flex-1 rounded-2xl bg-red-600 py-3 text-sm font-bold text-white transition active:scale-[0.98] disabled:opacity-60"
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
          className={`fixed inset-0 z-50 flex items-end justify-center bg-black/40 md:items-center md:p-6 ${
            sheetClosing ? "pd-fade-out" : "pd-fade"
          }`}
          onClick={closeSheet}
        >
          <div
            className={`max-h-[88vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-[#1f1f1f] p-5 pb-8 text-white md:max-w-3xl md:rounded-3xl md:p-8 ${
              sheetClosing ? "pd-sheet-out" : "pd-sheet"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 id="sheet-title" className="text-xl font-bold">
                {sheetDef.title} · เหลือ {sheetReadyCount}/{sheetOrders.length} ใบ
              </h2>
              <button
                type="button"
                onClick={closeSheet}
                className="rounded-full bg-[#1f1f1f] px-4 py-1.5 text-sm font-semibold"
              >
                ปิด
              </button>
            </div>
            <p className="mt-1 text-xs text-white/60">
              {sheetDef.id === "booth"
                ? "แตะที่ตั๋วเพื่อแสดงบาร์โค้ดเต็มจอ แล้วให้เจ้าหน้าที่สแกนทีละใบ ตั๋วที่สแกนแล้วจะเป็นสีเทาและมีตราประทับ"
                : "แสดงตั๋วนี้ให้เจ้าหน้าที่สแกนที่หน้างาน ตั๋วที่สแกนแล้วจะเป็นสีเทาและมีตราประทับ"}
            </p>

            {sheetGroups.map((g) => {
              if (g.list.length === 0) return null;
              const left = g.list.filter((o) => !o.used).length;
              return (
                <div key={g.key}>
                  {g.key === "value" && (
                    <h3 className="mt-5 flex items-center gap-2 text-base font-bold">
                      <span className="rounded-full bg-[#d9f27a] px-2.5 py-0.5 text-sm font-extrabold text-[#14402c]">
                        {baht(g.list[0].price)}
                      </span>
                      ตั๋วเล่นซุ้ม (มีมูลค่า) · เหลือ {left}/{g.list.length} ใบ
                    </h3>
                  )}
                  {g.key === "paper" && (
                    <h3 className="mt-6 flex items-center gap-2 text-base font-bold">
                      <span className="rounded-full bg-[#b45309] px-2.5 py-0.5 text-sm font-extrabold text-white">
                        ไม่มีมูลค่า
                      </span>
                      ตั๋วรับตั๋วกระดาษ · เหลือ {left}/{g.list.length} ใบ
                    </h3>
                  )}
                  <div className="mt-4 flex flex-col gap-4 md:grid md:grid-cols-2 md:items-start md:gap-6">
                    {g.list.map((o) => (
                      <TicketPass
                        key={o.code}
                        def={sheetDef}
                        order={o}
                        scanned={o.used === true}
                        calm
                        onBarcode={setBarcodeCode}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ===== บาร์โค้ดเต็มจอแนวนอน (แตะตั๋วเข้าซุ้มในหน้าต่างแสดงตั๋ว) ===== */}
      {sheet && barcodeOrder && (
        <BarcodeFullscreen order={barcodeOrder} def={defOf(barcodeOrder.ticket)} onClose={() => setBarcodeCode(null)} />
      )}
    </div>
  );
}