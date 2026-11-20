import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { getSessionUser } from "@/lib/auth";
import { compressAvatar } from "@/lib/slip";
import { deleteAvatar, uploadAvatar } from "@/lib/drive";

const MAX_BYTES = 8 * 1024 * 1024;
const OK_TYPES = ["image/jpeg", "image/png", "image/webp"];

// ลิงก์ดูรูปใน Drive (เก็บไว้ใน users.avatarUrl ให้เห็นที่อยู่รูปของแต่ละบัญชีใน MongoDB)
// เปิดดูได้เฉพาะเจ้าของ Drive (ไฟล์ไม่ได้แชร์สาธารณะ) / หน้าเว็บดึงรูปผ่าน /api/avatar/[id] ตามเดิม
const driveUrl = (fileId: string) => `https://drive.google.com/file/d/${fileId}/view`;

// อัปโหลดรูปโปรไฟล์ (multipart field "avatar"): ครอปจัตุรัส 512×512 JPG → เก็บใน Drive โฟลเดอร์ profile
// แล้วบันทึก avatarFileId / avatarAt / avatarUrl ลงบัญชีผู้ใช้ใน MongoDB และลบรูปเก่าทิ้ง (ลบไม่สำเร็จไม่เป็นไร)
export async function POST(req: Request) {
  const user = await getSessionUser().catch(() => null);
  if (!user) return NextResponse.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("avatar");
  if (!(file instanceof File)) return NextResponse.json({ error: "ยังไม่ได้เลือกรูป" }, { status: 400 });
  if (!OK_TYPES.includes(file.type))
    return NextResponse.json({ error: "ใช้ได้เฉพาะรูป JPG / PNG / WebP" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "รูปใหญ่เกิน 8 MB" }, { status: 413 });

  let jpg: Buffer;
  try {
    jpg = await compressAvatar(Buffer.from(await file.arrayBuffer()));
  } catch {
    return NextResponse.json({ error: "อ่านรูปไม่ได้ ลองรูปอื่น" }, { status: 400 });
  }

  let fileId: string;
  try {
    fileId = await uploadAvatar(`${user.id}-${Date.now()}.jpg`, jpg);
  } catch (e) {
    console.error("อัปรูปโปรไฟล์ขึ้น Drive ไม่สำเร็จ:", e);
    return NextResponse.json({ error: "เก็บรูปไม่สำเร็จ ลองใหม่อีกครั้ง" }, { status: 502 });
  }

  const avatarAt = new Date().toISOString();
  const _id = new ObjectId(user.id);
  let prevFileId: string | null = null;

  try {
    const db = await getDb();
    const users = db.collection("users");
    const prev = await users.findOne({ _id }, { projection: { avatarFileId: 1 } });
    prevFileId = typeof prev?.avatarFileId === "string" ? prev.avatarFileId : null;

    const r = await users.updateOne(
      { _id },
      { $set: { avatarFileId: fileId, avatarAt, avatarUrl: driveUrl(fileId) } },
    );
    // ไม่พบบัญชี = บันทึกไม่ได้จริง: ห้ามตอบว่าสำเร็จ (ไม่งั้นรูปขึ้น Drive แต่ใน MongoDB ไม่มี)
    if (r.matchedCount !== 1) {
      console.error("บันทึกรูปโปรไฟล์ลง MongoDB ไม่สำเร็จ: ไม่พบบัญชี", user.id);
      deleteAvatar(fileId).catch((e) => console.error("ลบรูปที่บันทึกไม่สำเร็จ:", e));
      return NextResponse.json({ error: "บันทึกรูปไม่สำเร็จ ลองใหม่อีกครั้ง" }, { status: 500 });
    }
  } catch (e) {
    console.error("บันทึกรูปโปรไฟล์ลง MongoDB ไม่สำเร็จ:", e);
    deleteAvatar(fileId).catch((err) => console.error("ลบรูปที่บันทึกไม่สำเร็จ:", err));
    return NextResponse.json({ error: "บันทึกรูปไม่สำเร็จ ลองใหม่อีกครั้ง" }, { status: 500 });
  }

  if (prevFileId && prevFileId !== fileId) {
    deleteAvatar(prevFileId).catch((e) => console.error("ลบรูปโปรไฟล์เก่าไม่สำเร็จ:", e));
  }

  return NextResponse.json({ ok: true, avatarAt });
}

// ลบรูปโปรไฟล์ กลับไปใช้ตัวอักษรย่อ
export async function DELETE() {
  const user = await getSessionUser().catch(() => null);
  if (!user) return NextResponse.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });

  const db = await getDb();
  const users = db.collection("users");
  const _id = new ObjectId(user.id);
  const prev = await users.findOne({ _id }, { projection: { avatarFileId: 1 } });
  await users.updateOne({ _id }, { $unset: { avatarFileId: "", avatarAt: "", avatarUrl: "" } });

  if (typeof prev?.avatarFileId === "string") {
    deleteAvatar(prev.avatarFileId).catch((e) => console.error("ลบรูปโปรไฟล์ไม่สำเร็จ:", e));
  }

  return NextResponse.json({ ok: true });
}