import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { getSessionUser, validPhone } from "@/lib/auth";
import {
  MAX_QTY,
  OPEN_STATUSES,
  PAYMENT_TTL_MINUTES,
  buildPaymentLines,
  expireStale,
  isTicketId,
  makeRef,
  toOrder,
  toPaymentInfo,
  validEmpCode,
  type TicketId,
} from "@/lib/tickets";
import { makeQrDataUrl } from "@/lib/billerQr";

const MAX_OPEN = 5; // รายการค้างพร้อมกันต่อผู้ใช้ (กันกดรัว ๆ)

// ตั๋วทั้งหมดของผู้ใช้ + รายการโอนเงินที่ยังค้าง (รอโอน / รอตรวจสลีป / สลีปไม่ผ่าน)
export async function GET() {
  const user = await getSessionUser().catch(() => null);
  if (!user) return NextResponse.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });

  const db = await getDb();
  const userId = new ObjectId(user.id);
  await expireStale(db, userId);

  const [docs, open] = await Promise.all([
    db.collection("orders").find({ userId }).sort({ at: -1 }).toArray(),
    db
      .collection("payments")
      .find({ userId, status: { $in: OPEN_STATUSES } })
      .sort({ createdAt: -1 })
      .limit(20)
      .toArray(),
  ]);
  return NextResponse.json({ orders: docs.map(toOrder), pending: open.map(toPaymentInfo) });
}

// เริ่มซื้อ: body = { items: [{ ticket, qty }], name, phone }
// รหัสพนักงานดึงจากบัญชีผู้ใช้ (ตั้งตอนสมัคร / ในโปรไฟล์) ไม่รับจากหน้าเว็บ
// ซื้อ Lucky Draw แล้วบัญชียังไม่มีรหัสพนักงาน = ปฏิเสธ
// ยังไม่ออกตั๋ว สร้างรายการรอโอน + QR พร้อมเพย์ (ยอด + Ref1 ฝังใน QR)
// ตั๋วถูกออกเมื่อ admin อนุมัติสลีปเท่านั้น (ดู /api/admin/payments/[id])
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

  // ซื้อ Lucky Draw ต้องมีรหัสพนักงานในบัญชี
  const hasLucky = wanted.some((w) => w.ticket === "lucky");
  const empCode = user.empCode ?? "";
  if (hasLucky && !validEmpCode(empCode))
    return NextResponse.json(
      { error: "บัญชียังไม่มีรหัสพนักงาน กรุณากรอกในหน้าโปรไฟล์ก่อนซื้อ Lucky Draw" },
      { status: 400 },
    );

  const db = await getDb();
  const payments = db.collection("payments");
  const userId = new ObjectId(user.id);
  await expireStale(db, userId);

  const openCount = await payments.countDocuments({ userId, status: { $in: OPEN_STATUSES } });
  if (openCount >= MAX_OPEN)
    return NextResponse.json(
      { error: "มีรายการค้างอยู่หลายรายการ กรุณาจัดการรายการเดิมในหน้า “ตั๋วของฉัน” ก่อน" },
      { status: 429 },
    );

  // ราคามาจากเซิร์ฟเวอร์เสมอ ไม่เชื่อค่าจากหน้าเว็บ
  const { tickets, amount } = buildPaymentLines(wanted);
  const ref = makeRef();

  let qrUrl: string;
  try {
    qrUrl = await makeQrDataUrl(ref, amount);
  } catch (e) {
    console.error("สร้าง QR ไม่สำเร็จ:", e);
    const detail = process.env.NODE_ENV !== "production" && e instanceof Error ? ` (${e.message})` : "";
    return NextResponse.json({ error: `ระบบรับชำระเงินยังไม่พร้อม${detail}` }, { status: 500 });
  }

  const paymentId = new ObjectId();
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + PAYMENT_TTL_MINUTES * 60_000).toISOString();

  await payments.insertOne({
    _id: paymentId,
    userId,
    name,
    phone,
    ...(hasLucky ? { empCode } : {}), // รหัสพนักงานจากบัญชี (ใส่ให้ตั๋ว Lucky Draw ตอน admin อนุมัติ)
    tickets, // รหัสตั๋วถูกล็อกไว้ตั้งแต่ตอนนี้
    amount, // หน่วยบาท
    ref,
    status: "awaiting_slip",
    slipId: null,
    createdAt: createdAt.toISOString(),
    expiresAt,
    fulfilled: false,
  });

  return NextResponse.json({
    payment: { id: paymentId.toString(), amount, expiresAt, ref, status: "awaiting_slip", qrUrl },
  });
}