import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { getSessionUser, validPhone } from "@/lib/auth";

// ดูข้อมูลผู้ใช้ที่ login อยู่ (ไม่ login = user: null)
export async function GET() {
  try {
    const user = await getSessionUser();
    return NextResponse.json({ user });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ user: null }, { status: 500 });
  }
}

// แก้ชื่อ/เบอร์โทรในโปรไฟล์
export async function PATCH(req: Request) {
  const user = await getSessionUser().catch(() => null);
  if (!user) return NextResponse.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const name = String(body?.name ?? "").trim();
  const phone = String(body?.phone ?? "").replace(/\D/g, "");
  if (name.length < 2) return NextResponse.json({ error: "กรอกชื่อ-นามสกุลให้ครบ" }, { status: 400 });
  if (!validPhone(phone))
    return NextResponse.json({ error: "เบอร์โทรต้องมี 10 หลัก ขึ้นต้นด้วย 0" }, { status: 400 });

  const db = await getDb();
  await db.collection("users").updateOne({ _id: new ObjectId(user.id) }, { $set: { name, phone } });
  return NextResponse.json({ user: { ...user, name, phone } });
}