import { createHash, createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { cookies } from "next/headers";
import { ObjectId } from "mongodb";
import { getDb } from "./mongodb";
import { BOOTHS, boothById, boothCreds, type Booth } from "./booths";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export const COOKIE = "payday-session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 วัน

// admin ใช้รหัสผ่านเดียว (ADMIN_PASSWORD) / ซุ้มและจุดรับตั๋วกระดาษใช้ username + รหัสผ่านของแต่ละบัญชี (ดู lib/booths.ts)
// ไม่ตั้งหรือสั้นไป = ปิดบัญชีนั้นทั้งหมด (fail closed)
export const ADMIN_COOKIE = "payday-admin";
export const ADMIN_MAX_AGE = 60 * 60 * 12; // 12 ชั่วโมง
export const BOOTH_COOKIE = "payday-booth";
export const BOOTH_MAX_AGE = 60 * 60 * 12; // 12 ชั่วโมง

export type SessionUser = {
  id: string;
  username: string;
  name: string;
  phone: string;
  empCode: string | null;
  companyId?: number | null;
  departmentId?: number | null;
  branchId?: number | null;
  avatarAt?: string | null; // ISO: เวลาที่อัปโหลดรูปโปรไฟล์ล่าสุด (null = ยังไม่มีรูป) ใช้ต่อท้าย URL กันแคชรูปเก่า
  bannedUntil?: string | null; // ISO: ถูกแบนจนถึงเวลานี้ (null = ไม่ถูกแบน หรือหมดเวลาแบนแล้ว)
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

// ออกจากระบบของผู้ใช้ทั่วไปเท่านั้น (ไม่ยุ่งกับ cookie admin / ซุ้ม)
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
    avatarAt: typeof u.avatarFileId === "string" && typeof u.avatarAt === "string" ? u.avatarAt : null,
    bannedUntil:
      typeof u.bannedUntil === "string" && Date.parse(u.bannedUntil) > Date.now() ? u.bannedUntil : null,
  };
}

/* ---------- แบนผู้ใช้ (อัตโนมัติจากสลีปไม่ผ่าน หรือ admin แบนเอง) ----------
   ถูกแบน = สร้างรายการชำระเงินและส่งสลีปไม่ได้ (ดูตั๋วเดิมและเข้าสู่ระบบได้ตามปกติ)
   เก็บใน users.bannedUntil (ISO) หมดเวลาแล้วใช้งานได้เองโดยไม่ต้องล้างค่า / admin ปลดแบนก่อนเวลาได้ที่หน้า admin
   แบนถาวร = bannedUntil เป็นปี 9999 (ปลดได้โดย admin เท่านั้น)
   banPaymentId = รายการที่ทำให้ถูกแบน (หน้า admin แถบ "ถูกแบน" ใช้แสดงรูปสลีปและผลตรวจ) */
export const BAN_MINUTES = 60;
export const PERMANENT_BAN_ISO = "9999-12-31T00:00:00.000Z";
export const isPermanentBan = (until: string) => Date.parse(until) >= Date.parse("9000-01-01T00:00:00.000Z");

// minutes = null → แบนถาวร / คืนเวลาที่แบนถึง (ISO)
export async function banUser(
  userId: string | ObjectId,
  reason: string,
  minutes: number | null = BAN_MINUTES,
  paymentId?: string | ObjectId | null,
): Promise<string> {
  const now = Date.now();
  const until = minutes === null ? PERMANENT_BAN_ISO : new Date(now + minutes * 60_000).toISOString();
  const set = { bannedUntil: until, banReason: reason, bannedAt: new Date(now).toISOString() };
  const db = await getDb();
  const users = db.collection("users");
  const _id = new ObjectId(String(userId));
  if (paymentId && ObjectId.isValid(String(paymentId))) {
    await users.updateOne({ _id }, { $set: { ...set, banPaymentId: new ObjectId(String(paymentId)) } });
  } else {
    await users.updateOne({ _id }, { $set: set, $unset: { banPaymentId: "" } });
  }
  return until;
}

export async function unbanUser(userId: string | ObjectId) {
  const db = await getDb();
  await db
    .collection("users")
    .updateOne(
      { _id: new ObjectId(String(userId)) },
      { $unset: { bannedUntil: "", banReason: "", bannedAt: "", banPaymentId: "" } },
    );
}

// ข้อความแจ้งผู้ใช้ที่ถูกแบน
export function banMessage(until: string) {
  if (isPermanentBan(until))
    return "บัญชีถูกระงับการสร้างรายการและส่งสลีปถาวร หากเข้าใจผิดกรุณาติดต่อเจ้าหน้าที่";
  const t = new Date(until);
  const sameDay = t.getTime() - Date.now() < 12 * 3_600_000;
  const when = sameDay
    ? `${t.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" })} น.`
    : `${t.toLocaleString("th-TH", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Bangkok",
      })} น.`;
  return `บัญชีถูกระงับการสร้างรายการและส่งสลีปชั่วคราวถึง ${when} หากเข้าใจผิดกรุณาติดต่อเจ้าหน้าที่`;
}

/* ---------- รหัสผ่านแยกสำหรับ admin ---------- */
type Role = "admin";

const ROLES: Record<Role, { cookie: string; maxAge: number; env: string }> = {
  admin: { cookie: ADMIN_COOKIE, maxAge: ADMIN_MAX_AGE, env: "ADMIN_PASSWORD" },
};

const safeEq = (a: string, b: string) =>
  timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());

function verifyRolePassword(role: Role, pw: string) {
  const expected = process.env[ROLES[role].env];
  if (!expected || expected.length < 8) return false;
  return safeEq(pw, expected);
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

// สถานะสำหรับหน้า admin: ปลดล็อกด้วยรหัสผ่านแล้วหรือยัง
export async function getAdminState(): Promise<{ unlocked: boolean }> {
  return { unlocked: await hasRoleUnlock("admin") };
}

// ใช้ใน /api/admin/*: ok=false → ตอบ 401 (ยังไม่ได้กรอกรหัส admin หรือหมดอายุ)
// user.id = "admin" ใช้บันทึกใน reviewedBy (ไม่มีบัญชีผู้ใช้แล้ว)
export async function requireAdmin(): Promise<
  { ok: true; user: { id: string } } | { ok: false; status: 401 | 403 }
> {
  if (!(await hasRoleUnlock("admin"))) return { ok: false, status: 401 };
  return { ok: true, user: { id: "admin" } };
}

/* ---------- บัญชีซุ้ม / จุดรับตั๋วกระดาษ (หน้า /ticket) ---------- */
export type BoothInfo = Pick<Booth, "id" | "name" | "kind">;
export const boothInfo = (b: Booth): BoothInfo => ({ id: b.id, name: b.name, kind: b.kind });

// ตรวจ username + รหัสผ่านกับทุกบัญชีเสมอ (ไม่หยุดเมื่อเจอ) กันวัดเวลาเดา username
export function verifyBoothLogin(username: string, password: string): Booth | null {
  let found: Booth | null = null;
  for (const b of BOOTHS) {
    const c = boothCreds(b);
    const valid = c.user.length > 0 && c.password.length >= 8;
    const okUser = safeEq(username, c.user);
    const okPass = safeEq(password, c.password);
    if (valid && okUser && okPass && !found) found = b;
  }
  return found;
}

// cookie ปลดล็อกของซุ้ม: ผูก id ซุ้ม + เวลาหมดอายุ + ลายเซ็น HMAC
export async function createBoothUnlock(boothId: string) {
  const exp = Math.floor(Date.now() / 1000) + BOOTH_MAX_AGE;
  const jar = await cookies();
  jar.set(BOOTH_COOKIE, `${boothId}.${exp}.${sign(`booth:${boothId}:${exp}`)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: BOOTH_MAX_AGE,
  });
}

export async function destroyBoothUnlock() {
  const jar = await cookies();
  jar.delete(BOOTH_COOKIE);
}

async function getBoothSession(): Promise<Booth | null> {
  const jar = await cookies();
  const raw = jar.get(BOOTH_COOKIE)?.value;
  if (!raw) return null;
  const [id, exp, sig] = raw.split(".");
  if (!id || !exp || !sig) return null;

  const a = Buffer.from(sig);
  const b = Buffer.from(sign(`booth:${id}:${exp}`));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  if (Number(exp) < Date.now() / 1000) return null;
  return boothById(id) ?? null;
}

// สถานะสำหรับหน้า /ticket: ล็อกอินอยู่ไหม + เป็นบัญชีไหน
export async function getBoothState(): Promise<{ unlocked: boolean; booth: BoothInfo | null }> {
  const b = await getBoothSession();
  return { unlocked: !!b, booth: b ? boothInfo(b) : null };
}

// ใช้ใน /api/ticket/*: ok=false → ตอบ 401 (ยังไม่ล็อกอินหรือหมดอายุ)
export async function requireBooth(): Promise<{ ok: true; booth: Booth } | { ok: false; status: 401 }> {
  const b = await getBoothSession();
  if (!b) return { ok: false, status: 401 };
  return { ok: true, booth: b };
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