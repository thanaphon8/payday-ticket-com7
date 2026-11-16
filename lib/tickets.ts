import { randomBytes } from "crypto";
import type { WithId, Document } from "mongodb";

// ราคาฝั่งเซิร์ฟเวอร์ (ต้องตรงกับ price ใน TICKETS ของ app/page.tsx)
export const TICKET_PRICES = { booth: 50, lucky: 20 } as const;
export type TicketId = keyof typeof TICKET_PRICES;
export const MAX_QTY = 20;

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