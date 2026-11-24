"use client";

import { useId, useState } from "react";
import type { FormEvent } from "react";
import {
  ArrowIcon,
  AuthHero,
  AuthShell,
  EMP_CODE_LENGTH,
  EMP_CODE_MIN,
  EyeButton,
  Field,
  MIN_PASSWORD,
  digitsOnly,
  primaryBtn,
  validEmp,
} from "./auth-shared";
import type { AuthErrors, AuthFormProps } from "./auth-shared";
import { COMPANIES } from "./departments";

function CompanySelect({
  label,
  value,
  onChange,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
}) {
  const id = useId();
  const msgId = `${id}-msg`;
  return (
    <div>
      <label htmlFor={id} className="block px-4 text-sm font-medium">
        {label}
      </label>
      <div className="relative mt-1">
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? msgId : undefined}
          className={`block h-14 w-full appearance-none rounded-full border bg-[#2a2a2a] pl-5 pr-12 text-base outline-none transition-[border-color,box-shadow] focus:ring-2 ${
            value ? "text-white" : "text-white/40"
          } ${
            error
              ? "border-red-500 focus:border-red-500 focus:ring-red-500/25"
              : "border-white/15 focus:border-white/60 focus:ring-white/20"
          }`}
        >
          <option value="" disabled>
            เลือกบริษัทของคุณ
          </option>
          {COMPANIES.map((c) => (
            <option key={c.id} value={String(c.id)} className="text-white">
              {c.name}
            </option>
          ))}
        </select>
        <svg
          viewBox="0 0 24 24"
          className="pointer-events-none absolute right-5 top-1/2 h-5 w-5 -translate-y-1/2 text-white/60"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </div>
      {error && (
        <p id={msgId} role="alert" className="mt-1 px-4 text-sm font-medium text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

export default function ForgotForm({ onSwitch, onBack }: AuthFormProps) {
  const [username, setUsername] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [empCode, setEmpCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<AuthErrors>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const edit =
    (key: keyof AuthErrors, set: (v: string) => void) => (v: string) => {
      set(v);
      setErrors((p) => ({ ...p, [key]: undefined, form: undefined }));
    };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;

    const err: AuthErrors = {};
    if (!username.trim()) err.username = "กรอก username";
    if (!companyId) err.companyId = "เลือกบริษัทของคุณ";
    if (!validEmp(digitsOnly(empCode)))
      err.empCode = `รหัสพนักงานต้องเป็นตัวเลข ${EMP_CODE_MIN}-${EMP_CODE_LENGTH} หลัก`;
    if (password.length < MIN_PASSWORD)
      err.password = `รหัสผ่านต้องยาวอย่างน้อย ${MIN_PASSWORD} ตัวอักษร`;
    else if (confirm !== password) err.confirm = "รหัสผ่านไม่ตรงกัน";
    if (Object.keys(err).length > 0) {
      setErrors(err);
      return;
    }

    setBusy(true);
    setErrors({});
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          companyId: Number(companyId),
          empCode: digitsOnly(empCode),
          password,
        }),
        cache: "no-store",
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        errors?: AuthErrors;
      };
      if (!res.ok || !data.ok) {
        setErrors(
          data.errors && Object.keys(data.errors).length > 0
            ? data.errors
            : { form: data.error ?? "เกิดข้อผิดพลาด ลองใหม่อีกครั้ง" }
        );
        return;
      }
      setPassword("");
      setConfirm("");
      setDone(true);
    } catch {
      setErrors({ form: "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง" });
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <AuthShell onBack={onBack}>
        <AuthHero
          eyebrow="PAYDAY IS PLAY DAY"
          title="ตั้งรหัสผ่านใหม่แล้ว"
          subtitle="เข้าสู่ระบบด้วยรหัสผ่านใหม่ได้เลย"
        />
        <div className="mt-4 rounded-[2.25rem] border border-white/10 bg-[#1f1f1f] p-6 md:p-7">
          <button type="button" onClick={() => onSwitch("login")} className={primaryBtn}>
            ไปหน้าเข้าสู่ระบบ
            <ArrowIcon className="h-5 w-5" />
          </button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell onBack={onBack}>
      <AuthHero
        eyebrow="PAYDAY IS PLAY DAY"
        title="ลืมรหัสผ่าน"
        subtitle="กรอก username บริษัท และรหัสพนักงาน แล้วตั้งรหัสผ่านใหม่"
      />

      <form
        onSubmit={submit}
        noValidate
        className="mt-4 space-y-4 rounded-[2.25rem] border border-white/10 bg-[#1f1f1f] p-6 md:p-7"
      >
        <Field
          label="Username"
          value={username}
          onChange={edit("username", setUsername)}
          maxLength={20}
          autoComplete="username"
          placeholder="เช่น somchai99"
          error={errors.username}
          plain
          autoFocus
        />
        <CompanySelect
          label="บริษัท"
          value={companyId}
          onChange={edit("companyId", setCompanyId)}
          error={errors.companyId}
        />
        <Field
          label="รหัสพนักงาน"
          value={empCode}
          onChange={edit("empCode", (v) =>
            setEmpCode(digitsOnly(v).slice(0, EMP_CODE_LENGTH))
          )}
          inputMode="numeric"
          autoComplete="off"
          maxLength={EMP_CODE_LENGTH}
          placeholder="เช่น 1234567"
          error={errors.empCode}
          mono
        />
        <Field
          label="รหัสผ่านใหม่"
          value={password}
          onChange={edit("password", setPassword)}
          type={show ? "text" : "password"}
          autoComplete="new-password"
          maxLength={72}
          placeholder={`อย่างน้อย ${MIN_PASSWORD} ตัวอักษร`}
          error={errors.password}
          trailing={<EyeButton show={show} onToggle={() => setShow((v) => !v)} />}
        />
        <Field
          label="ยืนยันรหัสผ่านใหม่"
          value={confirm}
          onChange={edit("confirm", setConfirm)}
          type={show ? "text" : "password"}
          autoComplete="new-password"
          maxLength={72}
          placeholder="พิมพ์รหัสผ่านอีกครั้ง"
          error={errors.confirm}
        />

        {errors.form && (
          <p role="alert" className="px-4 text-sm font-medium text-red-400">
            {errors.form}
          </p>
        )}

        <button type="submit" disabled={busy} className={primaryBtn}>
          {busy ? "กำลังบันทึก..." : "ตั้งรหัสผ่านใหม่"}
          {!busy && <ArrowIcon className="h-5 w-5" />}
        </button>
      </form>

      <p className="mt-5 pb-[max(2rem,env(safe-area-inset-bottom))] text-center text-sm text-white/70">
        <button
          type="button"
          onClick={() => onSwitch("login")}
          disabled={busy}
          className="font-semibold text-white underline-offset-2 hover:underline disabled:opacity-60"
        >
          กลับไปเข้าสู่ระบบ
        </button>
      </p>
    </AuthShell>
  );
}