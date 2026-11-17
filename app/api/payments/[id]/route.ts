import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { getSessionUser } from "@/lib/auth";
import { expireStale, fulfillPayment, toOrder, toPaymentInfo, type PaymentTicket } from "@/lib/tickets";
import { makeQrDataUrl } from "@/lib/billerQr";

// หน้าเว็บเรียกทุก 5 วินาทีตอนอยู่หน้าโอนเงิน
// คืน { id, amount, expiresAt, ref, status, rejectReason?, qrUrl?, orders? }
//  - qrUrl: มีเมื่อยังต้องโอน/ส่งสลีป (awaiting_slip, rejected)
//  - orders: มีเมื่ออนุมัติแล้ว (approved)
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser().catch(() => null);
  if (!user) return NextResponse.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });

  const { id } = await params;
  if (!ObjectId.isValid(id)) return NextResponse.json({ error: "ไม่พบรายการชำระเงิน" }, { status: 404 });
  const paymentId = new ObjectId(id);
  const userId = new ObjectId(user.id);

  const db = await getDb();
  await expireStale(db, userId);

  // ดูได้เฉพาะรายการของตัวเอง
  const pay = await db.collection("payments").findOne({ _id: paymentId, userId });
  if (!pay) return NextResponse.json({ error: "ไม่พบรายการชำระเงิน" }, { status: 404 });

  const info = toPaymentInfo(pay);

  if (info.status === "awaiting_slip" || info.status === "rejected") {
    const qrUrl = await makeQrDataUrl(info.ref, info.amount).catch(() => undefined);
    return NextResponse.json({ ...info, qrUrl });
  }

  if (info.status === "approved") {
    // เผื่อ admin กดอนุมัติแล้วระบบล้มก่อนออกตั๋วครบ: เรียกซ้ำได้ ไม่เกิดตั๋วซ้ำ
    await fulfillPayment(db, paymentId);
    const codes = (pay.tickets as PaymentTicket[]).map((t) => t.code);
    const docs = await db.collection("orders").find({ code: { $in: codes } }).toArray();
    const orders = docs.map(toOrder).sort((a, b) => codes.indexOf(a.code) - codes.indexOf(b.code));
    return NextResponse.json({ ...info, orders });
  }

  return NextResponse.json(info);
}

// ยกเลิกรายการซื้อ: ลบได้เฉพาะรายการของตัวเองที่ยังไม่ได้ส่งสลีป (awaiting_slip)
// รายการที่ส่งสลีปแล้ว / อนุมัติแล้ว / หมดอายุ ลบไม่ได้
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser().catch(() => null);
  if (!user) return NextResponse.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });

  const { id } = await params;
  if (!ObjectId.isValid(id)) return NextResponse.json({ error: "ไม่พบรายการชำระเงิน" }, { status: 404 });
  const paymentId = new ObjectId(id);
  const userId = new ObjectId(user.id);

  const db = await getDb();
  await expireStale(db, userId);

  // เงื่อนไขสถานะอยู่ในคำสั่งลบเลย กันชนกับการส่งสลีปที่เข้ามาพร้อมกัน
  const r = await db
    .collection("payments")
    .deleteOne({ _id: paymentId, userId, status: "awaiting_slip", slipId: null });

  if (r.deletedCount === 1) return NextResponse.json({ ok: true });

  const exists = await db.collection("payments").findOne({ _id: paymentId, userId }, { projection: { _id: 1 } });
  if (!exists) return NextResponse.json({ error: "ไม่พบรายการชำระเงิน" }, { status: 404 });
  return NextResponse.json({ error: "รายการนี้ส่งสลีปแล้ว ยกเลิกไม่ได้" }, { status: 409 });
}