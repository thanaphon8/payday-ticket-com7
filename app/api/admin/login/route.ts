import { NextResponse } from "next/server";
import { createAdminUnlock, destroyAdminUnlock, getAdminState, getSessionUser, verifyAdminPassword } from "@/lib/auth";

// ปลดล็อกหน้า admin ด้วยรหัสผ่าน admin (ADMIN_PASSWORD)
// GET    → { loggedIn, isAdmin, unlocked } ให้หน้า admin ใช้ตัดสินว่าจะแสดงอะไร
// POST   → body = { password } ถูกต้องจะตั้ง cookie ปลดล็อก 12 ชั่วโมง
// DELETE → ล็อกกลับ (ลบ cookie ปลดล็อก)

const MAX_FAILS = 5;
const LOCK_MS = 15 * 60_000;
// นับครั้งที่กรอกผิดต่อ user เก็บในหน่วยความจำ (รีเซ็ตเมื่อเซิร์ฟเวอร์รีสตาร์ต)
const fails = new Map<string, { count: number; lockedUntil: number }>();

export async function GET() {
  return NextResponse.json(await getAdminState(), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const user = await getSessionUser().catch(() => null);
  if (!user) return NextResponse.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "ไม่มีสิทธิ์" }, { status: 403 });

  const rec = fails.get(user.id) ?? { count: 0, lockedUntil: 0 };
  const now = Date.now();
  if (rec.lockedUntil > now) {
    const mins = Math.ceil((rec.lockedUntil - now) / 60_000);
    return NextResponse.json({ error: `กรอกผิดหลายครั้ง ลองใหม่ใน ${mins} นาที` }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const password = typeof body?.password === "string" ? body.password.slice(0, 200) : "";

  if (!verifyAdminPassword(password)) {
    rec.count += 1;
    if (rec.count >= MAX_FAILS) {
      rec.count = 0;
      rec.lockedUntil = now + LOCK_MS;
    }
    fails.set(user.id, rec);
    return NextResponse.json({ error: "รหัสผ่าน admin ไม่ถูกต้อง" }, { status: 401 });
  }

  fails.delete(user.id);
  await createAdminUnlock(user.id);
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  await destroyAdminUnlock();
  return NextResponse.json({ ok: true });
}