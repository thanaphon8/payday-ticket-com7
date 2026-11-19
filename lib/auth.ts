import { createHash, createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { cookies } from "next/headers";
import { ObjectId } from "mongodb";
import { getDb } from "./mongodb";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export const COOKIE = "payday-session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 วัน

// admin และเจ้าหน้าที่สแกนตั๋ว ใช้รหัสผ่านแยกกัน ไม่ผูกกับบัญชีผู้ใช้
// ตั้งใน .env.local: ADMIN_PASSWORD (หน้า /admin) และ STAFF_PASSWORD (หน้า /ticket) ยาวอย่างน้อย 8 ตัว
// ไม่ตั้งหรือสั้นไป = ปิดหน้านั้นทั้งหมด (fail closed)
export const ADMIN_COOKIE = "payday-admin";
export const ADMIN_MAX_AGE = 60 * 60 * 12; // 12 ชั่วโมง
export const STAFF_COOKIE = "payday-staff";
export const STAFF_MAX_AGE = 60 * 60 * 12; // 12 ชั่วโมง

export type SessionUser = {
  id: string;
  username: string;
  name: string;
  phone: string;
  empCode: string | null;
  companyId?: number | null;
  departmentId?: number | null;
  branchId?: number | null;
  isAdmin?: boolean; // เลิกใช้แล้ว (admin แยกเป็นรหัสผ่านต่างหาก) คงไว้กันโค้ดเก่าพัง
};

/* ---------- validate ---------- */
export const validUsername = (u: string) => /^[a-zA-Z0-9._]{3,20}$/.test(u);
export const validPassword = (p: string) => p.length >= 6 && p.length <= 100;
export const validPhone = (p: string) => /^0\d{9}$/.test(p);

/* ---------- รหัสผ่าน (scrypt ในตัว Node ไม่ต้องลง package เพิ่ม) ---------- */
export async function hashPassword(pw: string) {
  const salt = randomBytes(16);
  const key = await scrypt(pw, salt, 64);
  return `${salt.toString("hex")}:${key.toString("hex")}`;
}

export async function verifyPassword(pw: string, stored: string) {
  const [s, h] = stored.split(":");
  if (!s || !h) return false;
  const key = await scrypt(pw, Buffer.from(s, "hex"), 64);
  const hb = Buffer.from(h, "hex");
  return hb.length === key.length && timingSafeEqual(key, hb);
}

/* ---------- session (cookie ลงลายเซ็น HMAC) ---------- */
function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) throw new Error("ไม่พบ AUTH_SECRET ใน .env.local (ยาวอย่างน้อย 16 ตัวอักษร)");
  return s;
}

const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url");

export async function createSession(userId: string) {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
  const payload = `${userId}.${exp}`;
  const jar = await cookies();
  jar.set(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

// ออกจากระบบของผู้ใช้ทั่วไปเท่านั้น (ไม่ยุ่งกับ cookie admin / เจ้าหน้าที่)
export async function destroySession() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  if (!raw) return null;
  const [userId, exp, sig] = raw.split(".");
  if (!userId || !exp || !sig) return null;

  const a = Buffer.from(sig);
  const b = Buffer.from(sign(`${userId}.${exp}`));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  if (Number(exp) < Date.now() / 1000) return null;
  if (!ObjectId.isValid(userId)) return null;

  const db = await getDb();
  const u = await db.collection("users").findOne({ _id: new ObjectId(userId) });
  if (!u) return null;
  return {
    id: u._id.toString(),
    username: u.username,
    name: u.name,
    phone: u.phone,
    empCode: typeof u.empCode === "string" ? u.empCode : null,
    companyId: typeof u.companyId === "number" ? u.companyId : null,
    departmentId: typeof u.departmentId === "number" ? u.departmentId : null,
    branchId: typeof u.branchId === "number" ? u.branchId : null,
  };
}

/* ---------- รหัสผ่านแยกสำหรับ admin / เจ้าหน้าที่ ---------- */
type Role = "admin" | "staff";

const ROLES: Record<Role, { cookie: string; maxAge: number; env: string }> = {
  admin: { cookie: ADMIN_COOKIE, maxAge: ADMIN_MAX_AGE, env: "ADMIN_PASSWORD" },
  staff: { cookie: STAFF_COOKIE, maxAge: STAFF_MAX_AGE, env: "STAFF_PASSWORD" },
};

function verifyRolePassword(role: Role, pw: string) {
  const expected = process.env[ROLES[role].env];
  if (!expected || expected.length < 8) return false;
  const a = createHash("sha256").update(pw).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

// cookie ปลดล็อก: เวลาหมดอายุ + ลายเซ็น HMAC ผูกกับ role (cookie admin เอาไปใช้กับหน้าสแกนไม่ได้ และกลับกัน)
async function createRoleUnlock(role: Role) {
  const { cookie, maxAge } = ROLES[role];
  const exp = Math.floor(Date.now() / 1000) + maxAge;
  const jar = await cookies();
  jar.set(cookie, `${exp}.${sign(`${role}:${exp}`)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  });
}

async function destroyRoleUnlock(role: Role) {
  const jar = await cookies();
  jar.delete(ROLES[role].cookie);
}

async function hasRoleUnlock(role: Role) {
  const jar = await cookies();
  const raw = jar.get(ROLES[role].cookie)?.value;
  if (!raw) return false;
  const [exp, sig] = raw.split(".");
  if (!exp || !sig) return false;

  const a = Buffer.from(sig);
  const b = Buffer.from(sign(`${role}:${exp}`));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  return Number(exp) >= Date.now() / 1000;
}

export const verifyAdminPassword = (pw: string) => verifyRolePassword("admin", pw);
export const createAdminUnlock = () => createRoleUnlock("admin");
export const destroyAdminUnlock = () => destroyRoleUnlock("admin");

export const verifyStaffPassword = (pw: string) => verifyRolePassword("staff", pw);
export const createStaffUnlock = () => createRoleUnlock("staff");
export const destroyStaffUnlock = () => destroyRoleUnlock("staff");

// สถานะสำหรับหน้า admin / หน้าสแกน: ปลดล็อกด้วยรหัสผ่านแล้วหรือยัง
export async function getAdminState(): Promise<{ unlocked: boolean }> {
  return { unlocked: await hasRoleUnlock("admin") };
}

export async function getStaffState(): Promise<{ unlocked: boolean }> {
  return { unlocked: await hasRoleUnlock("staff") };
}

// ใช้ใน /api/admin/*: ok=false → ตอบ 401 (ยังไม่ได้กรอกรหัส admin หรือหมดอายุ)
// user.id = "admin" ใช้บันทึกใน reviewedBy (ไม่มีบัญชีผู้ใช้แล้ว)
export async function requireAdmin(): Promise<
  { ok: true; user: { id: string } } | { ok: false; status: 401 | 403 }
> {
  if (!(await hasRoleUnlock("admin"))) return { ok: false, status: 401 };
  return { ok: true, user: { id: "admin" } };
}

// ใช้ใน /api/ticket/*: ok=false → ตอบ 401 (ยังไม่ได้กรอกรหัสเจ้าหน้าที่หรือหมดอายุ)
export async function requireStaff(): Promise<{ ok: true } | { ok: false; status: 401 }> {
  if (!(await hasRoleUnlock("staff"))) return { ok: false, status: 401 };
  return { ok: true };
}

/* ---------- กันเดารหัสผ่าน (นับในหน่วยความจำ รีเซ็ตเมื่อเซิร์ฟเวอร์รีสตาร์ต) ---------- */
const failMap = new Map<string, { count: number; lockedUntil: number }>();

// key ต่อ IP + ชนิดหน้า เช่น "admin:1.2.3.4"
export function clientKey(req: Request, scope: string) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip")?.trim() || "unknown";
  return `${scope}:${ip}`;
}

// คืนจำนวนนาทีที่ยังโดนล็อกอยู่ (0 = ไม่โดนล็อก)
export function lockedMinutes(key: string) {
  const rec = failMap.get(key);
  if (!rec || rec.lockedUntil <= Date.now()) return 0;
  return Math.ceil((rec.lockedUntil - Date.now()) / 60_000);
}

export function recordFail(key: string, maxFails = 5, lockMs = 15 * 60_000) {
  if (failMap.size > 5000) failMap.clear();
  const rec = failMap.get(key) ?? { count: 0, lockedUntil: 0 };
  rec.count += 1;
  if (rec.count >= maxFails) {
    rec.count = 0;
    rec.lockedUntil = Date.now() + lockMs;
  }
  failMap.set(key, rec);
}

export function clearFails(key: string) {
  failMap.delete(key);
}