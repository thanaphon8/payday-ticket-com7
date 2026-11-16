import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { fulfillPayment } from "@/lib/tickets";
import { OpnError, getCharge, isPaid } from "@/lib/opn";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Opn เรียกมาที่นี่เมื่อสถานะ charge เปลี่ยน (ตัวสำรอง กรณีลูกค้าจ่ายแล้วปิดหน้าเว็บ)
// ตั้งค่าที่ dashboard.omise.co > Webhooks > Endpoint = https://<โดเมนของคุณ>/api/webhooks/opn
//
// ความปลอดภัย: ไม่เชื่อเนื้อหาที่ส่งมา ใช้แค่ charge id แล้วถาม Opn ซ้ำด้วย secret key
// ใครปลอมคำขอมาก็ไม่ทำให้เกิดตั๋ว เพราะ Opn จะตอบว่ายังไม่จ่าย
export async function POST(req: Request) {
  const event = await req.json().catch(() => null);

  const key = typeof event?.key === "string" ? event.key : "";
  const chargeId = event?.data?.id;
  if (event?.object !== "event" || !key.startsWith("charge.") || typeof chargeId !== "string") {
    return NextResponse.json({ ok: true, ignored: true });
  }

  try {
    const charge = await getCharge(chargeId);

    const db = await getDb();
    const payments = db.collection("payments");
    let pay = await payments.findOne({ chargeId });
    if (!pay) {
      // สำรอง: หาจาก metadata ที่แนบไว้ตอนสร้าง charge
      const pid = charge.metadata.paymentId;
      if (typeof pid === "string" && ObjectId.isValid(pid)) pay = await payments.findOne({ _id: new ObjectId(pid) });
    }
    // ไม่ใช่ charge ของเว็บนี้ (เช่น บัญชี Opn เดียวกันใช้หลายระบบ) ตอบ 200 ให้ Opn เลิกส่งซ้ำ
    if (!pay) return NextResponse.json({ ok: true, ignored: true });

    if (!isPaid(charge)) return NextResponse.json({ ok: true, paid: false });

    if (charge.amountSatang !== Math.round((pay.amount as number) * 100)) {
      console.error("webhook: ยอดไม่ตรง", { paymentId: String(pay._id), charge: charge.amountSatang, expected: pay.amount });
      return NextResponse.json({ ok: true, mismatch: true });
    }

    await fulfillPayment(db, pay._id as ObjectId);
    return NextResponse.json({ ok: true, paid: true });
  } catch (e) {
    // charge ไม่มีอยู่จริง = ขยะ ไม่ต้องให้ส่งซ้ำ
    if (e instanceof OpnError && (e.status === 404 || e.code === "bad_id")) {
      return NextResponse.json({ ok: true, ignored: true });
    }
    // ข้อผิดพลาดชั่วคราว (เครือข่าย / DB) ตอบ 500 ให้ Opn ลองส่งใหม่
    console.error("webhook error:", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}