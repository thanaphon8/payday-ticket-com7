"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent, Ref } from "react";
import {
  ArrowIcon,
  AuthShell,
  CheckIcon,
  EMP_CODE_LENGTH,
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
import {
  branchesOf,
  branchFullLabel,
  branchProvince,
  branchRegion,
} from "./branches";

/* ------------------------------------------------------------------ */
/* ค่าคงที่ / ตัวช่วย                                                    */
/* ------------------------------------------------------------------ */

// ลำดับขั้น: 0 ข้อมูลของคุณ → 1 บริษัท → 2 ที่ทำงาน (สำนักงานใหญ่/หน้าร้าน) → 3 แผนกหรือสาขา → 4 บัญชี
// ขั้น 2 จะข้ามไปเองถ้าบริษัทนั้นมีแค่แผนกหรือแค่สาขาอย่างเดียว
const STEPS = ["ข้อมูลของคุณ", "บริษัท", "ที่ทำงาน", "แผนก/สาขา", "บัญชี"] as const;
// ข้อความใต้วงกลมแต่ละขั้น (ขั้น 3 เปลี่ยนเป็น "เลือกสาขา" ตอนเลือกหน้าร้าน)
const STEP_LABELS = [
  "กรอกข้อมูล",
  "เลือกบริษัท",
  "ที่ทำงาน",
  "เลือกแผนก",
  "ตั้งรหัสผ่าน",
] as const;
const LAST_STEP = STEPS.length - 1; // 4 = ขั้นตั้งบัญชี (กดสมัครที่ขั้นนี้)

// สาขาที่แสดงก่อนพิมพ์ค้นหา กด "ดูเพิ่ม" ได้ทีละ BRANCH_STEP
const BRANCH_PREVIEW = 80;
const BRANCH_STEP = 200;

// รายการเลือก (บริษัท / แผนก / สาขา ใช้โครงเดียวกัน)
type Item = { id: number; label: string; sub?: string };
// สำนักงานใหญ่ = เลือกแผนก / หน้าร้าน = เลือกสาขา
type Place = "hq" | "store";

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
      : e.departmentId || e.branchId
        ? 3
        : e.username || e.password || e.confirm
          ? 4
          : null;

/* ------------------------------------------------------------------ */
/* ส่วนประกอบย่อย                                                        */
/* ------------------------------------------------------------------ */

// รายการให้เลือก (ใช้ร่วมกันทั้งบริษัท / แผนก / สาขา)
function PickList({
  items,
  selectedId,
  hi,
  onHover,
  onPick,
  listRef,
  limit,
  label,
}: {
  items: Item[];
  selectedId: string;
  hi: number;
  onHover: (i: number) => void;
  onPick: (id: number) => void;
  listRef?: Ref<HTMLDivElement>;
  limit?: number;
  label: string;
}) {
  const shown = limit ? items.slice(0, limit) : items;
  return (
    <div
      ref={listRef}
      role="listbox"
      aria-label={label}
      className="relative mt-3 max-h-[min(52dvh,460px)] overflow-y-auto rounded-2xl border border-white/10 bg-[#1f1f1f]"
    >
      {shown.length === 0 ? (
        <p className="px-4 py-5 text-center text-sm text-white/60">
          ไม่พบรายการที่ตรงกัน ลองพิมพ์คำอื่น
        </p>
      ) : (
        shown.map((it, i) => {
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
      {items.length > shown.length && (
        <p className="px-4 py-3 text-center text-xs text-white/50">
          พิมพ์ค้นหาเพื่อดูอีก {items.length - shown.length} รายการ
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* ฟอร์มสมัครสมาชิกแบบทีละขั้น                                             */
/* ------------------------------------------------------------------ */

export default function RegisterForm({ onAuthed, onSwitch, onBack }: AuthFormProps) {
  const [step, setStep] = useState(0);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [empCode, setEmpCode] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [workplace, setWorkplace] = useState<Place | "">(""); // สำนักงานใหญ่ / หน้าร้าน
  const [departmentId, setDepartmentId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [deptQuery, setDeptQuery] = useState(""); // คำค้นหา (ใช้กรองรายการแผนก)
  const [branchQuery, setBranchQuery] = useState(""); // คำค้นหา (ใช้กรองรายการสาขา)
  const [branchLimit, setBranchLimit] = useState(BRANCH_PREVIEW); // จำนวนสาขาที่แสดงตอนยังไม่พิมพ์ค้นหา
  const [hi, setHi] = useState(-1); // แถวที่ไฮไลต์ในรายการ (-1 = ไม่มี)
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<AuthErrors>({});
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  // เปลี่ยนขั้น = ล้างแถวที่ไฮไลต์
  useEffect(() => {
    setHi(-1);
  }, [step]);

  // รายการบริษัท / แผนก / สาขา (แผนกและสาขาขึ้นกับบริษัทที่เลือก)
  const companyItems = useMemo<Item[]>(
    () => COMPANIES.map((c) => ({ id: c.id, label: c.name })),
    []
  );
  const deptItems = useMemo<Item[]>(
    () => departmentsOf(Number(companyId)).map((d) => ({ id: d.id, label: d.name })),
    [companyId]
  );
  // สาขา: แสดง "ID xxx · ชื่อสาขา" และใต้ชื่อเป็น "จังหวัด · ภาค" (ค้นหาได้ทั้ง label และ sub)
  const branchItems = useMemo<Item[]>(
    () =>
      branchesOf(Number(companyId)).map((b) => ({
        id: b.id,
        label: branchFullLabel(b),
        sub: [branchProvince(b), branchRegion(b)].filter(Boolean).join(" · "),
      })),
    [companyId]
  );

  // ถามว่าสำนักงานใหญ่/หน้าร้าน เฉพาะบริษัทที่มีทั้งแผนกและสาขา
  // บริษัทที่มีอย่างเดียวจะเลือกให้เอง (มีแต่แผนก = สำนักงานใหญ่ / มีแต่สาขา = หน้าร้าน)
  const askType = deptItems.length > 0 && branchItems.length > 0;
  const place: Place | "" = askType
    ? workplace
    : deptItems.length > 0
      ? "hq"
      : branchItems.length > 0
        ? "store"
        : "";
  // ขั้นที่ผู้ใช้ต้องผ่านจริง (ข้ามขั้น 2 ถ้าไม่ต้องถาม)
  const flow = askType ? [0, 1, 2, 3, 4] : [0, 1, 3, 4];
  const stepLabel = (id: number) =>
    id === 3 && place === "store" ? "เลือกสาขา" : STEP_LABELS[id];

  // ยังไม่พิมพ์ = ทุกรายการ / พิมพ์แล้ว = กรองและเรียงตามความใกล้เคียง
  const visibleDepts = useMemo(
    () => searchItems(deptQuery, deptItems),
    [deptQuery, deptItems]
  );
  const visibleBranches = useMemo(
    () => searchItems(branchQuery, branchItems),
    [branchQuery, branchItems]
  );

  // ยังไม่พิมพ์ = จำกัดตาม branchLimit (กด "ดูเพิ่ม" เพิ่มได้) / พิมพ์แล้ว = แสดงทั้งหมดที่ตรง
  const branchCap = branchQuery.trim() ? undefined : branchLimit;
  // รายการสาขาที่แสดงอยู่จริง (ใช้กับลูกศรขึ้น/ลง ไม่ให้ไฮไลต์หลุดไปแถวที่มองไม่เห็น)
  const shownBranches = useMemo(
    () => visibleBranches.slice(0, branchCap),
    [visibleBranches, branchCap]
  );

  const selectedCompany = useMemo(() => getCompany(Number(companyId)), [companyId]);

  // เลื่อนรายการให้เห็นแถวที่ไฮไลต์ (เลื่อนในกล่องรายการเท่านั้น ไม่เลื่อนทั้งหน้า)
  useEffect(() => {
    if (step !== 3 || hi < 0) return;
    const box = listRef.current;
    const el = box?.querySelector<HTMLElement>('[data-hi="true"]');
    if (!box || !el) return;
    const top = el.offsetTop;
    const bottom = top + el.offsetHeight;
    if (top < box.scrollTop) box.scrollTop = top;
    else if (bottom > box.scrollTop + box.clientHeight)
      box.scrollTop = bottom - box.clientHeight;
  }, [hi, step]);

  const clearErr = (key: keyof AuthErrors) =>
    setErrors((p) => ({ ...p, [key]: undefined, form: undefined }));

  const edit =
    (key: keyof AuthErrors, set: (v: string) => void) => (v: string) => {
      set(v);
      clearErr(key);
    };

  /* ---------------- บริษัท / ที่ทำงาน / แผนก / สาขา ---------------- */

  // เปลี่ยนบริษัท = ล้างที่ทำงาน แผนก และสาขาที่เลือกไว้ (เพราะเป็นของบริษัทเดิม)
  const pickCompany = (id: number) => {
    if (String(id) !== companyId) {
      setCompanyId(String(id));
      setWorkplace("");
      setDepartmentId("");
      setBranchId("");
      setDeptQuery("");
      setBranchQuery("");
      setBranchLimit(BRANCH_PREVIEW);
    }
    clearErr("companyId");
  };

  // เลือกสำนักงานใหญ่ = ล้างสาขา / เลือกหน้าร้าน = ล้างแผนก
  const pickPlace = (p: Place) => {
    setWorkplace(p);
    if (p === "hq") {
      setBranchId("");
      setBranchQuery("");
      setBranchLimit(BRANCH_PREVIEW);
    } else {
      setDepartmentId("");
      setDeptQuery("");
    }
    clearErr("form");
  };

  const pickDept = (id: number) => {
    setDepartmentId(String(id));
    clearErr("departmentId");
  };

  const pickBranch = (id: number) => {
    setBranchId(String(id));
    clearErr("branchId");
  };

  const onDeptQuery = (v: string) => {
    setDeptQuery(v);
    setHi(v.trim() ? 0 : -1);
    clearErr("departmentId");
  };

  const onBranchQuery = (v: string) => {
    setBranchQuery(v);
    setBranchLimit(BRANCH_PREVIEW);
    setHi(v.trim() ? 0 : -1);
    clearErr("branchId");
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
      if (name.trim().length < 2) err.name = "กรอกชื่อ-นามสกุลให้ครบ";
      if (!validPhone(digitsOnly(phone)))
        err.phone = "เบอร์โทรต้องมี 10 หลัก ขึ้นต้นด้วย 0";
      if (!validEmp(digitsOnly(empCode)))
        err.empCode = `รหัสพนักงานต้องเป็นตัวเลข ${EMP_CODE_LENGTH} หลัก`;
    } else if (s === 1) {
      if (!companyId) err.companyId = "เลือกบริษัทของคุณ";
    } else if (s === 2) {
      // ต้องเลือกสำนักงานใหญ่/หน้าร้าน เฉพาะบริษัทที่มีทั้งสองแบบ
      if (askType && !place) err.form = "เลือกว่าคุณอยู่สำนักงานใหญ่หรือหน้าร้าน";
    } else if (s === 3) {
      // สำนักงานใหญ่ = ต้องเลือกแผนก / หน้าร้าน = ต้องเลือกสาขา
      if (place === "hq" && !departmentId) err.departmentId = "เลือกแผนกของคุณจากรายการ";
      else if (place === "store" && !branchId) err.branchId = "เลือกสาขาของคุณจากรายการ";
      else if (!place) err.form = "บริษัทนี้ยังไม่มีรายการแผนก กรุณาติดต่อเจ้าหน้าที่";
    } else if (s === 4) {
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
    // สำนักงานใหญ่ส่งแค่แผนก / หน้าร้านส่งแค่สาขา (เซิร์ฟเวอร์ตรวจซ้ำด้วย validateOrg)
    const r = await postAuth("/api/auth/register", {
      username: username.trim(),
      password,
      name: name.trim(),
      phone: digitsOnly(phone),
      empCode: digitsOnly(empCode),
      companyId: Number(companyId),
      ...(place === "hq" ? { departmentId: Number(departmentId) } : {}),
      ...(place === "store" ? { branchId: Number(branchId) } : {}),
    });
    setBusy(false);
    if (!r.ok) {
      setErrors(r.errors);
      const s = stepOfErrors(r.errors);
      if (s !== null) setStep(s); // เด้งกลับไปขั้นที่มีปัญหา
      return;
    }
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
    if (step < LAST_STEP) {
      let n = step + 1;
      if (n === 2 && !askType) n = 3; // ข้ามขั้นถามที่ทำงาน
      setStep(n);
    } else {
      register();
    }
  };

  const back = () => {
    if (busy || step === 0) return;
    setErrors({});
    let p = step - 1;
    if (p === 2 && !askType) p = 1; // ข้ามขั้นถามที่ทำงาน
    setStep(p);
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
    { t: "คุณทำงานที่ไหน", s: "เลือกสำนักงานใหญ่ หรือหน้าร้าน" },
    place === "store"
      ? {
          t: "คุณประจำสาขาไหน",
          s: "เลือกจากรายการ หรือพิมพ์ค้นหาเลข ID / ชื่อสาขา / จังหวัด",
        }
      : {
          t: "คุณอยู่แผนกไหน",
          s: selectedCompany
            ? `แผนกใน ${selectedCompany.name} เลือกจากรายการ หรือพิมพ์ค้นหา`
            : "เลือกจากรายการ ถ้าหาไม่เจอพิมพ์ค้นหาได้",
        },
    { t: "ตั้งค่าบัญชี", s: "ใช้ username และรหัสผ่านนี้เข้าสู่ระบบ" },
  ][step];

  // ตำแหน่งของขั้นปัจจุบันในลำดับที่แสดงจริง (ใช้วาดวงกลมลำดับขั้น)
  const pos = Math.max(0, flow.indexOf(step));

  return (
    <AuthShell onBack={onBack}>
      <form onSubmit={next} noValidate className="flex flex-1 flex-col">
        {/* ขั้นตอน: วงกลมมีลำดับที่ + ข้อความบอกว่าต้องทำอะไร (แตะขั้นที่ผ่านแล้วเพื่อย้อนกลับ) */}
        <ol className="mt-2 flex shrink-0 items-start" aria-label="ขั้นตอนการสมัคร">
          {flow.map((id, p) => {
            const label = stepLabel(id);
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

        {/* เนื้อหาของแต่ละขั้น */}
        <div className="flex-1 pb-4">
          <div key={step} className="pd-rise">
            <h1 className="mt-6 text-3xl font-bold leading-tight">{heading.t}</h1>
            <p className="mt-1 text-sm text-white/60">{heading.s}</p>

            {/* ขั้น 1: ชื่อ เบอร์โทร รหัสพนักงาน */}
            {step === 0 && (
              <div className="mt-6 space-y-4">
                <Field
                  label="ชื่อ-นามสกุล"
                  value={name}
                  onChange={edit("name", setName)}
                  autoComplete="name"
                  error={errors.name}
                  autoFocus
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
                  label={`รหัสพนักงาน (${EMP_CODE_LENGTH} หลัก)`}
                  value={empCode}
                  onChange={edit("empCode", (v) =>
                    setEmpCode(digitsOnly(v).slice(0, EMP_CODE_LENGTH))
                  )}
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={EMP_CODE_LENGTH}
                  placeholder={"0".repeat(EMP_CODE_LENGTH)}
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

            {/* ขั้น 3: สำนักงานใหญ่ หรือ หน้าร้าน (แสดงเฉพาะบริษัทที่มีทั้งแผนกและสาขา) */}
            {step === 2 && (
              <div role="radiogroup" aria-label="ที่ทำงาน" className="mt-6 grid gap-3">
                {(
                  [
                    ["hq", "สำนักงานใหญ่", "ทำงานที่ออฟฟิศ เลือกแผนกของคุณ"],
                    ["store", "หน้าร้าน", "ประจำที่สาขา เลือกสาขาของคุณ"],
                  ] as const
                ).map(([k, title, sub]) => {
                  const sel = place === k;
                  return (
                    <button
                      key={k}
                      type="button"
                      role="radio"
                      aria-checked={sel}
                      onClick={() => pickPlace(k)}
                      className={`flex min-h-[72px] w-full items-center justify-between gap-3 rounded-2xl px-5 py-4 text-left transition active:scale-[0.99] ${
                        sel
                          ? "bg-[#e50914] text-white"
                          : "border border-white/10 bg-[#1f1f1f]"
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block text-lg font-bold">{title}</span>
                        <span
                          className={`block text-sm ${
                            sel ? "text-white/80" : "text-white/50"
                          }`}
                        >
                          {sub}
                        </span>
                      </span>
                      {sel && <CheckIcon className="h-5 w-5 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}

            {/* ขั้น 4: สำนักงานใหญ่ = เลือกแผนก (แสดงให้เลือกเลย พิมพ์ค้นหาเมื่อหาไม่เจอ) */}
            {step === 3 && place === "hq" && (
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
                />
              </div>
            )}

            {/* ขั้น 4: หน้าร้าน = เลือกสาขา (ยังไม่พิมพ์ = แสดงทีละช่วง กด "ดูเพิ่ม" / พิมพ์แล้ว = แสดงทั้งหมดที่ตรง) */}
            {step === 3 && place === "store" && (
              <div
                className="mt-4"
                onKeyDown={onListKey(shownBranches, branchQuery, branchId, pickBranch)}
              >
                <Field
                  label="ค้นหาสาขา"
                  value={branchQuery}
                  onChange={onBranchQuery}
                  placeholder="พิมพ์เลข ID, ชื่อสาขา หรือจังหวัด"
                  autoComplete="off"
                  error={errors.branchId}
                />
                <PickList
                  label="รายการสาขา"
                  items={visibleBranches}
                  selectedId={branchId}
                  hi={hi}
                  onHover={setHi}
                  onPick={pickBranch}
                  listRef={listRef}
                  limit={branchCap}
                />
                {branchCap !== undefined && visibleBranches.length > branchCap && (
                  <button
                    type="button"
                    onClick={() => setBranchLimit((n) => n + BRANCH_STEP)}
                    className="mt-2 flex h-11 w-full items-center justify-center rounded-full border border-white/30 text-sm font-semibold text-white/90 transition-colors hover:bg-white/10 active:scale-95"
                  >
                    ดูเพิ่มอีก {Math.min(BRANCH_STEP, visibleBranches.length - branchCap)} สาขา
                    (เหลือ {visibleBranches.length - branchCap})
                  </button>
                )}
              </div>
            )}

            {/* ขั้น 4: บริษัทที่ไม่มีทั้งแผนกและสาขา */}
            {step === 3 && place === "" && (
              <p className="mt-4 rounded-2xl bg-white/10 px-4 py-5 text-center text-sm">
                บริษัทนี้ยังไม่มีรายการแผนก กรุณาติดต่อเจ้าหน้าที่
              </p>
            )}

            {/* ขั้น 5: username / password */}
            {step === 4 && (
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

        {/* แถบปุ่มล่าง: ติดขอบล่างจอ ย้อนกลับ + ถัดไป อยู่แถวเดียวกัน */}
        <div className="sticky bottom-0 z-10 -mx-5 border-t border-white/10 bg-[#141414] px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 md:-mx-8 md:px-8">
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
    </AuthShell>
  );
}