import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { createSession, verifyPassword } from "@/lib/auth";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const username = String(body?.username ?? "").trim().toLowerCase();
  const password = String(body?.password ?? "");

  if (!username || !password)
    return NextResponse.json({ error: "กรอก username และรหัสผ่าน" }, { status: 400 });

  try {
    const db = await getDb();
    const u = await db.collection("users").findOne({ usernameLower: username });
    const ok = u ? await verifyPassword(password, u.passwordHash as string) : false;
    if (!u || !ok)
      return NextResponse.json({ error: "username หรือรหัสผ่านไม่ถูกต้อง" }, { status: 401 });

    const id = u._id.toString();
    await createSession(id);
    return NextResponse.json({
      user: {
        id,
        username: u.username,
        name: u.name,
        phone: u.phone,
        empCode: typeof u.empCode === "string" ? u.empCode : null,
        companyId: typeof u.companyId === "number" ? u.companyId : null,
        departmentId: typeof u.departmentId === "number" ? u.departmentId : null,
        branchId: typeof u.branchId === "number" ? u.branchId : null,
      },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "เข้าสู่ระบบไม่สำเร็จ ลองใหม่อีกครั้ง" }, { status: 500 });
  }
}