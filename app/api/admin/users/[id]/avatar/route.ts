import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/auth";
import { downloadAvatar } from "@/lib/drive";

// รูปโปรไฟล์ผู้ซื้อสำหรับหน้า admin (ต้องกรอกรหัส admin แล้ว) URL มี ?v=<avatarAt> เปลี่ยนรูปแล้ว URL ใหม่ จึงแคชได้นาน
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin().catch(() => null);
  if (!guard || !guard.ok) return new NextResponse(null, { status: 401 });

  const { id } = await params;
  if (!ObjectId.isValid(id)) return new NextResponse(null, { status: 404 });

  const db = await getDb();
  const u = await db.collection("users").findOne({ _id: new ObjectId(id) }, { projection: { avatarFileId: 1 } });
  if (!u || typeof u.avatarFileId !== "string") return new NextResponse(null, { status: 404 });

  try {
    const buf = await downloadAvatar(u.avatarFileId);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch (e) {
    console.error("ดึงรูปโปรไฟล์ไม่สำเร็จ:", e);
    return new NextResponse(null, { status: 502 });
  }
}