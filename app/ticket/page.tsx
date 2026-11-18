"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Prompt } from "next/font/google";

const appFont = Prompt({ subsets: ["thai", "latin"], weight: ["400", "500", "600", "700", "800"] });

type Gate = "loading" | "locked" | "ok";
type ResultKind = "ok" | "duplicate" | "wrong_type" | "invalid";
type ScanResult = { result: ResultKind; code: string; name?: string; phone?: string; usedAt?: string };
type HistoryRow = { code: string; result: ResultKind; name?: string; at: string };

const COOLDOWN_MS = 4000; // รหัสเดิมยิงซ้ำภายในกี่ ms ให้ข้าม (กันกล้องอ่านซ้ำรัว ๆ)
const OK_DISMISS_MS = 1800; // ผลสำเร็จปิดเองกี่ ms (ผลไม่สำเร็จต้องกดปิดเอง)

const META: Record<ResultKind, { title: string; sub: string; bg: string }> = {
  ok: { title: "ผ่าน", sub: "ตัดตั๋วแล้ว", bg: "bg-green-600" },
  duplicate: { title: "ตั๋วนี้ใช้แล้ว", sub: "ห้ามให้ผ่าน", bg: "bg-red-600" },
  wrong_type: { title: "ไม่ใช่ตั๋วเข้าซุ้ม", sub: "ตั๋วประเภทนี้ยิงที่นี่ไม่ได้", bg: "bg-amber-500" },
  invalid: { title: "ไม่พบตั๋ว", sub: "รหัสไม่ถูกต้อง", bg: "bg-red-600" },
};

const fmt = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "-";

function tone(ok: boolean) {
  try {
    const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new C();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = ok ? 880 : 220;
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (ok ? 0.25 : 0.7));
    osc.start();
    osc.stop(ctx.currentTime + (ok ? 0.25 : 0.7));
  } catch {
    /* เบราว์เซอร์ไม่อนุญาตเสียง ข้ามได้ */
  }
  try {
    navigator.vibrate?.(ok ? 80 : [200, 100, 200]);
  } catch {
    /* ไม่รองรับการสั่น ข้ามได้ */
  }
}

export default function TicketScanPage() {
  const [gate, setGate] = useState<Gate>("loading");
  const [pw, setPw] = useState("");
  const [pwErr, setPwErr] = useState("");
  const [pwBusy, setPwBusy] = useState(false);

  const [result, setResult] = useState<ScanResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [camErr, setCamErr] = useState("");
  const [manual, setManual] = useState("");
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [okCount, setOkCount] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const busyRef = useRef(false);
  const resultRef = useRef<ScanResult | null>(null);
  const lastRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const scanRef = useRef<(raw: string) => void>(() => {});

  // เช็กว่าปลดล็อกอยู่แล้วหรือยัง (cookie 12 ชั่วโมง)
  useEffect(() => {
    fetch("/api/ticket/login", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { unlocked?: boolean }) => setGate(d.unlocked ? "ok" : "locked"))
      .catch(() => setGate("locked"));
  }, []);

  const showResult = useCallback((r: ScanResult | null) => {
    resultRef.current = r;
    setResult(r);
  }, []);

  const dismiss = useCallback(() => {
    lastRef.current.at = Date.now(); // เริ่มนับ cooldown ใหม่จากตอนปิด
    showResult(null);
  }, [showResult]);

  const submit = useCallback(
    async (raw: string) => {
      const code = raw.trim().toUpperCase();
      if (!code || busyRef.current || resultRef.current) return;
      const now = Date.now();
      if (lastRef.current.code === code && now - lastRef.current.at < COOLDOWN_MS) return;
      lastRef.current = { code, at: now };

      busyRef.current = true;
      setBusy(true);
      setNote("");
      try {
        const res = await fetch("/api/ticket/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        });
        if (res.status === 401) {
          setGate("locked");
          return;
        }
        const data = (await res.json().catch(() => ({}))) as Partial<ScanResult> & { error?: string };
        if (!res.ok || !data.result) {
          // ยิงไม่ถึงเซิร์ฟเวอร์/ผิดพลาด: ให้ยิงซ้ำได้ทันที
          lastRef.current = { code: "", at: 0 };
          setNote(data.error ?? "ยิงไม่สำเร็จ ลองใหม่อีกครั้ง");
          return;
        }
        const r: ScanResult = { result: data.result, code: data.code ?? code, name: data.name, phone: data.phone, usedAt: data.usedAt };
        showResult(r);
        tone(r.result === "ok");
        if (r.result === "ok") setOkCount((n) => n + 1);
        setHistory((h) => [{ code: r.code, result: r.result, name: r.name, at: new Date().toISOString() }, ...h].slice(0, 8));
      } catch {
        lastRef.current = { code: "", at: 0 };
        setNote("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง");
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [showResult],
  );
  scanRef.current = submit;

  // ผลสำเร็จปิดเอง ส่วนผลไม่สำเร็จรอให้เจ้าหน้าที่กดปิด
  useEffect(() => {
    if (result?.result !== "ok") return;
    const t = setTimeout(dismiss, OK_DISMISS_MS);
    return () => clearTimeout(t);
  }, [result, dismiss]);

  // เปิดกล้องหลังจากปลดล็อก: อ่านเฉพาะ Code128
  useEffect(() => {
    if (gate !== "ok") return;
    let cancelled = false;
    let controls: { stop: () => void } | null = null;

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setCamErr("เปิดกล้องไม่ได้ ต้องเปิดเว็บผ่าน HTTPS (หรือ localhost) และใช้เบราว์เซอร์ที่รองรับกล้อง");
          return;
        }
        const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
          import("@zxing/browser"),
          import("@zxing/library"),
        ]);
        const hints = new Map<import("@zxing/library").DecodeHintType, unknown>();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_128]);
        hints.set(DecodeHintType.TRY_HARDER, true);

        const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 80 });
        const video = videoRef.current;
        if (!video) return;
        const c = await reader.decodeFromConstraints(
          { audio: false, video: { facingMode: { ideal: "environment" } } },
          video,
          (res) => {
            if (res) scanRef.current(res.getText());
          },
        );
        if (cancelled) c.stop();
        else controls = c;
      } catch (e) {
        const name = e instanceof Error ? e.name : "";
        setCamErr(
          name === "NotAllowedError"
            ? "ไม่ได้อนุญาตใช้กล้อง กดอนุญาตในเบราว์เซอร์แล้วโหลดหน้านี้ใหม่"
            : "เปิดกล้องไม่สำเร็จ ใช้ช่องกรอกรหัสด้านล่างแทนได้",
        );
      }
    })();

    return () => {
      cancelled = true;
      controls?.stop();
    };
  }, [gate]);

  async function unlock(e: FormEvent) {
    e.preventDefault();
    if (!pw || pwBusy) return;
    setPwBusy(true);
    setPwErr("");
    try {
      const res = await fetch("/api/ticket/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setPwErr(data.error ?? "เข้าสู่ระบบไม่สำเร็จ");
      else {
        setPw("");
        setGate("ok");
      }
    } catch {
      setPwErr("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้");
    }
    setPwBusy(false);
  }

  async function lock() {
    await fetch("/api/ticket/login", { method: "DELETE" }).catch(() => {});
    showResult(null);
    setHistory([]);
    setOkCount(0);
    setGate("locked");
  }

  const shell = `min-h-screen bg-[#141414] text-white [color-scheme:dark] ${appFont.className}`;
  const inputCls =
    "min-h-12 w-full rounded-xl border border-white/15 bg-[#2a2a2a] px-4 py-3 text-base text-white outline-none focus:border-white/60 focus:ring-2 focus:ring-white/20";

  if (gate !== "ok") {
    return (
      <div className={shell}>
        <main className="mx-auto max-w-md px-5 py-16 text-center">
          <h1 className="text-2xl font-bold">สแกนตั๋วเข้างาน</h1>
          {gate === "loading" ? (
            <p className="mt-3 text-sm text-white/60">กำลังโหลด...</p>
          ) : (
            <>
              <p className="mt-3 text-sm text-white/60">กรอกรหัสผ่านเจ้าหน้าที่เพื่อเริ่มสแกน</p>
              <form onSubmit={unlock} className="mt-5">
                <input
                  type="password"
                  value={pw}
                  onChange={(e) => setPw(e.target.value)}
                  placeholder="รหัสผ่านเจ้าหน้าที่"
                  autoComplete="current-password"
                  autoFocus
                  maxLength={200}
                  className={inputCls}
                />
                {pwErr && (
                  <p role="alert" className="mt-3 text-sm font-medium text-red-500">
                    {pwErr}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={pwBusy || pw.length === 0}
                  className="mt-4 min-h-12 w-full rounded-2xl bg-[#e50914] py-3 text-sm font-bold text-white disabled:opacity-60"
                >
                  {pwBusy ? "กำลังตรวจสอบ..." : "เข้าสู่หน้าสแกน"}
                </button>
              </form>
            </>
          )}
        </main>
      </div>
    );
  }

  const meta = result ? META[result.result] : null;

  return (
    <div className={shell}>
      <main className="mx-auto w-full max-w-md px-4 pb-10 pt-5 md:max-w-2xl">
        <header className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">สแกนตั๋วเข้างาน</h1>
            <p className="mt-0.5 text-xs text-white/60">ผ่านแล้วรอบนี้ {okCount} ใบ</p>
          </div>
          <button
            type="button"
            onClick={lock}
            className="min-h-11 rounded-full border border-white/40 px-5 py-2.5 text-sm font-bold"
          >
            ล็อก
          </button>
        </header>

        <div className="relative mt-4 aspect-[4/3] w-full overflow-hidden rounded-3xl border border-white/10 bg-black">
          <video ref={videoRef} muted playsInline className="h-full w-full object-cover" />
          <div aria-hidden className="pointer-events-none absolute inset-x-[8%] top-1/2 h-[34%] -translate-y-1/2 rounded-2xl border-2 border-white/70" />
          {camErr && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-6 text-center text-sm text-white/80">
              {camErr}
            </div>
          )}
          {busy && (
            <div className="absolute inset-x-0 bottom-0 bg-black/60 py-2 text-center text-sm font-semibold">กำลังตรวจสอบ...</div>
          )}
        </div>
        <p className="mt-2 text-center text-xs text-white/50">เล็งบาร์โค้ดในตั๋วให้อยู่ในกรอบ</p>

        {note && (
          <p role="alert" className="mt-3 text-center text-sm font-medium text-red-500">
            {note}
          </p>
        )}

        <form
          className="mt-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit(manual);
            setManual("");
          }}
        >
          <input
            value={manual}
            onChange={(e) => setManual(e.target.value.toUpperCase())}
            placeholder="หรือกรอกรหัสตั๋ว PD-BT-XXXXXXXX"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            maxLength={30}
            className={`${inputCls} font-mono text-sm`}
          />
          <button
            type="submit"
            disabled={busy || manual.trim().length === 0}
            className="min-h-12 shrink-0 rounded-xl bg-[#e50914] px-5 text-sm font-bold text-white disabled:opacity-50"
          >
            ตรวจ
          </button>
        </form>

        {history.length > 0 && (
          <section aria-label="ประวัติล่าสุด" className="mt-6">
            <h2 className="text-sm font-bold text-white/70">ยิงล่าสุด (เครื่องนี้)</h2>
            <ul className="mt-2 flex flex-col gap-2">
              {history.map((h, i) => (
                <li key={`${h.code}-${h.at}-${i}`} className="flex items-center justify-between gap-3 rounded-2xl bg-[#1f1f1f] px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-xs font-bold">{h.code}</p>
                    <p className="truncate text-xs text-white/50">{h.name ?? "-"}</p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${
                      h.result === "ok" ? "bg-green-600 text-white" : h.result === "wrong_type" ? "bg-amber-500 text-black" : "bg-red-600 text-white"
                    }`}
                  >
                    {META[h.result].title}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      {result && meta && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-live="assertive"
          onClick={dismiss}
          className={`fixed inset-0 z-50 flex flex-col items-center justify-center px-6 text-center text-white ${meta.bg}`}
        >
          <p className="text-5xl font-extrabold md:text-6xl">{meta.title}</p>
          <p className="mt-2 text-lg font-semibold">{meta.sub}</p>
          {result.name && (
            <p className="mt-6 text-xl font-bold">
              {result.name}
              {result.phone ? ` · ${result.phone}` : ""}
            </p>
          )}
          <p className="mt-2 break-all font-mono text-sm opacity-90">{result.code}</p>
          {result.result === "duplicate" && result.usedAt && (
            <p className="mt-2 text-sm font-semibold">ยิงครั้งแรกเมื่อ {fmt(result.usedAt)}</p>
          )}
          <button
            type="button"
            onClick={dismiss}
            className="mt-8 min-h-12 rounded-full bg-white px-8 py-3 text-base font-bold text-black"
          >
            สแกนต่อ
          </button>
        </div>
      )}
    </div>
  );
}