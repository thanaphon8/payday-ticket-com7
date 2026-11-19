import { randomBytes } from "crypto";
import { ObjectId, type Db, type WithId, type Document } from "mongodb";

// ราคาฝั่งเซิร์ฟเวอร์ (ต้องตรงกับ price ใน TICKETS ของ app/page.tsx)
// ตั๋วเข้าซุ้ม 100 บาท (1 ชุด = ตั๋วซุ้ม 2 ใบ ใบละ 50 + ตั๋วรับตั๋วกระดาษ 1 ใบ ไม่มีมูลค่า) / ตั๋ว Lucky Draw 50 บาท
// ถ้าจะเปลี่ยนราคา ให้แก้ที่นี่ และที่ price ใน TICKETS ของ app/page.tsx ให้ตรงกัน
export const TICKET_PRICES = { booth: 100, lucky: 50 } as const;
export type TicketId = keyof typeof TICKET_PRICES;
export const MAX_QTY = 20;

// ตั๋วเข้าซุ้ม 1 ชุด แตกเป็น 3 ใบ (แต่ละใบมีบาร์โค้ดของตัวเอง) ผลรวมราคาต้องเท่ากับ TICKET_PRICES.booth
// booth = ตั๋วเล่นซุ้ม (มีมูลค่า) / paper = ตั๋วให้ staff ยิงเพื่อรับตั๋วกระดาษ (ไม่มีมูลค่า)
export type BoothPart = "booth" | "paper";
export const BOOTH_SET: readonly { part: BoothPart; price: number }[] = [
  { part: "booth", price: 50 },
  { part: "booth", price: 50 },
  { part: "paper", price: 0 },
];

// รหัสพนักงาน: ตัวเลขล้วน 7 หลัก (กรอกครั้งเดียวต่อการสั่งซื้อ ใช้กับตั๋ว Lucky Draw ทุกใบในรายการนั้น)
// ต้องตรงกับ EMP_CODE_LENGTH ใน app/page.tsx
export const EMP_CODE_LENGTH = 7;
export const validEmpCode = (c: string) => new RegExp(`^\\d{${EMP_CODE_LENGTH}}$`).test(c);

// เวลาที่ผู้ซื้อมีในการโอน + ส่งสลีป (นาที) นับใหม่ทุกครั้งที่ถูกปฏิเสธสลีป
// พอส่งสลีปแล้ว (สถานะ reviewing) ไม่หมดอายุ รอ admin ตรวจกี่ชั่วโมงก็ได้
export const PAYMENT_TTL_MINUTES = 60;
export const MAX_SLIPS_PER_PAYMENT = 5; // ส่งสลีปได้กี่ครั้งต่อรายการ (กันรัวส่ง)

export type PaymentStatus = "awaiting_slip" | "reviewing" | "approved" | "rejected" | "expired";
// สถานะที่ยังค้างอยู่ (แสดงในหน้า "ตั๋วของฉัน")
export const OPEN_STATUSES: PaymentStatus[] = ["awaiting_slip", "reviewing", "rejected"];

export const isTicketId = (x: unknown): x is TicketId =>
  typeof x === "string" && Object.prototype.hasOwnProperty.call(TICKET_PRICES, x);

// BT = ตั๋วซุ้ม / BP = ตั๋วรับตั๋วกระดาษ / LD = Lucky Draw
export function makeCode(ticket: TicketId, part?: BoothPart) {
  const prefix = ticket === "booth" ? (part === "paper" ? "BP" : "BT") : "LD";
  return `PD-${prefix}-${randomBytes(4).toString("hex").toUpperCase()}`;
}

// รหัสอ้างอิงรายการ (ฝังใน QR เป็น Ref1 ไปโผล่ใน statement ธนาคาร) 10 ตัว A-Z 0-9
export const makeRef = () => `PD${randomBytes(4).toString("hex").toUpperCase()}`;

// แปลงเอกสารใน MongoDB เป็นรูปแบบที่หน้าเว็บใช้ (ไม่ส่ง _id / userId ออกไป)
// empCode / won / wonAt ใช้กับตั๋ว Lucky Draw (won = ตั๋วใบนี้ถูกรางวัลแล้ว)
// part ใช้กับตั๋วเข้าซุ้ม (booth = ตั๋วเล่นซุ้ม ใบละ 50 / paper = ตั๋วรับตั๋วกระดาษ ไม่มีมูลค่า)
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
    empCode: (d.empCode as string | undefined) ?? undefined,
    won: d.won === true,
    wonAt: (d.wonAt as string | undefined) ?? undefined,
    part: (d.part as BoothPart | undefined) ?? undefined,
  };
}

// สรุปตั๋วในรายการโอนเงิน: ประเภทตั๋ว + จำนวน (ตั๋วเข้าซุ้มนับเป็นชุด ไม่นับ 3 ใบ)
export type PaymentItem = { ticket: TicketId; qty: number };

// รายการโอนเงินในรูปแบบที่หน้าเว็บใช้ (qrUrl ใส่เพิ่มเองตอนต้องใช้)
export function toPaymentInfo(p: WithId<Document>) {
  const items: PaymentItem[] = [];
  for (const t of (p.tickets as PaymentTicket[] | undefined) ?? []) {
    // ตั๋วเข้าซุ้ม 1 ชุด มี 3 ใบ: นับเฉพาะใบ paper เป็น 1 ชุด
    if (t.ticket === "booth" && t.part === "booth") continue;
    const found = items.find((i) => i.ticket === t.ticket);
    if (found) found.qty += 1;
    else items.push({ ticket: t.ticket, qty: 1 });
  }
  return {
    id: p._id.toString(),
    amount: p.amount as number,
    expiresAt: p.expiresAt as string,
    ref: p.ref as string,
    status: p.status as PaymentStatus,
    rejectReason: (p.rejectReason as string | undefined) ?? undefined,
    items,
  };
}

/* ---------- การชำระเงิน ---------- */

// ตั๋วที่จะถูกออกหลัง admin อนุมัติ: สร้างรหัสและล็อกราคาไว้ตั้งแต่ตอนสร้างรายการ
// เพื่อให้การออกตั๋วซ้ำได้รหัสเดิม และไม่เกิดตั๋วซ้ำ
export type PaymentTicket = { code: string; ticket: TicketId; price: number; part?: BoothPart };

export function buildPaymentLines(items: { ticket: TicketId; qty: number }[]) {
  const tickets: PaymentTicket[] = [];
  for (const { ticket, qty } of items) {
    for (let i = 0; i < qty; i++) {
      if (ticket === "booth") {
        // 1 ชุด = 3 ใบ แต่ละใบรหัสไม่ซ้ำกัน
        for (const s of BOOTH_SET) {
          tickets.push({ code: makeCode("booth", s.part), ticket: "booth", price: s.price, part: s.part });
        }
      } else {
        tickets.push({
          code: makeCode(ticket),
          ticket,
          price: TICKET_PRICES[ticket], // ราคามาจากเซิร์ฟเวอร์เสมอ
        });
      }
    }
  }
  const amount = tickets.reduce((s, t) => s + t.price, 0);
  return { tickets, amount };
}

// รายการที่รอโอน/สลีปถูกปฏิเสธ แล้วเลยเวลา → หมดอายุ (เรียกก่อนอ่านรายการทุกครั้ง)
export async function expireStale(db: Db, userId?: ObjectId) {
  await db.collection("payments").updateMany(
    {
      ...(userId ? { userId } : {}),
      status: { $in: ["awaiting_slip", "rejected"] },
      expiresAt: { $lt: new Date().toISOString() },
    },
    { $set: { status: "expired" } },
  );
}

// ออกตั๋วหลัง admin อนุมัติ เรียกซ้ำได้ปลอดภัย (idempotent)
// คืน true เมื่อรายการนี้ออกตั๋วครบแล้ว
export async function fulfillPayment(db: Db, paymentId: ObjectId): Promise<boolean> {
  const payments = db.collection("payments");

  const pay = await payments.findOne({ _id: paymentId });
  if (!pay || pay.status !== "approved") return false;
  if (pay.fulfilled === true) return true;

  const tickets = pay.tickets as PaymentTicket[];
  // รหัสพนักงานของรายการนี้ (มีเฉพาะรายการที่ซื้อ Lucky Draw) ใส่ให้ตั๋ว Lucky Draw ทุกใบ
  const empCode = typeof pay.empCode === "string" && validEmpCode(pay.empCode) ? pay.empCode : null;
  const docs = tickets.map((t) => ({
    code: t.code,
    userId: pay.userId as ObjectId,
    paymentId,
    ticket: t.ticket,
    name: pay.name as string,
    phone: pay.phone as string,
    price: t.price,
    at: (pay.approvedAt as string) ?? new Date().toISOString(),
    used: false,
    ...(t.part ? { part: t.part } : {}),
    ...(t.ticket === "lucky" && empCode ? { empCode, won: false } : {}),
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