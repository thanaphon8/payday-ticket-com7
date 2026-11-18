import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { createSession, hashPassword, validPassword, validPhone, validUsername } from "@/lib/auth";
import { EMP_CODE_LENGTH, validEmpCode } from "@/lib/tickets";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const username = String(body?.username ?? "").trim();
  const password = String(body?.password ?? "");
  const name = String(body?.name ?? "").trim();
  const phone = String(body?.phone ?? "").replace(/\D/g, "");
  const empCode = String(body?.empCode ?? "").replace(/\D/g, "");

  if (name.length < 2) return NextResponse.json({ error: "กรอกชื่อ-นามสกุลให้ครบ" }, { status: 400 });
  if (!validPhone(phone))
    return NextResponse.json({ error: "เบอร์โทรต้องมี 10 หลัก ขึ้นต้นด้วย 0" }, { status: 400 });
  if (!validEmpCode(empCode))
    return NextResponse.json({ error: `รหัสพนักงานต้องเป็นตัวเลข ${EMP_CODE_LENGTH} หลัก` }, { status: 400 });
  if (!validUsername(username))
    return NextResponse.json(
      { error: "username ต้องยาว 3-20 ตัว ใช้ได้เฉพาะ a-z 0-9 . _" },
      { status: 400 },
    );
  if (!validPassword(password))
    return NextResponse.json({ error: "รหัสผ่านต้องยาวอย่างน้อย 6 ตัวอักษร" }, { status: 400 });

  try {
    const db = await getDb();
    const res = await db.collection("users").insertOne({
      username,
      usernameLower: username.toLowerCase(),
      passwordHash: await hashPassword(password),
      name,
      phone,
      empCode,
      createdAt: new Date().toISOString(),
    });
    const id = res.insertedId.toString();
    await createSession(id);
    return NextResponse.json({ user: { id, username, name, phone, empCode } });
  } catch (e) {
    if ((e as { code?: number }).code === 11000)
      return NextResponse.json({ error: "username นี้ถูกใช้แล้ว" }, { status: 409 });
    console.error(e);
    return NextResponse.json({ error: "สมัครสมาชิกไม่สำเร็จ ลองใหม่อีกครั้ง" }, { status: 500 });
  }
}