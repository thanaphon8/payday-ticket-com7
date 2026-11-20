import { NextResponse } from "next/server";
import { ObjectId, type Document, type WithId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { banUser, requireAdmin, unbanUser } from "@/lib/auth";
import type { PaymentTicket } from "@/lib/tickets";
import type { SlipCheck } from "@/lib/slipOcr";

// ระยะเวลาแบนที่ admin เลือกได้ (นาที) null = ถาวร
const DURATIONS: Record<string, number | null> = {
  "1h": 60,
  "24h": 24 * 60,
  "7d": 7 * 24 * 60,
  permanent: null,
};

// รูปแบบเดียวกับรายการในหน้า "รอตรวจ" (/api/admin/payments) เพื่อให้การ์ดหน้าถูกแบนแสดงเหมือนกัน
function toItem(d: WithId<Document>, slip: WithId<Document> | undefined) {
  const tickets = (d.tickets as PaymentTicket[] | undefined) ?? [];
  return {
    id: d._id.toString(),
    ref: d.ref as string,
    name: d.name as string,
    phone: d.phone as string,
    amount: d.amount as number,
    status: d.status as string,
    auto: d.status === "approved" && d.reviewedBy === "auto",
    createdAt: d.createdAt as string,
    slipAt: (d.slipAt as string | undefined) ?? null,
    booth: tickets.filter((t) => t.ticket === "booth").length,
    lucky: tickets.filter((t) => t.ticket === "lucky").length,
    rejectReason: (d.rejectReason as string | undefined) ?? null,
    slip: slip
      ? {
          transRef: slip.transRef as string,
          sendingBank: slip.sendingBank as string,
          check: (slip.check as SlipCheck | undefined) ?? null,
        }
      : null,
  };
}

// รายชื่อผู้ใช้ที่ถูกแบนอยู่ตอนนี้ (bannedUntil ยังไม่ถึงเวลา) พร้อมรายการ + สลีปที่ทำให้ถูกแบน
// รายการที่ทำให้ถูกแบน = users.banPaymentId / แบนเก่าที่ไม่ได้เก็บไว้ ใช้รายการล่าสุดที่เคยส่งสลีปแทน (payment = null ถ้าไม่เคยส่ง)
// คืน { bans: [{ id, username, name, phone, bannedUntil, bannedAt, banReason, payment }] } (แบนถาวร bannedUntil = ปี 9999)
export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok)
    return NextResponse.json({ error: guard.status === 401 ? "กรุณาเข้าสู่ระบบ" : "ไม่มีสิทธิ์" }, { status: guard.status });

  const db = await getDb();
  const payments = db.collection("payments");
  const users = await db
    .collection("users")
    .find({ bannedUntil: { $gt: new Date().toISOString() } })
    .sort({ bannedAt: -1 })
    .limit(200)
    .toArray();

  const wantedIds = users.map((u) => u.banPaymentId).filter((x): x is ObjectId => x instanceof ObjectId);
  const wanted = wantedIds.length ? await payments.find({ _id: { $in: wantedIds } }).toArray() : [];
  const payById = new Map(wanted.map((p) => [p._id.toString(), p]));

  const payOf = await Promise.all(
    users.map(async (u) => {
      const found = u.banPaymentId instanceof ObjectId ? payById.get(u.banPaymentId.toString()) : undefined;
      if (found) return found;
      return payments.findOne({ userId: u._id, slipId: { $ne: null } }, { sort: { slipAt: -1 } });
    }),
  );

  const slipIds = payOf.map((p) => p?.slipId).filter((x): x is ObjectId => x instanceof ObjectId);
  const slipDocs = slipIds.length ? await db.collection("slips").find({ _id: { $in: slipIds } }).toArray() : [];
  const slipById = new Map(slipDocs.map((s) => [s._id.toString(), s]));

  return NextResponse.json({
    bans: users.map((u, i) => {
      const p = payOf[i];
      return {
        id: u._id.toString(),
        username: (u.username as string | undefined) ?? "",
        name: (u.name as string | undefined) ?? "",
        phone: (u.phone as string | undefined) ?? "",
        bannedUntil: u.bannedUntil as string,
        bannedAt: (u.bannedAt as string | undefined) ?? null,
        banReason: (u.banReason as string | undefined) ?? null,
        payment: p ? toItem(p, p.slipId ? slipById.get(String(p.slipId)) : undefined) : null,
      };
    }),
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

    const until = await banUser(
      pay.userId,
      `admin แบนเอง (รายการ ${String(pay.ref ?? "")})`,
      DURATIONS[duration],
      pay._id,
    );
    return NextResponse.json({ ok: true, bannedUntil: until });
  }

  return NextResponse.json({ error: "คำขอไม่ถูกต้อง" }, { status: 400 });
}