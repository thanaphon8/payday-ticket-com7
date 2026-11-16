import { randomBytes } from "crypto";
import { ObjectId, type Db, type WithId, type Document } from "mongodb";

// ราคาฝั่งเซิร์ฟเวอร์ (ต้องตรงกับ price ใน TICKETS ของ app/page.tsx)
// TODO: ตอนนี้ตั้ง 10 บาทเพื่อทดสอบ ก่อนขายจริงให้แก้ราคาที่นี่ และที่ price ใน TICKETS ของ app/page.tsx ให้ตรงกัน
export const TICKET_PRICES = { booth: 10, lucky: 10 } as const;
export type TicketId = keyof typeof TICKET_PRICES;
export const MAX_QTY = 20;

// อายุของรายการรอชำระเงิน (นาที) ใช้ทั้งหมดอายุ QR และนับถอยหลังบนหน้าเว็บ
export const PAYMENT_TTL_MINUTES = 15;

export const isTicketId = (x: unknown): x is TicketId =>
  typeof x === "string" && Object.prototype.hasOwnProperty.call(TICKET_PRICES, x);

export function makeCode(ticket: TicketId) {
  const prefix = ticket === "booth" ? "BT" : "LD";
  return `PD-${prefix}-${randomBytes(4).toString("hex").toUpperCase()}`;
}

// แปลงเอกสารใน MongoDB เป็นรูปแบบที่หน้าเว็บใช้ (ไม่ส่ง _id / userId ออกไป)
export function toOrder(d: WithId<Document>) {
  return {
    code: d.code as string,
    ticket: d.ticket as TicketId,
    name: d.name as string,
    phone: d.phone as string,
    price: d.price as number,
    at: d.at as string,
    used: d.used === true,
    usedAt: (d.usedAt as string | undefined) ?? undefined,
  };
}

/* ---------- การชำระเงิน ---------- */

// ตั๋วที่จะถูกออกหลังจ่ายสำเร็จ: สร้างรหัสและล็อกราคาไว้ตั้งแต่ตอนสร้างรายการรอจ่าย
// เพื่อให้การออกตั๋วซ้ำ (polling กับ webhook ชนกัน) ได้รหัสเดิม และไม่เกิดตั๋วซ้ำ
export type PaymentTicket = { code: string; ticket: TicketId; price: number };

export function buildPaymentLines(items: { ticket: TicketId; qty: number }[]) {
  const tickets: PaymentTicket[] = items.flatMap(({ ticket, qty }) =>
    Array.from({ length: qty }, () => ({
      code: makeCode(ticket),
      ticket,
      price: TICKET_PRICES[ticket], // ราคามาจากเซิร์ฟเวอร์เสมอ
    })),
  );
  const amount = tickets.reduce((s, t) => s + t.price, 0);
  return { tickets, amount };
}

// ออกตั๋วหลังจ่ายสำเร็จ เรียกซ้ำได้ปลอดภัย (idempotent)
// ใช้ทั้งตอน polling และ webhook: ตัวไหนมาถึงก่อนก็ออกตั๋ว อีกตัวจะไม่สร้างซ้ำ
// คืน true เมื่อรายการนี้ออกตั๋วครบแล้ว
export async function fulfillPayment(db: Db, paymentId: ObjectId): Promise<boolean> {
  const payments = db.collection("payments");

  // เปลี่ยนเป็น paid ครั้งเดียว (รวมกรณีจ่ายหลังหมดเวลา ก็ออกตั๋วให้ตามที่ตกลงไว้)
  await payments.updateOne(
    { _id: paymentId, status: { $ne: "paid" } },
    { $set: { status: "paid", paidAt: new Date().toISOString() } },
  );

  const pay = await payments.findOne({ _id: paymentId });
  if (!pay || pay.status !== "paid") return false;
  if (pay.fulfilled === true) return true;

  const tickets = pay.tickets as PaymentTicket[];
  const docs = tickets.map((t) => ({
    code: t.code,
    userId: pay.userId as ObjectId,
    paymentId,
    ticket: t.ticket,
    name: pay.name as string,
    phone: pay.phone as string,
    price: t.price,
    at: pay.paidAt as string,
    used: false,
  }));

  try {
    await db.collection("orders").insertMany(docs, { ordered: false });
  } catch (e) {
    // รหัสซ้ำ = เคยออกตั๋วไปแล้ว (หรือออกไปบางส่วนก่อนระบบล้ม) ข้ามได้ ข้อผิดพลาดอื่นให้โยนต่อ
    const err = e as { code?: number; writeErrors?: { code?: number }[] };
    const onlyDup =
      err.code === 11000 || (Array.isArray(err.writeErrors) && err.writeErrors.every((w) => w.code === 11000));
    if (!onlyDup) throw e;
  }

  await payments.updateOne({ _id: paymentId }, { $set: { fulfilled: true } });
  return true;
}