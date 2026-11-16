import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { getSessionUser } from "@/lib/auth";
import { fulfillPayment, toOrder, type PaymentTicket } from "@/lib/tickets";
import { OpnError, getCharge, isDeadCharge, isPaid } from "@/lib/opn";

type PayStatus = "pending" | "paid" | "expired" | "failed";

// หน้าเว็บเรียกทุก 3 วินาทีเพื่อเช็กว่าจ่ายแล้วหรือยัง
// คืน { status, expiresAt, orders? } เมื่อ status = "paid" จะมี orders (ตั๋วที่เพิ่งออก)
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser().catch(() => null);
  if (!user) return NextResponse.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });

  const { id } = await params;
  if (!ObjectId.isValid(id)) return NextResponse.json({ error: "ไม่พบรายการชำระเงิน" }, { status: 404 });
  const paymentId = new ObjectId(id);

  const db = await getDb();
  const payments = db.collection("payments");
  // ดูได้เฉพาะรายการของตัวเอง
  let pay = await payments.findOne({ _id: paymentId, userId: new ObjectId(user.id) });
  if (!pay) return NextResponse.json({ error: "ไม่พบรายการชำระเงิน" }, { status: 404 });

  const expiresAt = pay.expiresAt as string;

  async function paidResponse() {
    const codes = (pay!.tickets as PaymentTicket[]).map((t) => t.code);
    const docs = await db.collection("orders").find({ code: { $in: codes } }).toArray();
    const orders = docs.map(toOrder).sort((a, b) => codes.indexOf(a.code) - codes.indexOf(b.code));
    return NextResponse.json({ status: "paid" as PayStatus, expiresAt, orders });
  }

  // ออกตั๋วแล้ว
  if (pay.fulfilled === true) return paidResponse();

  // รายการที่จบแล้วโดยไม่ได้จ่าย
  if (pay.status === "expired" || pay.status === "failed") {
    // กรณีพิเศษ: จ่ายตอนใกล้หมดเวลา แล้ว Opn ยังไม่ได้แจ้ง ให้เช็กกับ Opn อีกครั้งก่อนตัดสินว่าไม่สำเร็จ
    if (!pay.chargeId) return NextResponse.json({ status: pay.status as PayStatus, expiresAt });
  }

  if (!pay.chargeId) return NextResponse.json({ status: "failed" as PayStatus, expiresAt });

  // ถาม Opn โดยตรงเสมอ ไม่เชื่อสถานะที่หน้าเว็บส่งมา
  let charge;
  try {
    charge = await getCharge(pay.chargeId as string);
  } catch (e) {
    console.error("เช็กสถานะ charge ไม่สำเร็จ:", e);
    const status = e instanceof OpnError && e.status === 0 ? 503 : 502;
    return NextResponse.json({ error: "เช็กสถานะไม่ได้ กำลังลองใหม่" }, { status });
  }

  if (isPaid(charge)) {
    // กันยอดไม่ตรง: ยอดที่ Opn รับต้องเท่ากับยอดที่เราคิดไว้ (สตางค์)
    if (charge.amountSatang !== Math.round((pay.amount as number) * 100)) {
      console.error("ยอดไม่ตรง", { paymentId: id, charge: charge.amountSatang, expected: pay.amount });
      return NextResponse.json({ error: "ยอดชำระไม่ตรงกับรายการ กรุณาติดต่อเจ้าหน้าที่" }, { status: 409 });
    }
    const done = await fulfillPayment(db, paymentId);
    if (done) {
      pay = (await payments.findOne({ _id: paymentId })) ?? pay;
      return paidResponse();
    }
  }

  if (isDeadCharge(charge)) {
    const status: PayStatus = charge.status === "expired" ? "expired" : "failed";
    await payments.updateOne({ _id: paymentId, status: "pending" }, { $set: { status } });
    return NextResponse.json({ status, expiresAt });
  }

  return NextResponse.json({ status: "pending" as PayStatus, expiresAt });
}