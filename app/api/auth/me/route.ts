import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { getSessionUser, validPhone } from "@/lib/auth";
import { EMP_CODE_LENGTH, validEmpCode } from "@/lib/tickets";

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
// รหัสพนักงาน (empCode): ตั้งได้ครั้งเดียว เฉพาะบัญชีเก่าที่ยังไม่มีรหัส ตั้งแล้วแก้ไม่ได้ (ค่าที่ส่งมาซ้ำจะถูกข้าม)
export async function PATCH(req: Request) {
  const user = await getSessionUser().catch(() => null);
  if (!user) return NextResponse.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const name = String(body?.name ?? "").trim();
  const phone = String(body?.phone ?? "").replace(/\D/g, "");
  const empCode = String(body?.empCode ?? "").replace(/\D/g, "");
  if (name.length < 2) return NextResponse.json({ error: "กรอกชื่อ-นามสกุลให้ครบ" }, { status: 400 });
  if (!validPhone(phone))
    return NextResponse.json({ error: "เบอร์โทรต้องมี 10 หลัก ขึ้นต้นด้วย 0" }, { status: 400 });

  const wantsEmp = !user.empCode && empCode.length > 0;
  if (wantsEmp && !validEmpCode(empCode))
    return NextResponse.json({ error: `รหัสพนักงานต้องเป็นตัวเลข ${EMP_CODE_LENGTH} หลัก` }, { status: 400 });

  const db = await getDb();
  const users = db.collection("users");
  const _id = new ObjectId(user.id);
  await users.updateOne({ _id }, { $set: { name, phone } });

  let finalEmp = user.empCode;
  if (wantsEmp) {
    // ตั้งได้เฉพาะตอนที่ยังไม่มีรหัส (กันสองเครื่องกดชนกัน)
    const r = await users.updateOne({ _id, empCode: { $exists: false } }, { $set: { empCode } });
    if (r.matchedCount === 1) finalEmp = empCode;
    else finalEmp = (await getSessionUser().catch(() => null))?.empCode ?? null;
  }

  return NextResponse.json({ user: { ...user, name, phone, empCode: finalEmp } });
}