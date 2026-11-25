"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { User } from "./auth-shared";

// โลโก้แถบเมนูบนคอมพิวเตอร์ (ไฟล์ใน public/img/)
const LOGO_IMG = "/img/com7logo.png";

export type View = "home" | "buy" | "pay" | "qr" | "done" | "tickets" | "profile" | "auth";

/* ---------- ไอคอน ---------- */
export function Icon({ children, className = "h-6 w-6" }: { children: ReactNode; className?: string }) {
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

export type IconProps = { className?: string };

const IconHome = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M3 11l9-8 9 8" />
    <path d="M5 10v10h14V10" />
  </Icon>
);
export const IconTicket = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M3 9a2 2 0 0 0 0 6v3a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-3a2 2 0 0 1 0-6V6a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1z" />
    <path d="M13 5v2M13 11v2M13 17v2" />
  </Icon>
);
export const IconGift = ({ className }: IconProps) => (
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
export const IconSpark = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M12 3c.6 4.8 2.2 6.4 7 7-4.8.6-6.4 2.2-7 7-.6-4.8-2.2-6.4-7-7 4.8-.6 6.4-2.2 7-7z" />
    <path d="M19 16c.2 1.6.8 2.2 2 2.4-1.2.2-1.8.8-2 2.4-.2-1.6-.8-2.2-2-2.4 1.2-.2 1.8-.8 2-2.4z" />
  </Icon>
);

// รูปโปรไฟล์วงกลม: มีรูป (user.avatarAt) แสดงรูปจาก /api/avatar/[id] / ไม่มีหรือโหลดไม่ได้ แสดงตัวอักษรย่อ
// className = ขนาด + ขนาดตัวอักษร (เช่น "h-8 w-8 text-sm") / fallbackCls = สีพื้นและตัวอักษรของวงกลมตัวอักษรย่อ
export function Avatar({
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

/* ---------- เมนูหลัก ---------- */
export type Badges = Partial<Record<View, number>>;

const NAV: { id: View; label: string; icon: ReactNode }[] = [
  { id: "home", label: "หน้าหลัก", icon: <IconHome /> },
  { id: "buy", label: "ซื้อตั๋ว", icon: <IconTicket /> },
  { id: "tickets", label: "ตั๋วของฉัน", icon: <IconGift /> },
  { id: "profile", label: "โปรไฟล์", icon: <IconUser /> },
];

// เอฟเฟคแถบล่างมือถือ (ลื่นไหลแบบ iOS 26 + ย่อตอนเลื่อน)
const BOTTOM_NAV_CSS = `
@keyframes pd-wave-flow {
  0%   { background-position: 200% 0; }
  100% { background-position: -100% 0; }
}
@keyframes pd-wave-drift {
  0%   { transform: translate3d(-12%, 0, 0) scale(1); }
  50%  { transform: translate3d(12%, 0, 0) scale(1.15); }
  100% { transform: translate3d(-12%, 0, 0) scale(1); }
}
@keyframes pd-liquid {
  0%   { transform: scale(1, 1); }
  30%  { transform: scale(1.28, 0.88); }
  60%  { transform: scale(0.94, 1.08); }
  100% { transform: scale(1, 1); }
}
.pd-wave-sheen {
  background: linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.28) 48%, rgba(255,255,255,0.08) 58%, transparent 72%);
  background-size: 250% 100%;
  animation: pd-wave-flow 5.5s linear infinite;
  mix-blend-mode: soft-light;
}
.pd-wave-blob {
  background: radial-gradient(ellipse at center, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 70%);
  animation: pd-wave-drift 7s ease-in-out infinite;
  filter: blur(6px);
}
.pd-liquid-pill { animation: pd-liquid 0.6s cubic-bezier(0.34, 1.56, 0.64, 1); }
@media (prefers-reduced-motion: reduce) {
  .pd-wave-sheen, .pd-wave-blob, .pd-liquid-pill { animation: none; }
}
`;

// ย่อแถบเมื่อผู้ใช้เลื่อนหน้าจอขึ้น (เนื้อหาเลื่อนลง/scrollTop เพิ่ม) แล้วคืนขนาดเมื่อหยุดเลื่อน หรือเลื่อนกลับลง
// ฟังแบบ capture เพื่อรองรับทั้ง window และ container ภายในที่เลื่อนเอง
function useShrinkOnScroll() {
  const [shrunk, setShrunk] = useState(false);

  useEffect(() => {
    const last = new Map<EventTarget, number>();
    let timer: number | undefined;

    const clear = () => {
      if (timer !== undefined) {
        window.clearTimeout(timer);
        timer = undefined;
      }
    };

    const onScroll = (e: Event) => {
      const t = e.target;
      if (!t) return;
      const y =
        t instanceof Element
          ? t.scrollTop
          : window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
      const prev = last.get(t) ?? y;
      last.set(t, y);
      const d = y - prev;

      if (d > 1 && y > 8) {
        setShrunk(true);
        clear();
        timer = window.setTimeout(() => setShrunk(false), 1000);
      } else if (d < -1 || y <= 8) {
        clear();
        setShrunk(false);
      }
    };

    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      clear();
    };
  }, []);

  return shrunk;
}

// มือถือ: แถบล่างลอย ธีมเดียวกับแอป (พื้นดำ #1f1f1f ขอบบาง ปุ่มที่เลือกเป็นแดง #e50914) ซ่อนบนจอ md ขึ้นไป
// golden = มีตั๋วถูกรางวัลที่ผู้ใช้ยังไม่เคยเปิดดู: ปุ่ม "ตั๋วของฉัน" เป็นสีทองวิบวับ จนกว่าจะกดเข้าไปดู
export function BottomNav({
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
  const shrunk = useShrinkOnScroll();
  const activeIndex = NAV.findIndex((n) => n.id === view);

  return (
    <nav
      aria-label="เมนูหลัก"
      className="pointer-events-none fixed inset-x-4 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-40 md:hidden"
    >
      <style>{BOTTOM_NAV_CSS}</style>
      <div
        className="pointer-events-auto relative overflow-hidden rounded-full border border-white/15 bg-white/10 shadow-[0_10px_30px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-2xl backdrop-saturate-150 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] will-change-transform supports-[not(backdrop-filter:blur(1px))]:bg-[#2a2a2a]"
        style={{ transform: shrunk ? "scale(0.6)" : "scale(1)", transformOrigin: "50% 100%" }}
      >
        {/* คลื่นแสงไหลบนกระจก */}
        <span aria-hidden className="pd-wave-sheen pointer-events-none absolute inset-0 rounded-full" />
        <span aria-hidden className="pd-wave-blob pointer-events-none absolute -inset-y-2 left-0 w-1/2 rounded-full" />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/50 to-transparent"
        />

        {/* แถบสีแดงที่เลื่อนไหลตามเมนูที่เลือก */}
        <div aria-hidden className="pointer-events-none absolute inset-1.5">
          <div
            className="h-full transition-[transform,opacity] duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
            style={{
              width: "calc((100% - 0.75rem) / 4)",
              transform: `translateX(calc(${Math.max(activeIndex, 0)} * (100% + 0.25rem)))`,
              opacity: activeIndex >= 0 ? 1 : 0,
            }}
          >
            <div
              key={activeIndex}
              className="pd-liquid-pill h-full w-full rounded-full bg-[#e50914] shadow-[0_4px_14px_rgba(229,9,20,0.45),inset_0_1px_0_rgba(255,255,255,0.3)]"
            />
          </div>
        </div>

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
                  className={`relative z-10 flex w-full flex-col items-center gap-0.5 rounded-full px-1 py-2 transition duration-300 active:scale-95 ${
                    active ? "text-white" : gold ? "pd-gold-frame text-[#5a3b00]" : "text-white/60"
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
export function TopNav({
  view,
  badges,
  golden,
  user,
  ready,
  tagline,
  onGo,
  onLogin,
}: {
  view: View;
  badges: Badges;
  golden: boolean;
  user: User | null;
  ready: boolean;
  tagline: string;
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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO_IMG} alt="" aria-hidden className="block h-10 w-auto shrink-0 object-contain" />
          <span>
            <span className="block text-xl font-bold lowercase leading-none">payday</span>
            <span className="mt-1 block text-[11px] text-white/60">{tagline}</span>
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