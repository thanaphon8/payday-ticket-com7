import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { getSessionUser } from "@/lib/auth";
import { compressAvatar } from "@/lib/slip";
import { deleteAvatar, uploadAvatar } from "@/lib/drive";

const MAX_BYTES = 8 * 1024 * 1024;
const OK_TYPES = ["image/jpeg", "image/png", "image/webp"];

// อัปโหลดรูปโปรไฟล์ (multipart field "avatar"): ครอปจัตุรัส 512×512 JPG → เก็บใน Drive โฟลเดอร์ profile
// แล้วลบรูปเก่าของผู้ใช้คนนี้ทิ้ง (ลบไม่สำเร็จไม่เป็นไร)
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

  const db = await getDb();
  const users = db.collection("users");
  const _id = new ObjectId(user.id);
  const prev = await users.findOne({ _id }, { projection: { avatarFileId: 1 } });
  const avatarAt = new Date().toISOString();
  await users.updateOne({ _id }, { $set: { avatarFileId: fileId, avatarAt } });

  if (typeof prev?.avatarFileId === "string") {
    deleteAvatar(prev.avatarFileId).catch((e) => console.error("ลบรูปโปรไฟล์เก่าไม่สำเร็จ:", e));
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
  await users.updateOne({ _id }, { $unset: { avatarFileId: "", avatarAt: "" } });

  if (typeof prev?.avatarFileId === "string") {
    deleteAvatar(prev.avatarFileId).catch((e) => console.error("ลบรูปโปรไฟล์ไม่สำเร็จ:", e));
  }

  return NextResponse.json({ ok: true });
}