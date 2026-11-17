import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { cookies } from "next/headers";
import { ObjectId } from "mongodb";
import { getDb } from "./mongodb";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export const COOKIE = "payday-session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 วัน

export type SessionUser = { id: string; username: string; name: string; phone: string; isAdmin?: boolean };

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

export async function destroySession() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

// admin = user ที่มี role: "admin" ใน MongoDB หรือ username อยู่ใน ADMIN_USERNAMES (คั่นด้วย ,)
function isAdminUser(u: Record<string, unknown>) {
  if (u.role === "admin") return true;
  const names = (process.env.ADMIN_USERNAMES ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return names.includes(String(u.username ?? "").toLowerCase());
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
  return { id: u._id.toString(), username: u.username, name: u.name, phone: u.phone, isAdmin: isAdminUser(u) };
}

// ใช้ใน /api/admin/*: ok=false → ตอบ 401 (ยังไม่ login) หรือ 403 (ไม่ใช่ admin)
export async function requireAdmin(): Promise<{ ok: true; user: SessionUser } | { ok: false; status: 401 | 403 }> {
  const user = await getSessionUser().catch(() => null);
  if (!user) return { ok: false, status: 401 };
  if (!user.isAdmin) return { ok: false, status: 403 };
  return { ok: true, user };
}