import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { getSessionUser, validPhone } from "@/lib/auth";
import {
  MAX_QTY,
  PAYMENT_TTL_MINUTES,
  buildPaymentLines,
  isTicketId,
  toOrder,
  type TicketId,
} from "@/lib/tickets";
import { OpnError, createPromptPayCharge } from "@/lib/opn";

const MAX_PENDING = 5; // รายการรอชำระเงินค้างได้พร้อมกันต่อผู้ใช้ (กันกดรัว ๆ)

// รายการตั๋วทั้งหมดของผู้ใช้ที่ login
export async function GET() {
  const user = await getSessionUser().catch(() => null);
  if (!user) return NextResponse.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });

  const db = await getDb();
  const docs = await db
    .collection("orders")
    .find({ userId: new ObjectId(user.id) })
    .sort({ at: -1 })
    .toArray();
  return NextResponse.json({ orders: docs.map(toOrder) });
}

// เริ่มชำระเงิน: body = { items: [{ ticket, qty }], name, phone }
// ยังไม่ออกตั๋ว สร้างรายการรอจ่าย + QR PromptPay แล้วคืน { payment: { id, amount, expiresAt, qrUrl } }
// ตั๋วจะถูกออกหลัง Opn ยืนยันว่าจ่ายแล้วเท่านั้น (ดู /api/payments/[id] และ /api/webhooks/opn)
export async function POST(req: Request) {
  const user = await getSessionUser().catch(() => null);
  if (!user) return NextResponse.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const name = String(body?.name ?? "").trim();
  const phone = String(body?.phone ?? "").replace(/\D/g, "");
  const items: unknown = body?.items;

  if (name.length < 2) return NextResponse.json({ error: "กรอกชื่อ-นามสกุลให้ครบ" }, { status: 400 });
  if (!validPhone(phone))
    return NextResponse.json({ error: "เบอร์โทรต้องมี 10 หลัก ขึ้นต้นด้วย 0" }, { status: 400 });
  if (!Array.isArray(items) || items.length === 0)
    return NextResponse.json({ error: "ยังไม่ได้เลือกตั๋ว" }, { status: 400 });

  const wanted: { ticket: TicketId; qty: number }[] = [];
  for (const it of items) {
    const qty = Math.floor(Number(it?.qty));
    if (!isTicketId(it?.ticket) || !(qty >= 1 && qty <= MAX_QTY))
      return NextResponse.json({ error: "รายการตั๋วไม่ถูกต้อง" }, { status: 400 });
    wanted.push({ ticket: it.ticket, qty });
  }

  const db = await getDb();
  const payments = db.collection("payments");
  const userId = new ObjectId(user.id);

  const pendingCount = await payments.countDocuments({
    userId,
    status: "pending",
    expiresAt: { $gt: new Date().toISOString() },
  });
  if (pendingCount >= MAX_PENDING)
    return NextResponse.json(
      { error: "มีรายการรอชำระเงินค้างอยู่หลายรายการ รอสักครู่หรือจ่ายรายการเดิมก่อน" },
      { status: 429 },
    );

  // ราคามาจากเซิร์ฟเวอร์เสมอ ไม่เชื่อค่าจากหน้าเว็บ
  const { tickets, amount } = buildPaymentLines(wanted);
  if (amount < 20)
    return NextResponse.json({ error: "ยอดรวมต้องไม่ต่ำกว่า ฿20 (ขั้นต่ำของ PromptPay)" }, { status: 400 });
  const paymentId = new ObjectId();
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + PAYMENT_TTL_MINUTES * 60_000);

  await payments.insertOne({
    _id: paymentId,
    userId,
    name,
    phone,
    tickets, // รหัสตั๋วถูกล็อกไว้ตั้งแต่ตอนนี้ ออกตั๋วซ้ำเมื่อไรก็ได้รหัสเดิม
    amount, // หน่วยบาท
    status: "pending",
    chargeId: null,
    qrUrl: null,
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    fulfilled: false,
  });

  try {
    const charge = await createPromptPayCharge({
      amountBaht: amount,
      expiresAt,
      description: `Payday Park ${tickets.length} ใบ`,
      metadata: { paymentId: paymentId.toString(), userId: user.id },
      idempotencyKey: paymentId.toString(),
    });
    if (!charge.qrUrl) throw new Error("Opn ไม่ส่ง QR กลับมา");

    await payments.updateOne({ _id: paymentId }, { $set: { chargeId: charge.id, qrUrl: charge.qrUrl } });

    return NextResponse.json({
      payment: {
        id: paymentId.toString(),
        amount,
        expiresAt: expiresAt.toISOString(),
        qrUrl: charge.qrUrl,
      },
    });
  } catch (e) {
    console.error("สร้าง charge ไม่สำเร็จ:", e);
    await payments.updateOne({ _id: paymentId }, { $set: { status: "failed" } }).catch(() => {});
    const detail = process.env.NODE_ENV !== "production" && e instanceof Error ? ` (${e.message})` : "";
    const status = e instanceof OpnError && e.status === 0 ? 503 : 502;
    return NextResponse.json({ error: `สร้าง QR ไม่สำเร็จ ลองใหม่อีกครั้ง${detail}` }, { status });
  }
}