import { NextResponse } from "next/server";
import {
  clearFails,
  clientKey,
  createStaffUnlock,
  destroyStaffUnlock,
  getStaffState,
  lockedMinutes,
  recordFail,
  verifyStaffPassword,
} from "@/lib/auth";

// เจ้าหน้าที่สแกนตั๋วเข้าหน้า /ticket ด้วยรหัสผ่านเจ้าหน้าที่ (STAFF_PASSWORD) แยกจากรหัส admin
// GET    → { unlocked }
// POST   → body = { password } ถูกต้องจะตั้ง cookie ปลดล็อก 12 ชั่วโมง
// DELETE → ล็อกกลับ

export async function GET() {
  return NextResponse.json(await getStaffState(), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const key = clientKey(req, "staff");
  const mins = lockedMinutes(key);
  if (mins > 0) {
    return NextResponse.json({ error: `กรอกผิดหลายครั้ง ลองใหม่ใน ${mins} นาที` }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const password = typeof body?.password === "string" ? body.password.slice(0, 200) : "";

  if (!verifyStaffPassword(password)) {
    recordFail(key);
    return NextResponse.json({ error: "รหัสผ่านเจ้าหน้าที่ไม่ถูกต้อง" }, { status: 401 });
  }

  clearFails(key);
  await createStaffUnlock();
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  await destroyStaffUnlock();
  return NextResponse.json({ ok: true });
}