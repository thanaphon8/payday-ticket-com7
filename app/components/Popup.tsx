"use client";

import { useEffect, useRef, useState } from "react";

// รูปในการ์ด popup (ไฟล์ใน public/img/) กรอบการ์ดจะพอดีกับสัดส่วนรูปเอง
const POPUP_IMG = "/img/popup.png";
const POPUP_ALT = "โปรโมชั่น Payday Park";
// เก็บ "วันที่" ที่ผู้ใช้กดไม่แสดงวันนี้ (พรุ่งนี้จะแสดงอีกครั้ง)
// ถ้าเปลี่ยนรูป/แคมเปญใหม่ ให้เปลี่ยนเลขเวอร์ชัน (v1 → v2) ทุกคนจะเห็น popup อีกครั้งทันที
const HIDE_KEY = "payday-popup-hide-v1";
const CLOSE_MS = 320; // ระยะเวลาเอฟเฟคตอนปิด (ต้องตรงกับ animation ใน <style> ด้านล่าง)

// วันที่วันนี้ตามเวลาไทย รูปแบบ YYYY-MM-DD (เปลี่ยนวันตอนเที่ยงคืนเวลาไทย)
const todayTH = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });

export default function Popup({ onOpen }: { onOpen: () => void }) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [dontShow, setDontShow] = useState(false);
  const closingRef = useRef(false);

  // แสดงตอนเข้าเว็บ ยกเว้นวันนี้ผู้ใช้เคยติ๊ก "ไม่แสดงวันนี้" แล้ว
  useEffect(() => {
    try {
      if (localStorage.getItem(HIDE_KEY) !== todayTH()) setOpen(true);
    } catch {
      setOpen(true);
    }
  }, []);

  // ปิดแบบนุ่มนวล: เล่นเอฟเฟคก่อน แล้วค่อยถอดออกจากหน้า (after = ทำต่อหลังปิดเสร็จ)
  const close = (after?: () => void) => {
    if (closingRef.current) return;
    closingRef.current = true;
    if (dontShow) {
      try {
        localStorage.setItem(HIDE_KEY, todayTH());
      } catch {
        /* ignore */
      }
    }
    setClosing(true);
    setTimeout(() => {
      setOpen(false);
      setClosing(false);
      after?.();
    }, CLOSE_MS);
  };

  // กด Esc ปิด (คอมพิวเตอร์)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, dontShow]);

  if (!open) return null;

  const goBuy = () => close(onOpen);

  return (
    <>
      <style>{`
        @keyframes pdPopBgIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes pdPopBgOut { from { opacity: 1; } to { opacity: 0; } }
        @keyframes pdPopCardIn {
          from { opacity: 0; transform: translateY(24px) scale(0.94); }
          to { opacity: 1; transform: none; }
        }
        @keyframes pdPopCardOut {
          from { opacity: 1; transform: none; }
          to { opacity: 0; transform: translateY(18px) scale(0.94); }
        }
        .pd-popup-bg-in { animation: pdPopBgIn 0.3s ease-out both; }
        .pd-popup-bg-out { animation: pdPopBgOut ${CLOSE_MS}ms ease-in forwards; }
        .pd-popup-card-in { animation: pdPopCardIn 0.4s cubic-bezier(0.22, 1, 0.36, 1) both; }
        .pd-popup-card-out { animation: pdPopCardOut ${CLOSE_MS}ms cubic-bezier(0.4, 0, 1, 1) forwards; }
        @media (prefers-reduced-motion: reduce) {
          .pd-popup-bg-in, .pd-popup-card-in { animation: none; }
          .pd-popup-bg-out, .pd-popup-card-out { animation-duration: 1ms; }
        }
      `}</style>

      <div
        role="dialog"
        aria-modal="true"
        aria-label="ประกาศ"
        onClick={() => close()}
        className={`${
          closing ? "pd-popup-bg-out" : "pd-popup-bg-in"
        } fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-5`}
      >
        <div
          className={closing ? "pd-popup-card-out" : "pd-popup-card-in"}
          onClick={(e) => e.stopPropagation()}
        >
          {/* การ์ด: กรอบพอดีกับรูป (ความกว้างคงที่ ความสูงตามสัดส่วนรูป) แตะที่การ์ด = ไปหน้าซื้อตั๋ว */}
          <div
            role="button"
            tabIndex={0}
            aria-label="ไปหน้าซื้อตั๋ว"
            onClick={goBuy}
            onKeyDown={(e) => {
              if (e.target !== e.currentTarget) return;
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                goBuy();
              }
            }}
            className="relative block w-[min(20rem,calc(100vw-2.5rem))] cursor-pointer overflow-hidden rounded-3xl shadow-[0_12px_40px_rgba(0,0,0,0.6)] ring-1 ring-white/15 transition active:scale-[0.98]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={POPUP_IMG}
              alt={POPUP_ALT}
              draggable={false}
              className="block h-auto max-h-[calc(100dvh-2.5rem)] w-full select-none bg-[#1f1f1f] object-contain"
            />

            {/* ช่อง "ไม่แสดงวันนี้" อยู่ในการ์ด กึ่งกลางด้านล่าง (แตะที่ช่องนี้ไม่ไปหน้าซื้อตั๋ว) */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center bg-gradient-to-t from-black/80 via-black/40 to-transparent px-4 pb-3 pt-10">
              <label
                onClick={(e) => e.stopPropagation()}
                className="pointer-events-auto flex cursor-pointer select-none items-center gap-2 rounded-full bg-black/50 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm"
              >
                <input
                  type="checkbox"
                  checked={dontShow}
                  onChange={(e) => setDontShow(e.target.checked)}
                  className="h-4 w-4 cursor-pointer accent-[#e50914]"
                />
                ไม่แสดงวันนี้
              </label>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}