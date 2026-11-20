import { NextResponse } from "next/server";
import {
  boothInfo,
  clearFails,
  clientKey,
  createBoothUnlock,
  destroyBoothUnlock,
  getBoothState,
  lockedMinutes,
  recordFail,
  verifyBoothLogin,
} from "@/lib/auth";

// บัญชีซุ้ม / จุดรับตั๋วกระดาษ เข้าหน้า /ticket ด้วย username + รหัสผ่านของตัวเอง (ตั้งใน .env.local ดู lib/booths.ts)
// GET    → { unlocked, booth }
// POST   → body = { username, password } ถูกต้องจะตั้ง cookie ปลดล็อก 12 ชั่วโมง
// DELETE → ล็อกกลับ

export async function GET() {
  return NextResponse.json(await getBoothState(), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const username = typeof body?.username === "string" ? body.username.trim().slice(0, 60) : "";
  const password = typeof body?.password === "string" ? body.password.slice(0, 200) : "";

  // นับต่อ IP + username (หน้างานทุกซุ้มใช้ wifi เดียวกัน กันซุ้มหนึ่งกรอกผิดแล้วล็อกทั้งงาน)
  const key = clientKey(req, `booth:${username.toLowerCase()}`);
  const mins = lockedMinutes(key);
  if (mins > 0) {
    return NextResponse.json({ error: `กรอกผิดหลายครั้ง ลองใหม่ใน ${mins} นาที` }, { status: 429 });
  }

  const booth = verifyBoothLogin(username, password);
  if (!booth) {
    recordFail(key);
    return NextResponse.json({ error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" }, { status: 401 });
  }

  clearFails(key);
  await createBoothUnlock(booth.id);
  return NextResponse.json({ ok: true, booth: boothInfo(booth) });
}

export async function DELETE() {
  await destroyBoothUnlock();
  return NextResponse.json({ ok: true });
}