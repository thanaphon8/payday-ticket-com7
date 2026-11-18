import { NextResponse } from "next/server";
import {
  clearFails,
  clientKey,
  createAdminUnlock,
  destroyAdminUnlock,
  getAdminState,
  lockedMinutes,
  recordFail,
  verifyAdminPassword,
} from "@/lib/auth";

// เข้าหน้า admin ด้วยรหัสผ่าน admin (ADMIN_PASSWORD) อย่างเดียว ไม่ต้องมีบัญชีผู้ใช้
// GET    → { unlocked } ให้หน้า admin ใช้ตัดสินว่าจะแสดงอะไร
// POST   → body = { password } ถูกต้องจะตั้ง cookie ปลดล็อก 12 ชั่วโมง
// DELETE → ล็อกกลับ (ลบ cookie ปลดล็อก)

export async function GET() {
  return NextResponse.json(await getAdminState(), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const key = clientKey(req, "admin");
  const mins = lockedMinutes(key);
  if (mins > 0) {
    return NextResponse.json({ error: `กรอกผิดหลายครั้ง ลองใหม่ใน ${mins} นาที` }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const password = typeof body?.password === "string" ? body.password.slice(0, 200) : "";

  if (!verifyAdminPassword(password)) {
    recordFail(key);
    return NextResponse.json({ error: "รหัสผ่าน admin ไม่ถูกต้อง" }, { status: 401 });
  }

  clearFails(key);
  await createAdminUnlock();
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  await destroyAdminUnlock();
  return NextResponse.json({ ok: true });
}