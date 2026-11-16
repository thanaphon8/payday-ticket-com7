import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { getSessionUser } from "@/lib/auth";

// ทำเครื่องหมายว่าตั๋วใบนี้ใช้แล้ว (ได้เฉพาะตั๋วของตัวเอง และใช้ซ้ำไม่ได้)
export async function POST(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const user = await getSessionUser().catch(() => null);
  if (!user) return NextResponse.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });

  const { code } = await params;
  const usedAt = new Date().toISOString();

  const db = await getDb();
  const res = await db
    .collection("orders")
    .updateOne(
      { code, userId: new ObjectId(user.id), used: { $ne: true } },
      { $set: { used: true, usedAt } },
    );

  if (res.matchedCount === 0)
    return NextResponse.json({ error: "ไม่พบตั๋ว หรือตั๋วถูกใช้ไปแล้ว" }, { status: 404 });
  return NextResponse.json({ ok: true, usedAt });
}