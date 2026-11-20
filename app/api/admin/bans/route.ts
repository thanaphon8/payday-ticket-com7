import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { banUser, requireAdmin, unbanUser } from "@/lib/auth";

// ระยะเวลาแบนที่ admin เลือกได้ (นาที) null = ถาวร
const DURATIONS: Record<string, number | null> = {
  "1h": 60,
  "24h": 24 * 60,
  "7d": 7 * 24 * 60,
  permanent: null,
};

// รายชื่อผู้ใช้ที่ถูกแบนอยู่ตอนนี้ (bannedUntil ยังไม่ถึงเวลา)
// คืน { bans: [{ id, username, name, phone, bannedUntil, bannedAt, banReason }] } (แบนถาวร bannedUntil = ปี 9999)
export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok)
    return NextResponse.json({ error: guard.status === 401 ? "กรุณาเข้าสู่ระบบ" : "ไม่มีสิทธิ์" }, { status: guard.status });

  const db = await getDb();
  const docs = await db
    .collection("users")
    .find({ bannedUntil: { $gt: new Date().toISOString() } })
    .sort({ bannedAt: -1 })
    .limit(200)
    .toArray();

  return NextResponse.json({
    bans: docs.map((u) => ({
      id: u._id.toString(),
      username: (u.username as string | undefined) ?? "",
      name: (u.name as string | undefined) ?? "",
      phone: (u.phone as string | undefined) ?? "",
      bannedUntil: u.bannedUntil as string,
      bannedAt: (u.bannedAt as string | undefined) ?? null,
      banReason: (u.banReason as string | undefined) ?? null,
    })),
  });
}

// POST body:
//  - { action: "unban", userId }                          ปลดแบน
//  - { action: "ban", paymentId, duration }               admin แบนผู้ซื้อของรายการนั้นเอง (duration = 1h | 24h | 7d | permanent)
//    แบนอย่างเดียว ไม่ยุ่งกับสถานะรายการ (ยังค้างรอ admin อนุมัติ/ปฏิเสธ)
export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok)
    return NextResponse.json({ error: guard.status === 401 ? "กรุณาเข้าสู่ระบบ" : "ไม่มีสิทธิ์" }, { status: guard.status });

  const body = await req.json().catch(() => null);

  if (body?.action === "unban") {
    const userId = String(body?.userId ?? "");
    if (!ObjectId.isValid(userId)) return NextResponse.json({ error: "คำขอไม่ถูกต้อง" }, { status: 400 });
    await unbanUser(userId);
    return NextResponse.json({ ok: true });
  }

  if (body?.action === "ban") {
    const paymentId = String(body?.paymentId ?? "");
    const duration = String(body?.duration ?? "");
    if (!ObjectId.isValid(paymentId) || !Object.prototype.hasOwnProperty.call(DURATIONS, duration))
      return NextResponse.json({ error: "คำขอไม่ถูกต้อง" }, { status: 400 });

    const db = await getDb();
    const pay = await db.collection("payments").findOne({ _id: new ObjectId(paymentId) });
    if (!pay || !(pay.userId instanceof ObjectId))
      return NextResponse.json({ error: "ไม่พบรายการหรือผู้ซื้อ" }, { status: 404 });

    const exists = await db.collection("users").countDocuments({ _id: pay.userId }, { limit: 1 });
    if (exists === 0) return NextResponse.json({ error: "ไม่พบบัญชีผู้ซื้อ" }, { status: 404 });

    const until = await banUser(pay.userId, `admin แบนเอง (รายการ ${String(pay.ref ?? "")})`, DURATIONS[duration]);
    return NextResponse.json({ ok: true, bannedUntil: until });
  }

  return NextResponse.json({ error: "คำขอไม่ถูกต้อง" }, { status: 400 });
}