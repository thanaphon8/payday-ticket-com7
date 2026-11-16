import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { getSessionUser, validPhone } from "@/lib/auth";
import { MAX_QTY, TICKET_PRICES, isTicketId, makeCode, toOrder, type TicketId } from "@/lib/tickets";

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

// ซื้อตั๋ว: body = { items: [{ ticket, qty }], name, phone }
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

  // TODO: เชื่อมระบบชำระเงินจริง (PromptPay/บัตร) แล้วค่อยสร้างตั๋วหลังจ่ายสำเร็จเท่านั้น
  const at = new Date().toISOString();
  const userId = new ObjectId(user.id);
  const docs = wanted.flatMap(({ ticket, qty }) =>
    Array.from({ length: qty }, () => ({
      code: makeCode(ticket),
      userId,
      ticket,
      name,
      phone,
      price: TICKET_PRICES[ticket], // ราคามาจากเซิร์ฟเวอร์เสมอ ไม่เชื่อค่าจากหน้าเว็บ
      at,
      used: false,
    })),
  );

  try {
    const db = await getDb();
    await db.collection("orders").insertMany(docs);
    return NextResponse.json({ orders: docs.map((d) => toOrder(d as never)) });
  } catch (e) {
    // รหัสตั๋วชนกัน (โอกาสน้อยมาก) → ให้ลองกดซื้อใหม่
    console.error(e);
    return NextResponse.json({ error: "สร้างตั๋วไม่สำเร็จ ลองใหม่อีกครั้ง" }, { status: 500 });
  }
}