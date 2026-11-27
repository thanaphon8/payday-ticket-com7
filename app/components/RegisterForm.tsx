"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FocusEvent, FormEvent, KeyboardEvent, Ref } from "react";
import {
  ArrowIcon,
  AuthShell,
  CheckIcon,
  EMP_CODE_LENGTH,
  EMP_CODE_MIN,
  EyeButton,
  Field,
  MIN_PASSWORD,
  USERNAME_RE,
  digitsOnly,
  postAuth,
  primaryBtn,
  secondaryBtn,
  validEmp,
  validPhone,
} from "./auth-shared";
import type { AuthErrors, AuthFormProps } from "./auth-shared";
import { COMPANIES, departmentsOf, getCompany } from "./departments";
import { Icon } from "./Navbar";
import type { IconProps } from "./Navbar";

/* ------------------------------------------------------------------ */
/* ค่าคงที่ / ตัวช่วย                                                    */
/* ------------------------------------------------------------------ */

// ลำดับขั้น: 0 ข้อมูลของคุณ → 1 บริษัท → 2 แผนก (สำนักงานใหญ่) → 3 บัญชี → 4 รูปโปรไฟล์
const STEPS = ["ข้อมูลของคุณ", "บริษัท", "แผนก", "บัญชี", "รูปโปรไฟล์"] as const;
// ข้อความใต้วงกลมแต่ละขั้น
const STEP_LABELS = [
  "กรอกข้อมูล",
  "เลือกบริษัท",
  "เลือกแผนก",
  "ตั้งรหัสผ่าน",
  "รูปโปรไฟล์",
] as const;
const LAST_STEP = STEPS.length - 1; // 4 = ขั้นรูปโปรไฟล์ (กดสมัครที่ขั้นนี้)

// รายการเลือก (บริษัท / แผนก ใช้โครงเดียวกัน)
type Item = { id: number; label: string; sub?: string };

const fold = (s: string) => s.toLowerCase().replace(/\s+/g, "");

// ตัวอักษรของ q เรียงอยู่ใน h ตามลำดับ (พิมพ์ย่อก็เจอ เช่น "acc" → "accounting")
const isSubseq = (q: string, h: string) => {
  let i = 0;
  for (const c of h) if (c === q[i] && ++i === q.length) return true;
  return false;
};

// คะแนนความใกล้เคียง: 0 ขึ้นต้นตรง, 1 มีคำนี้อยู่ข้างใน, 2 พิมพ์ย่อ, -1 ไม่ตรง
function matchScore(q: string, texts: string[]): number {
  let best = -1;
  for (const raw of texts) {
    const h = fold(raw);
    let s = -1;
    if (h.startsWith(q)) s = 0;
    else if (h.includes(q)) s = 1;
    else if (q.length >= 2 && isSubseq(q, h)) s = 2;
    if (s >= 0 && (best < 0 || s < best)) best = s;
  }
  return best;
}

// กรอง + เรียงรายการตามที่พิมพ์ (ใกล้เคียงที่สุดขึ้นก่อน)
function searchItems(query: string, list: Item[]): Item[] {
  const q = fold(query);
  if (!q) return list;
  return list
    .map((x) => ({ x, s: matchScore(q, [x.label, x.sub ?? ""]) }))
    .filter((r) => r.s >= 0)
    .sort((a, b) => a.s - b.s || a.x.label.length - b.x.label.length)
    .map((r) => r.x);
}

// step ที่มี error ของฟิลด์นั้นอยู่ (ไว้เด้งกลับไปแก้เมื่อเซิร์ฟเวอร์ตีกลับ)
const stepOfErrors = (e: AuthErrors): number | null =>
  e.name || e.phone || e.empCode
    ? 0
    : e.companyId
      ? 1
      : e.departmentId
        ? 2
        : e.username || e.password || e.confirm
          ? 3
          : null;

// ตรวจว่าคีย์บอร์ดมือถือเปิดอยู่ไหม (visualViewport หดลงมาก)
function useKeyboardOpen() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    let maxH = vv.height;
    let lastW = vv.width;
    const check = () => {
      // หมุนจอ/เปลี่ยนความกว้าง = รีเซ็ตค่าฐาน
      if (vv.width !== lastW) {
        lastW = vv.width;
        maxH = vv.height;
      }
      if (vv.height > maxH) maxH = vv.height;
      setOpen(maxH - vv.height > 120);
    };
    vv.addEventListener("resize", check);
    return () => vv.removeEventListener("resize", check);
  }, []);
  return open;
}

/* ------------------------------------------------------------------ */
/* รูปโปรไฟล์ (ใช้ร่วมกับหน้าโปรไฟล์ใน page.tsx)                            */
/* ------------------------------------------------------------------ */

const IconMinus = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M5 12h14" />
  </Icon>
);
const IconPlus = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);
const IconCamera = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
    <circle cx="12" cy="13" r="3.5" />
  </Icon>
);

// ย่อรูปใหญ่ก่อนส่ง (ส่งไวขึ้น + กันไฟล์ใหญ่เกินลิมิตของโฮสต์) รูปเล็กอยู่แล้วส่งตามเดิม
// 1600px ยังอ่าน QR บนสลิปได้ชัด
export async function shrinkImage(file: File): Promise<File> {
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

// อัปโหลดรูปโปรไฟล์หลังสมัครสำเร็จ (ล้มเหลวก็ไม่เป็นไร ตั้งทีหลังที่หน้าโปรไฟล์ได้)
async function uploadAvatar(file: File) {
  try {
    const fd = new FormData();
    fd.append("avatar", await shrinkImage(file));
    await fetch("/api/profile/avatar", { method: "POST", body: fd });
  } catch {
    /* ignore */
  }
}

/* ---------- ปรับรูปโปรไฟล์ก่อนบันทึก ----------
   เลือกรูปแล้วเปิดหน้าต่างนี้: ลากรูปเพื่อขยับ / เลื่อนแถบหรือหมุนล้อเมาส์เพื่อซูม / กด "บันทึก"
   จึงตัดตามกรอบวงกลมเป็นรูปจัตุรัส 512×512 แล้วส่งไฟล์ที่ตัดแล้วกลับไปทาง onSave */
const AVATAR_FRAME = 280; // ขนาดกรอบวงกลมบนจอ (px)
const AVATAR_OUT = 512; // ขนาดรูปที่บันทึกจริง (px)
const AVATAR_MAX_ZOOM = 4;

export function AvatarCropper({
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
    const onKey = (e: globalThis.KeyboardEvent) => {
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

/* ------------------------------------------------------------------ */
/* ส่วนประกอบย่อย                                                        */
/* ------------------------------------------------------------------ */

// รายการให้เลือก (ใช้ร่วมกันทั้งบริษัท / แผนก)
function PickList({
  items,
  selectedId,
  hi,
  onHover,
  onPick,
  listRef,
  label,
  compact,
}: {
  items: Item[];
  selectedId: string;
  hi: number;
  onHover: (i: number) => void;
  onPick: (id: number) => void;
  listRef?: Ref<HTMLDivElement>;
  label: string;
  compact?: boolean;
}) {
  return (
    <div
      ref={listRef}
      role="listbox"
      aria-label={label}
      className={`relative mt-3 overflow-y-auto overscroll-contain rounded-2xl border border-white/10 bg-[#1f1f1f] ${
        compact ? "max-h-[min(28dvh,220px)]" : "max-h-[min(52dvh,460px)]"
      }`}
    >
      {items.length === 0 ? (
        <p className="px-4 py-5 text-center text-sm text-white/60">
          ไม่พบรายการที่ตรงกัน ลองพิมพ์คำอื่น
        </p>
      ) : (
        items.map((it, i) => {
          const selected = String(it.id) === selectedId;
          return (
            <button
              key={it.id}
              type="button"
              role="option"
              aria-selected={selected}
              data-hi={i === hi ? "true" : undefined}
              onMouseEnter={() => onHover(i)}
              onClick={() => onPick(it.id)}
              className={`flex min-h-12 w-full items-center justify-between gap-3 border-b border-white/5 px-5 py-3 text-left transition-colors last:border-b-0 ${
                selected ? "bg-[#e50914] text-white" : i === hi ? "bg-white/10" : ""
              }`}
            >
              <span className="min-w-0">
                <span className="block truncate text-base font-semibold">{it.label}</span>
                {it.sub && (
                  <span
                    className={`block truncate text-xs ${
                      selected ? "text-white/80" : "text-white/50"
                    }`}
                  >
                    {it.sub}
                  </span>
                )}
              </span>
              {selected && <CheckIcon className="h-5 w-5 shrink-0" />}
            </button>
          );
        })
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* ฟอร์มสมัครสมาชิกแบบทีละขั้น                                             */
/* ------------------------------------------------------------------ */

export default function RegisterForm({ onAuthed, onSwitch, onBack }: AuthFormProps) {
  const [step, setStep] = useState(0);

  const [firstName, setFirstName] = useState(""); // ชื่อจริง (บังคับ)
  const [lastName, setLastName] = useState(""); // นามสกุล (ไม่บังคับ)
  const [phone, setPhone] = useState("");
  const [empCode, setEmpCode] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [deptQuery, setDeptQuery] = useState(""); // คำค้นหา (ใช้กรองรายการแผนก)
  const [hi, setHi] = useState(-1); // แถวที่ไฮไลต์ในรายการ (-1 = ไม่มี)
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<AuthErrors>({});
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const kb = useKeyboardOpen();

  // รูปโปรไฟล์ (ไม่บังคับ): avatarFile = รูปที่ปรับแล้ว รออัปโหลดหลังสมัครสำเร็จ / avatarDraft = รูปที่เพิ่งเลือก รอปรับตำแหน่ง
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState("");
  const [avatarDraft, setAvatarDraft] = useState<File | null>(null);
  const [avatarError, setAvatarError] = useState("");
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // ชื่อเต็มที่ส่งให้เซิร์ฟเวอร์ = ชื่อ + นามสกุล (ถ้ามี) คั่นด้วยช่องว่าง
  const fullName = [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");

  // ตัวอักษรย่อตอนยังไม่มีรูป (ข้ามสระหน้า เ แ โ ใ ไ)
  const initial = fullName.replace(/^[เแโใไ]/, "").charAt(0).toUpperCase();

  // เปลี่ยนขั้น = ล้างแถวที่ไฮไลต์
  useEffect(() => {
    setHi(-1);
  }, [step]);

  // พรีวิวรูปโปรไฟล์ที่เลือก
  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreview("");
      return;
    }
    const url = URL.createObjectURL(avatarFile);
    setAvatarPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [avatarFile]);

  // รายการบริษัท / แผนก (แผนกขึ้นกับบริษัทที่เลือก)
  const companyItems = useMemo<Item[]>(
    () => COMPANIES.map((c) => ({ id: c.id, label: c.name })),
    []
  );
  const deptItems = useMemo<Item[]>(
    () => departmentsOf(Number(companyId)).map((d) => ({ id: d.id, label: d.name })),
    [companyId]
  );

  // ขั้นที่ผู้ใช้ต้องผ่านทั้งหมด
  const flow = [0, 1, 2, 3, 4];

  // ยังไม่พิมพ์ = ทุกรายการ / พิมพ์แล้ว = กรองและเรียงตามความใกล้เคียง
  const visibleDepts = useMemo(
    () => searchItems(deptQuery, deptItems),
    [deptQuery, deptItems]
  );

  const selectedCompany = useMemo(() => getCompany(Number(companyId)), [companyId]);

  // เลื่อนรายการให้เห็นแถวที่ไฮไลต์ (เลื่อนในกล่องรายการเท่านั้น ไม่เลื่อนทั้งหน้า)
  useEffect(() => {
    if (step !== 2 || hi < 0) return;
    const box = listRef.current;
    const el = box?.querySelector<HTMLElement>('[data-hi="true"]');
    if (!box || !el) return;
    const top = el.offsetTop;
    const bottom = top + el.offsetHeight;
    if (top < box.scrollTop) box.scrollTop = top;
    else if (bottom > box.scrollTop + box.clientHeight)
      box.scrollTop = bottom - box.clientHeight;
  }, [hi, step]);

  // โฟกัสช่องพิมพ์ → เลื่อนให้ช่องอยู่กลางจอ ไม่ให้คีย์บอร์ดบัง
  const onFocusField = (e: FocusEvent<HTMLFormElement>) => {
    const t = e.target as HTMLElement;
    if (t.tagName !== "INPUT" && t.tagName !== "TEXTAREA") return;
    if ((t as HTMLInputElement).type === "file") return;
    window.setTimeout(() => {
      t.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 300);
  };

  const clearErr = (key: keyof AuthErrors) =>
    setErrors((p) => ({ ...p, [key]: undefined, form: undefined }));

  const edit =
    (key: keyof AuthErrors, set: (v: string) => void) => (v: string) => {
      set(v);
      clearErr(key);
    };

  /* ---------------- รูปโปรไฟล์ ---------------- */

  // เลือกรูป: ตรวจไฟล์ แล้วเปิดหน้าต่างให้ปรับตำแหน่ง (ยังไม่อัปโหลดจนกว่าสมัครสำเร็จ)
  const pickAvatarFile = (file: File) => {
    if (busy) return;
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
  };

  // กดที่รูปโปรไฟล์หรือไอคอนกล้อง = เปิดหน้าต่างเลือกไฟล์
  const openAvatarPicker = () => avatarInputRef.current?.click();

  /* ---------------- บริษัท / แผนก ---------------- */

  // เปลี่ยนบริษัท = ล้างแผนกที่เลือกไว้ (เพราะเป็นของบริษัทเดิม)
  const pickCompany = (id: number) => {
    if (String(id) !== companyId) {
      setCompanyId(String(id));
      setDepartmentId("");
      setDeptQuery("");
    }
    clearErr("companyId");
  };

  const pickDept = (id: number) => {
    setDepartmentId(String(id));
    clearErr("departmentId");
  };

  const onDeptQuery = (v: string) => {
    setDeptQuery(v);
    setHi(v.trim() ? 0 : -1);
    clearErr("departmentId");
  };

  // ลูกศรขึ้น/ลง เลื่อนรายการ, Enter (ตอนมีคำค้น) เลือกแถวที่ไฮไลต์
  const onListKey =
    (list: Item[], query: string, selectedId: string, pick: (id: number) => void) =>
    (e: KeyboardEvent<HTMLDivElement>) => {
      const n = list.length;
      if (n === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHi((i) => (i + 1) % n);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHi((i) => (i <= 0 ? n - 1 : i - 1));
      } else if (e.key === "Enter" && query.trim()) {
        const it = list[Math.min(Math.max(hi, 0), n - 1)];
        // ถ้าแถวนั้นเลือกอยู่แล้ว ปล่อยให้ Enter ส่งฟอร์มไปขั้นถัดไป
        if (it && String(it.id) !== selectedId) {
          e.preventDefault();
          pick(it.id);
        }
      }
    };

  /* ---------------- ตรวจทีละขั้น ---------------- */

  const validate = (s: number): AuthErrors => {
    const err: AuthErrors = {};
    if (s === 0) {
      // ชื่อจริงบังคับ / นามสกุลไม่บังคับ
      if (firstName.trim().length < 2) err.name = "กรอกชื่อจริงให้ครบ";
      if (!validPhone(digitsOnly(phone)))
        err.phone = "เบอร์โทรต้องมี 10 หลัก ขึ้นต้นด้วย 0";
      if (!validEmp(digitsOnly(empCode)))
        err.empCode = `รหัสพนักงานต้องเป็นตัวเลข ${EMP_CODE_MIN}-${EMP_CODE_LENGTH} หลัก`;
    } else if (s === 1) {
      if (!companyId) err.companyId = "เลือกบริษัทของคุณ";
    } else if (s === 2) {
      if (deptItems.length === 0)
        err.form = "บริษัทนี้ยังไม่มีรายการแผนก กรุณาติดต่อเจ้าหน้าที่";
      else if (!departmentId) err.departmentId = "เลือกแผนกของคุณจากรายการ";
    } else if (s === 3) {
      if (!USERNAME_RE.test(username.trim()))
        err.username = "username ต้องยาว 3-20 ตัว ใช้ได้เฉพาะ a-z 0-9 . _";
      if (password.length < MIN_PASSWORD)
        err.password = `รหัสผ่านต้องยาวอย่างน้อย ${MIN_PASSWORD} ตัวอักษร`;
      else if (confirm !== password) err.confirm = "รหัสผ่านไม่ตรงกัน";
    }
    return err;
  };

  const register = async () => {
    if (busy) return;
    // ตรวจทุกขั้นที่ต้องผ่านก่อนส่ง
    for (const s of flow) {
      const err = validate(s);
      if (Object.keys(err).length > 0) {
        setErrors(err);
        setStep(s);
        return;
      }
    }

    setBusy(true);
    setErrors({});
    // ส่งแผนกของสำนักงานใหญ่ (เซิร์ฟเวอร์ตรวจซ้ำด้วย validateOrg)
    const r = await postAuth("/api/auth/register", {
      username: username.trim(),
      password,
      name: fullName,
      phone: digitsOnly(phone),
      empCode: digitsOnly(empCode),
      companyId: Number(companyId),
      departmentId: Number(departmentId),
    });
    if (!r.ok) {
      setBusy(false);
      setErrors(r.errors);
      const s = stepOfErrors(r.errors);
      if (s !== null) setStep(s); // เด้งกลับไปขั้นที่มีปัญหา
      return;
    }
    // สมัครสำเร็จ (ล็อกอินแล้ว): ถ้าเลือกรูปไว้ อัปโหลดก่อนไปต่อ ให้หน้าหลักโหลดรูปมาพร้อมบัญชี
    if (avatarFile) await uploadAvatar(avatarFile);
    setBusy(false);
    onAuthed(r.user);
  };

  const next = (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const err = validate(step);
    if (Object.keys(err).length > 0) {
      setErrors(err);
      return;
    }
    setErrors({});
    if (step < LAST_STEP) setStep(step + 1);
    else register();
  };

  const back = () => {
    if (busy || step === 0) return;
    setErrors({});
    setStep(step - 1);
  };

  // แตะวงกลมของขั้นที่ผ่านมาแล้วเพื่อย้อนกลับไปแก้
  const goTo = (i: number) => {
    if (busy || i >= step) return;
    setErrors({});
    setStep(i);
  };

  /* ---------------- หัวข้อของแต่ละขั้น ---------------- */

  const heading = [
    { t: "ข้อมูลของคุณ", s: "ใช้กรอกข้อมูลตอนซื้อตั๋วให้อัตโนมัติ" },
    {
      t: "คุณอยู่บริษัทไหน",
      s: "บริษัทและแผนกเลือกตอนสมัครเท่านั้น แก้ไขภายหลังไม่ได้",
    },
    {
      t: "คุณอยู่แผนกไหน",
      s: selectedCompany
        ? `แผนกใน ${selectedCompany.name} เลือกจากรายการ หรือพิมพ์ค้นหา`
        : "เลือกจากรายการ ถ้าหาไม่เจอพิมพ์ค้นหาได้",
    },
    { t: "ตั้งค่าบัญชี", s: "ใช้ username และรหัสผ่านนี้เข้าสู่ระบบ" },
    { t: "รูปโปรไฟล์", s: "ใส่รูปโปรไฟล์หรือข้ามก็ได้ ตั้งทีหลังที่หน้าโปรไฟล์ได้" },
  ][step];

  // ตำแหน่งของขั้นปัจจุบัน (ใช้วาดวงกลมลำดับขั้น)
  const pos = step;

  return (
    <AuthShell onBack={onBack}>
      <form
        onSubmit={next}
        onFocus={onFocusField}
        noValidate
        className="flex flex-1 flex-col"
      >
        {/* ขั้นตอน: วงกลมมีลำดับที่ + ข้อความบอกว่าต้องทำอะไร (แตะขั้นที่ผ่านแล้วเพื่อย้อนกลับ) */}
        <ol className="mt-2 flex shrink-0 items-start" aria-label="ขั้นตอนการสมัคร">
          {flow.map((id, p) => {
            const label = STEP_LABELS[id];
            const done = p < pos;
            const cur = p === pos;
            const circleCls = `relative z-10 flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold tabular-nums transition-all duration-300 ${
              done
                ? "bg-[#e50914] text-white"
                : cur
                  ? "bg-[#e50914] text-white ring-4 ring-[#e50914]/30"
                  : "border border-white/30 text-white/60"
            }`;
            const inner = done ? <CheckIcon className="h-4 w-4" /> : p + 1;
            return (
              <li
                key={id}
                className="relative flex flex-1 flex-col items-center"
                aria-current={cur ? "step" : undefined}
              >
                {/* เส้นเชื่อมไปขั้นถัดไป */}
                {p < flow.length - 1 && (
                  <span
                    aria-hidden
                    className={`absolute left-[calc(50%+22px)] top-[17px] h-0.5 w-[calc(100%-44px)] transition-colors duration-300 ${
                      done ? "bg-[#e50914]" : "bg-white/20"
                    }`}
                  />
                )}
                {done ? (
                  <button
                    type="button"
                    onClick={() => goTo(id)}
                    disabled={busy}
                    aria-label={`ย้อนกลับไปขั้นที่ ${p + 1}: ${label}`}
                    className={`${circleCls} active:scale-90`}
                  >
                    {inner}
                  </button>
                ) : (
                  <span className={circleCls}>{inner}</span>
                )}
                <span
                  className={`mt-1.5 px-0.5 text-center text-[10px] font-semibold leading-tight sm:text-[11px] ${
                    cur ? "text-white" : done ? "text-white/80" : "text-white/50"
                  }`}
                >
                  {label}
                </span>
              </li>
            );
          })}
        </ol>

        {/* เนื้อหาของแต่ละขั้น (เว้นที่ท้ายตอนคีย์บอร์ดเปิด ให้เลื่อนช่องล่างสุดขึ้นมาได้) */}
        <div className={`flex-1 ${kb ? "pb-24" : "pb-4"}`}>
          <div key={step} className="pd-rise">
            <h1 className="mt-6 text-3xl font-bold leading-tight">{heading.t}</h1>
            <p className="mt-1 text-sm text-white/60">{heading.s}</p>

            {/* ขั้น 1: ชื่อ นามสกุล เบอร์โทร รหัสพนักงาน */}
            {step === 0 && (
              <div className="mt-6 space-y-4">
                <p className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-relaxed text-white/80">
                  กรอกชื่อและนามสกุลจริงเป็นภาษาไทย
                  ข้อมูลนี้มีผลต่อการตรวจสอบสิทธิ์ของคุณ
                </p>
                <Field
                  label="ชื่อ"
                  value={firstName}
                  onChange={edit("name", setFirstName)}
                  autoComplete="given-name"
                  placeholder="ชื่อจริงภาษาไทย"
                  error={errors.name}
                  autoFocus
                />
                <Field
                  label="นามสกุล (ไม่บังคับ)"
                  value={lastName}
                  onChange={edit("name", setLastName)}
                  autoComplete="family-name"
                  placeholder="นามสกุลภาษาไทย (ถ้ามี)"
                />
                <Field
                  label="เบอร์โทร"
                  value={phone}
                  onChange={edit("phone", (v) => setPhone(digitsOnly(v).slice(0, 10)))}
                  inputMode="numeric"
                  autoComplete="tel"
                  maxLength={10}
                  placeholder="0812345678"
                  error={errors.phone}
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
                  hint="ใช้ลุ้นรางวัล Lucky Draw กรอกแล้วแก้ไขภายหลังไม่ได้"
                  mono
                />
              </div>
            )}

            {/* ขั้น 2: บริษัท */}
            {step === 1 && (
              <div className="mt-4">
                <PickList
                  label="รายการบริษัท"
                  items={companyItems}
                  selectedId={companyId}
                  hi={-1}
                  onHover={() => {}}
                  onPick={pickCompany}
                />
                {errors.companyId && (
                  <p role="alert" className="mt-2 text-sm font-medium text-red-400">
                    {errors.companyId}
                  </p>
                )}
              </div>
            )}

            {/* ขั้น 3: แผนก (แสดงให้เลือกเลย พิมพ์ค้นหาเมื่อหาไม่เจอ) */}
            {step === 2 && deptItems.length > 0 && (
              <div
                className="mt-4"
                onKeyDown={onListKey(visibleDepts, deptQuery, departmentId, pickDept)}
              >
                <Field
                  label="ค้นหาแผนก"
                  value={deptQuery}
                  onChange={onDeptQuery}
                  placeholder="พิมพ์ชื่อแผนก (ถ้าหาไม่เจอในรายการ)"
                  autoComplete="off"
                  error={errors.departmentId}
                />
                <PickList
                  label="รายการแผนก"
                  items={visibleDepts}
                  selectedId={departmentId}
                  hi={hi}
                  onHover={setHi}
                  onPick={pickDept}
                  listRef={listRef}
                  compact={kb}
                />
              </div>
            )}

            {/* ขั้น 3: บริษัทที่ไม่มีแผนก */}
            {step === 2 && deptItems.length === 0 && (
              <p className="mt-4 rounded-2xl bg-white/10 px-4 py-5 text-center text-sm">
                บริษัทนี้ยังไม่มีรายการแผนก กรุณาติดต่อเจ้าหน้าที่
              </p>
            )}

            {/* ขั้น 4: username / password */}
            {step === 3 && (
              <div className="mt-6 space-y-4">
                <Field
                  label="Username"
                  value={username}
                  onChange={edit("username", setUsername)}
                  maxLength={20}
                  autoComplete="username"
                  placeholder="เช่น somchai99"
                  error={errors.username}
                  hint="3-20 ตัว ใช้ a-z 0-9 . _"
                  plain
                  autoFocus
                />
                <Field
                  label="รหัสผ่าน"
                  value={password}
                  onChange={edit("password", setPassword)}
                  type={show ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder={`อย่างน้อย ${MIN_PASSWORD} ตัวอักษร`}
                  error={errors.password}
                  trailing={<EyeButton show={show} onToggle={() => setShow((v) => !v)} />}
                />
                <Field
                  label="ยืนยันรหัสผ่าน"
                  value={confirm}
                  onChange={edit("confirm", setConfirm)}
                  type={show ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="พิมพ์รหัสผ่านอีกครั้ง"
                  error={errors.confirm}
                />
              </div>
            )}

            {/* ขั้น 5: รูปโปรไฟล์ (ไม่บังคับ) หน้าตาเหมือนหน้าโปรไฟล์ */}
            {step === 4 && (
              <div className="mt-6 flex flex-col items-center rounded-3xl border border-white/10 bg-[#1f1f1f] p-5 text-center">
                <div className="relative">
                  <button
                    type="button"
                    onClick={openAvatarPicker}
                    disabled={busy}
                    aria-label={avatarFile ? "เปลี่ยนรูปโปรไฟล์" : "อัปโหลดรูปโปรไฟล์"}
                    className="block cursor-pointer rounded-full transition active:scale-[0.98] disabled:cursor-not-allowed"
                  >
                    {avatarPreview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={avatarPreview}
                        alt="รูปโปรไฟล์ที่เลือก"
                        className="h-44 w-44 rounded-full object-cover md:h-56 md:w-56"
                      />
                    ) : (
                      <span
                        aria-hidden
                        className="flex h-44 w-44 items-center justify-center rounded-full bg-[#2a2a2a] text-7xl font-bold md:h-56 md:w-56 md:text-8xl"
                      >
                        {initial}
                      </span>
                    )}
                  </button>
                  {busy && avatarFile && (
                    <span
                      role="status"
                      className="absolute inset-0 flex items-center justify-center rounded-full bg-black/60 text-sm font-semibold"
                    >
                      กำลังอัปโหลด...
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={openAvatarPicker}
                    disabled={busy}
                    tabIndex={-1}
                    aria-hidden
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
                {avatarFile && (
                  <button
                    type="button"
                    onClick={() => {
                      setAvatarFile(null);
                      setAvatarError("");
                    }}
                    disabled={busy}
                    className="mt-3 rounded-full px-4 py-1.5 text-xs font-semibold text-white/70 transition hover:bg-white/10 active:opacity-60 disabled:opacity-50"
                  >
                    ลบรูปโปรไฟล์
                  </button>
                )}
                {avatarError && (
                  <p role="alert" className="mt-2 text-sm font-medium text-red-500">
                    {avatarError}
                  </p>
                )}
                <p className="mt-3 max-w-full truncate text-lg font-bold md:text-xl">{fullName}</p>
                <p className="max-w-full truncate text-xs text-white/60 md:text-sm">
                  @{username.trim()}
                </p>

                {/* ข้าม: สมัครสมาชิกโดยไม่ใส่รูป (เลือกรูปแล้วจะซ่อนปุ่มนี้) */}
                {!avatarFile && (
                  <button
                    type="button"
                    onClick={register}
                    disabled={busy}
                    className="mt-5 h-11 w-full rounded-full border border-white/30 text-sm font-semibold text-white/80 transition hover:bg-white/10 active:scale-[0.98] disabled:opacity-50"
                  >
                    ข้าม
                  </button>
                )}
              </div>
            )}
          </div>

          {errors.form && (
            <p
              role="alert"
              className="pd-rise mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
            >
              {errors.form}
            </p>
          )}
        </div>

        {/* แถบปุ่มล่าง: ปกติติดขอบล่างจอ / ตอนคีย์บอร์ดเปิดเลิกติด จะได้ไม่บังช่องพิมพ์ */}
        <div
          className={`-mx-5 border-t border-white/10 bg-[#141414] px-5 pt-3 md:-mx-8 md:px-8 ${
            kb
              ? "relative pb-3"
              : "sticky bottom-0 z-10 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
          }`}
        >
          <div className="flex items-center gap-3">
            {step > 0 && (
              <button type="button" onClick={back} disabled={busy} className={secondaryBtn}>
                ย้อนกลับ
              </button>
            )}
            <button type="submit" disabled={busy} className={`${primaryBtn} flex-1`}>
              {step < LAST_STEP ? "ถัดไป" : busy ? "กำลังสมัครสมาชิก..." : "สมัครสมาชิก"}
              {!busy && <ArrowIcon className="h-5 w-5" />}
            </button>
          </div>

          {step === 0 && (
            <p className="mt-3 text-center text-sm text-white/70">
              มีบัญชีอยู่แล้ว?{" "}
              <button
                type="button"
                onClick={() => onSwitch("login")}
                className="font-semibold text-white underline-offset-2 hover:underline"
              >
                เข้าสู่ระบบ
              </button>
            </p>
          )}
        </div>
      </form>

      {/* หน้าต่างปรับรูปโปรไฟล์ (ลากขยับ/ซูม แล้วกดบันทึก) */}
      {avatarDraft && (
        <AvatarCropper
          file={avatarDraft}
          busy={false}
          error=""
          onCancel={() => setAvatarDraft(null)}
          onSave={(f) => {
            setAvatarFile(f);
            setAvatarDraft(null);
          }}
        />
      )}
    </AuthShell>
  );
}