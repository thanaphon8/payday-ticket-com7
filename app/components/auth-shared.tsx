"use client";

import { useId } from "react";
import type { ReactNode } from "react";

/* ------------------------------------------------------------------ */
/* ค่าคงที่ / ชนิดข้อมูล / ตัวตรวจ ที่ LoginForm และ RegisterForm ใช้ร่วมกัน      */
/* ------------------------------------------------------------------ */

// รหัสพนักงาน: ตัวเลขล้วน 1-7 หลัก (EMP_CODE_LENGTH = จำนวนหลักสูงสุด ต้องตรงกับ lib/tickets.ts)
export const EMP_CODE_MIN = 1;
export const EMP_CODE_LENGTH = 7;
export const MIN_PASSWORD = 6;
export const USERNAME_RE = /^[a-zA-Z0-9._]{3,20}$/;

// empCode = รหัสพนักงานของบัญชี (null = บัญชีเก่าที่ยังไม่เคยกรอก)
// companyId / departmentId / branchId ตั้งตอนสมัครครั้งเดียว (บัญชีเก่าจะไม่มี)
// avatarAt = เวลาอัปโหลดรูปโปรไฟล์ล่าสุด (null/ไม่มี = ยังไม่มีรูป ใช้ตัวอักษรย่อแทน)
export type User = {
  id: string;
  username: string;
  name: string;
  phone: string;
  empCode: string | null;
  companyId?: number | null;
  departmentId?: number | null;
  branchId?: number | null;
  avatarAt?: string | null;
};

export type AuthMode = "login" | "register";

export type AuthErrors = Partial<
  Record<
    | "name"
    | "phone"
    | "empCode"
    | "username"
    | "password"
    | "confirm"
    | "companyId"
    | "departmentId"
    | "branchId"
    | "form",
    string
  >
>;

export type AuthFormProps = {
  onAuthed: (user: User) => void; // สำเร็จแล้วให้หน้าหลักเก็บ user แล้วไปต่อ
  onSwitch: (mode: AuthMode) => void; // สลับไปหน้าเข้าสู่ระบบ / สมัครสมาชิก
  onBack?: () => void; // ปุ่มลูกศรย้อนกลับมุมซ้ายบน
  subtitle?: string; // ข้อความใต้หัวข้อ (เช่น "เข้าสู่ระบบก่อน เพื่อชำระเงินและรับตั๋ว")
};

export const digitsOnly = (s: string) => s.replace(/\D/g, "");

export const validPhone = (p: string) => /^0\d{9}$/.test(p);

export const validEmp = (c: string) =>
  new RegExp(`^\\d{${EMP_CODE_MIN},${EMP_CODE_LENGTH}}$`).test(c);

// ส่ง login / register: สำเร็จคืน user / ล้มเหลวคืน errors (รายช่อง หรือ form)
export async function postAuth(
  url: string,
  body: unknown
): Promise<{ ok: true; user: User } | { ok: false; errors: AuthErrors }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as {
      user?: User;
      errors?: AuthErrors;
      error?: string;
    };
    if (!res.ok || !data.user) {
      if (data.errors && Object.keys(data.errors).length > 0) {
        return { ok: false, errors: data.errors };
      }
      return {
        ok: false,
        errors: { form: data.error ?? "เกิดข้อผิดพลาด ลองใหม่อีกครั้ง" },
      };
    }
    return { ok: true, user: data.user };
  } catch {
    return {
      ok: false,
      errors: { form: "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง" },
    };
  }
}

/* ------------------------------------------------------------------ */
/* ไอคอน                                                                */
/* ------------------------------------------------------------------ */

function Svg({
  children,
  className = "h-5 w-5",
}: {
  children: ReactNode;
  className?: string;
}) {
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

export const BackIcon = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M15 5l-7 7 7 7" />
  </Svg>
);

export const ArrowIcon = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Svg>
);

export const CheckIcon = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Svg>
);

// ปุ่มลูกตา แสดง/ซ่อนรหัสผ่าน (วางใน trailing ของ Field)
export function EyeButton({
  show,
  onToggle,
}: {
  show: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={show ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
      aria-pressed={show}
      className="flex h-10 w-10 items-center justify-center rounded-full text-white/60 transition hover:text-white active:scale-90"
    >
      {show ? (
        <Svg>
          <path d="M3 3l18 18" />
          <path d="M10.6 6.1A10.7 10.7 0 0112 6c6.5 0 10 6 10 6a17 17 0 01-3.2 3.9M6.6 6.6A17 17 0 002 12s3.5 6 10 6a10.6 10.6 0 004.4-.9" />
          <path d="M9.9 9.9a3 3 0 004.2 4.2" />
        </Svg>
      ) : (
        <Svg>
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
        </Svg>
      )}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* ปุ่ม                                                                  */
/* ------------------------------------------------------------------ */

export const primaryBtn =
  "flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#e50914] text-base font-bold text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60";

export const secondaryBtn =
  "flex h-14 shrink-0 items-center justify-center rounded-2xl border border-white/40 px-5 text-[15px] font-semibold text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60";

/* ------------------------------------------------------------------ */
/* กรอบหน้า / หัวการ์ด / ช่องกรอก                                          */
/* ------------------------------------------------------------------ */

// กรอบเต็มจอของหน้าเข้าสู่ระบบ/สมัครสมาชิก (ทับเมนูหลักทั้งหมด)
// หน้าหลักต้องวางไว้นอก <main> เพื่อให้ z-50 ชนะแถบเมนู z-40
export function AuthShell({
  children,
  onBack,
}: {
  children: ReactNode;
  onBack?: () => void;
}) {
  return (
    <div
      style={{ touchAction: "pan-y", overscrollBehaviorX: "none" }}
      className="fixed inset-0 z-50 overflow-x-hidden overflow-y-auto bg-[#141414] text-white [color-scheme:dark]"
    >
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pt-[max(1.25rem,env(safe-area-inset-top))] md:max-w-xl md:px-8">
        <div className="flex h-11 items-center">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              aria-label="ย้อนกลับ"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/10 text-white backdrop-blur-md transition active:scale-90"
            >
              <BackIcon className="h-6 w-6" />
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

// การ์ดสีแดงหัวหน้าเข้าสู่ระบบ
export function AuthHero({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="relative mt-4 overflow-hidden rounded-3xl bg-gradient-to-br from-[#e50914] to-[#7a0a10] p-5 text-white md:p-8">
      <p className="text-[11px] font-bold tracking-wider">{eyebrow}</p>
      <h1 className="mt-2 text-2xl font-bold leading-tight md:text-3xl">{title}</h1>
      {subtitle && <p className="mt-1 text-xs text-white/70 md:text-sm">{subtitle}</p>}
    </div>
  );
}

export function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  error,
  hint,
  maxLength,
  autoComplete,
  autoFocus,
  inputMode,
  mono = false,
  plain = false,
  trailing,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  error?: string;
  hint?: string;
  maxLength?: number;
  autoComplete?: string;
  autoFocus?: boolean;
  inputMode?: "numeric" | "text";
  mono?: boolean; // ฟอนต์ตัวเลขเว้นระยะ (รหัสพนักงาน) ใช้เฉพาะตอนมีตัวเลขที่พิมพ์ ข้อความแนะนำใช้ฟอนต์ปกติ
  plain?: boolean; // ปิดตัวพิมพ์ใหญ่อัตโนมัติ/แก้คำ (username)
  trailing?: ReactNode;
}) {
  const id = useId();
  const msgId = `${id}-msg`;
  return (
    <div>
      <label htmlFor={id} className="block px-4 text-sm font-medium">
        {label}
      </label>
      <div className="relative mt-1">
        <input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          inputMode={inputMode}
          autoCapitalize={plain ? "none" : undefined}
          autoCorrect={plain ? "off" : undefined}
          spellCheck={plain ? false : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? msgId : undefined}
          className={`block h-14 w-full appearance-none rounded-full border bg-[#2a2a2a] px-5 text-base text-white outline-none transition-[border-color,box-shadow] placeholder:text-white/40 focus:ring-2 ${
            error
              ? "border-red-500 focus:border-red-500 focus:ring-red-500/25"
              : "border-white/15 focus:border-white/60 focus:ring-white/20"
          } ${mono && value ? "font-mono tracking-[0.3em]" : ""} ${trailing ? "pr-14" : ""}`}
        />
        {trailing && (
          <div className="absolute inset-y-0 right-2 flex items-center">{trailing}</div>
        )}
      </div>
      {error ? (
        <p id={msgId} role="alert" className="mt-1 px-4 text-sm font-medium text-red-400">
          {error}
        </p>
      ) : hint ? (
        <p id={msgId} className="mt-1 px-4 text-xs text-white/50">
          {hint}
        </p>
      ) : null}
    </div>
  );
}