import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { requireStaff } from "@/lib/auth";

// เจ้าหน้าที่ยิงบาร์โค้ดตั๋วเข้างาน: body = { code }
// คืน { result, code, name?, phone?, usedAt? }
//  - ok         = ยิงสำเร็จ ตั๋วถูกตัดเป็น "ใช้แล้ว" (ผู้ใช้เห็นในแท็บ "ใช้แล้ว")
//  - duplicate  = ตั๋วใบนี้ถูกยิงไปแล้ว (usedAt = เวลาที่ยิงครั้งแรก)
//  - wrong_type = ไม่ใช่ตั๋วเข้าซุ้ม (เช่น Lucky Draw)
//  - invalid    = ไม่พบรหัสตั๋วนี้
// ทุกครั้งที่ยิง (รวมที่ไม่สำเร็จ) บันทึกลง collection "scans" ให้หน้า admin ดูประวัติ
const CODE_RE = /^PD-(BT|LD)-[0-9A-F]{8}$/;

type Result = "ok" | "duplicate" | "wrong_type" | "invalid";

export async function POST(req: Request) {
  const guard = await requireStaff();
  if (!guard.ok) return NextResponse.json({ error: "กรุณากรอกรหัสผ่านเจ้าหน้าที่" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const code = typeof body?.code === "string" ? body.code.trim().toUpperCase().slice(0, 60) : "";
  if (!code) return NextResponse.json({ error: "ไม่พบรหัสตั๋ว" }, { status: 400 });

  const db = await getDb();
  const orders = db.collection("orders");
  const scans = db.collection("scans");
  const at = new Date().toISOString();

  // บันทึกประวัติ: ล้มเหลวไม่ทำให้การยิงล้ม (ตั๋วเป็นแหล่งความจริงหลัก)
  const log = async (result: Result, extra: Record<string, unknown> = {}) => {
    try {
      await scans.insertOne({ code, result, at, ...extra });
    } catch (e) {
      console.error("บันทึกประวัติสแกนไม่สำเร็จ:", e);
    }
  };

  if (!CODE_RE.test(code)) {
    await log("invalid");
    return NextResponse.json({ result: "invalid", code });
  }

  const order = await orders.findOne({ code });
  if (!order) {
    await log("invalid");
    return NextResponse.json({ result: "invalid", code });
  }

  const name = order.name as string;
  const phone = order.phone as string;

  if (order.ticket !== "booth") {
    await log("wrong_type", { ticket: order.ticket, name, phone });
    return NextResponse.json({ result: "wrong_type", code, name, phone });
  }

  // ตัดตั๋วแบบ atomic: เงื่อนไข used != true อยู่ในคำสั่งอัปเดตเลย
  // ยิงพร้อมกันสองเครื่องก็ผ่านได้แค่ครั้งเดียว
  const r = await orders.updateOne(
    { code, ticket: "booth", used: { $ne: true } },
    { $set: { used: true, usedAt: at } },
  );

  if (r.modifiedCount === 1) {
    await log("ok", { ticket: "booth", name, phone, paymentId: order.paymentId ?? null });
    return NextResponse.json({ result: "ok", code, name, phone, usedAt: at });
  }

  // ถูกใช้ไปแล้ว: อ่านใหม่เพื่อให้ได้เวลาที่ยิงครั้งแรกจริง
  const fresh = await orders.findOne({ code });
  const usedAt = (fresh?.usedAt as string | undefined) ?? (order.usedAt as string | undefined);
  await log("duplicate", { ticket: "booth", name, phone, firstUsedAt: usedAt ?? null });
  return NextResponse.json({ result: "duplicate", code, name, phone, usedAt });
}