import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { createSession, hashPassword, validPassword, validPhone, validUsername } from "@/lib/auth";
import { EMP_CODE_LENGTH, validEmpCode } from "@/lib/tickets";
import { validateOrg } from "../../../components/branches";

// รับ id เป็นเลขจำนวนเต็มบวก (ตัวเลขหรือสตริงตัวเลข) ไม่ใช่ = null
const toId = (v: unknown): number | null => {
  const n =
    typeof v === "number" ? v : typeof v === "string" && /^\d{1,5}$/.test(v) ? Number(v) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
};

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const username = String(body?.username ?? "").trim();
  const password = String(body?.password ?? "");
  const name = String(body?.name ?? "").trim();
  const phone = String(body?.phone ?? "").replace(/\D/g, "");
  const empCode = String(body?.empCode ?? "").replace(/\D/g, "");
  const companyId = toId(body?.companyId);
  const departmentId = toId(body?.departmentId);
  const branchId = toId(body?.branchId);

  // ตรวจทุกช่องแล้วตอบกลับเป็น errors รายช่อง (หน้าสมัครเด้งกลับไปขั้นที่ผิดให้เอง)
  const errors: Record<string, string> = {};
  if (name.length < 2) errors.name = "กรอกชื่อ-นามสกุลให้ครบ";
  if (!validPhone(phone)) errors.phone = "เบอร์โทรต้องมี 10 หลัก ขึ้นต้นด้วย 0";
  if (!validEmpCode(empCode)) errors.empCode = `รหัสพนักงานต้องเป็นตัวเลข ${EMP_CODE_LENGTH} หลัก`;
  if (!validUsername(username)) errors.username = "username ต้องยาว 3-20 ตัว ใช้ได้เฉพาะ a-z 0-9 . _";
  if (!validPassword(password)) errors.password = "รหัสผ่านต้องยาวอย่างน้อย 6 ตัวอักษร";
  // บริษัทบังคับ / แผนกหรือสาขา (ตามที่บริษัทนั้นมี) บังคับ และต้องอยู่ในบริษัทที่เลือก
  if (!companyId) errors.companyId = "เลือกบริษัท";
  else Object.assign(errors, validateOrg(companyId, departmentId, branchId));
  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ errors }, { status: 400 });
  }

  try {
    const db = await getDb();
    const res = await db.collection("users").insertOne({
      username,
      usernameLower: username.toLowerCase(),
      passwordHash: await hashPassword(password),
      name,
      phone,
      empCode,
      companyId,
      departmentId,
      branchId,
      createdAt: new Date().toISOString(),
    });
    const id = res.insertedId.toString();
    await createSession(id);
    return NextResponse.json({
      user: { id, username, name, phone, empCode, companyId, departmentId, branchId },
    });
  } catch (e) {
    if ((e as { code?: number }).code === 11000)
      return NextResponse.json({ errors: { username: "username นี้ถูกใช้แล้ว" } }, { status: 409 });
    console.error(e);
    return NextResponse.json({ error: "สมัครสมาชิกไม่สำเร็จ ลองใหม่อีกครั้ง" }, { status: 500 });
  }
}