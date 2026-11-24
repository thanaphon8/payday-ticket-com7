"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import {
  ArrowIcon,
  AuthHero,
  AuthShell,
  EyeButton,
  Field,
  postAuth,
  primaryBtn,
} from "./auth-shared";
import type { AuthErrors, AuthFormProps, AuthMode } from "./auth-shared";
import ForgotForm from "./ForgotForm";

export default function LoginForm(props: AuthFormProps) {
  const { onAuthed, onSwitch, onBack, subtitle } = props;
  const [view, setView] = useState<"login" | "forgot">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<AuthErrors>({});
  const [busy, setBusy] = useState(false);

  const edit =
    (key: keyof AuthErrors, set: (v: string) => void) => (v: string) => {
      set(v);
      setErrors((p) => ({ ...p, [key]: undefined, form: undefined }));
    };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;

    const u = username.trim();
    const err: AuthErrors = {};
    if (!u) err.username = "กรอก username";
    if (!password) err.password = "กรอกรหัสผ่าน";
    if (Object.keys(err).length > 0) {
      setErrors(err);
      return;
    }

    setBusy(true);
    setErrors({});
    const r = await postAuth("/api/auth/login", { username: u, password });
    setBusy(false);
    if (!r.ok) {
      setErrors(r.errors);
      return;
    }
    setPassword("");
    onAuthed(r.user);
  };

  if (view === "forgot") {
    return (
      <ForgotForm
        {...props}
        onBack={() => setView("login")}
        onSwitch={(mode: AuthMode) =>
          mode === "login" ? setView("login") : onSwitch(mode)
        }
      />
    );
  }

  return (
    <AuthShell onBack={onBack}>
      <AuthHero
        eyebrow="PAYDAY IS PLAY DAY"
        title="ยินดีต้อนรับกลับมา!"
        subtitle={subtitle ?? "เข้าสู่ระบบเพื่อซื้อและดูตั๋วของคุณ"}
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
          autoComplete="username"
          placeholder="เช่น somchai99"
          error={errors.username}
          plain
          autoFocus
        />
        <Field
          label="รหัสผ่าน"
          value={password}
          onChange={edit("password", setPassword)}
          type={show ? "text" : "password"}
          autoComplete="current-password"
          error={errors.password}
          trailing={<EyeButton show={show} onToggle={() => setShow((v) => !v)} />}
        />

        <div className="-mt-1 px-4 text-right">
          <button
            type="button"
            onClick={() => setView("forgot")}
            className="text-sm font-semibold text-white/70 underline-offset-2 transition hover:text-white hover:underline"
          >
            ลืมรหัสผ่าน?
          </button>
        </div>

        {errors.form && (
          <p role="alert" className="px-4 text-sm font-medium text-red-400">
            {errors.form}
          </p>
        )}

        <button type="submit" disabled={busy} className={primaryBtn}>
          {busy ? "กำลังดำเนินการ..." : "เข้าสู่ระบบ"}
          {!busy && <ArrowIcon className="h-5 w-5" />}
        </button>
      </form>

      <p className="mt-5 pb-[max(2rem,env(safe-area-inset-bottom))] text-center text-sm text-white/70">
        ยังไม่มีบัญชี?{" "}
        <button
          type="button"
          onClick={() => onSwitch("register")}
          className="font-semibold text-white underline-offset-2 hover:underline"
        >
          สมัครสมาชิก
        </button>
      </p>
    </AuthShell>
  );
}