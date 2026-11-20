import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { requireBooth } from "@/lib/auth";

// บัญชีซุ้ม / จุดรับตั๋วกระดาษ ยิงบาร์โค้ดตั๋วของผู้ใช้: body = { code }
// คืน { result, code, name?, phone?, usedAt?, usedByName?, price?, msg? }
//  - ok         = ยิงสำเร็จ ตั๋วถูกตัดเป็น "ใช้แล้ว" (บันทึกว่าซุ้มไหนยิง + มูลค่าตั๋ว)
//  - duplicate  = ตั๋วใบนี้ถูกยิงไปแล้ว (usedAt = เวลายิงครั้งแรก, usedByName = ซุ้มที่ยิง)
//  - wrong_type = ตั๋วผิดประเภทสำหรับบัญชีนี้ (msg บอกเหตุผล)
//  - invalid    = ไม่พบรหัสตั๋วนี้
// บัญชีซุ้ม (play) ยิงได้เฉพาะตั๋วเล่นซุ้ม (BT ฿50) / จุดรับตั๋วกระดาษ (paper) ยิงได้เฉพาะตั๋วรับตั๋วกระดาษ (BP ไม่มีมูลค่า)
// ทุกครั้งที่ยิง (รวมที่ไม่สำเร็จ) บันทึกลง collection "scans" พร้อมซุ้มที่ยิง ให้หน้า admin ดูประวัติและยอดรายซุ้ม
const CODE_RE = /^PD-(BT|BP|LD)-[0-9A-F]{8}$/;

type Result = "ok" | "duplicate" | "wrong_type" | "invalid";

export async function POST(req: Request) {
  const guard = await requireBooth();
  if (!guard.ok) return NextResponse.json({ error: "กรุณาเข้าสู่ระบบบัญชีซุ้ม" }, { status: 401 });
  const booth = guard.booth;

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
      await scans.insertOne({ code, result, at, boothId: booth.id, boothName: booth.name, ...extra });
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
  const isPaper = order.part === "paper";

  // ผิดประเภทสำหรับบัญชีนี้
  let wrongMsg: string | null = null;
  if (order.ticket !== "booth") wrongMsg = "ตั๋วประเภทนี้ยิงที่นี่ไม่ได้";
  else if (booth.kind === "play" && isPaper) wrongMsg = "นี่คือตั๋วรับตั๋วกระดาษ ให้ไปยิงที่จุดรับตั๋วกระดาษ";
  else if (booth.kind === "paper" && !isPaper) wrongMsg = "นี่คือตั๋วเล่นซุ้ม ยิงที่จุดนี้ไม่ได้";
  if (wrongMsg) {
    await log("wrong_type", { ticket: order.ticket, name, phone });
    return NextResponse.json({ result: "wrong_type", code, name, phone, msg: wrongMsg });
  }

  const price = typeof order.price === "number" ? order.price : 0;

  // ตัดตั๋วแบบ atomic: เงื่อนไข used != true อยู่ในคำสั่งอัปเดตเลย
  // ยิงพร้อมกันสองเครื่อง (หรือสองซุ้ม) ก็ผ่านได้แค่ครั้งเดียว
  const r = await orders.updateOne(
    { code, ticket: "booth", used: { $ne: true } },
    { $set: { used: true, usedAt: at, usedBoothId: booth.id, usedBoothName: booth.name } },
  );

  if (r.modifiedCount === 1) {
    await log("ok", {
      ticket: "booth",
      part: isPaper ? "paper" : "booth",
      amount: price,
      name,
      phone,
      paymentId: order.paymentId ?? null,
    });
    return NextResponse.json({ result: "ok", code, name, phone, usedAt: at, price });
  }

  // ถูกใช้ไปแล้ว: อ่านใหม่เพื่อให้ได้เวลาและซุ้มที่ยิงครั้งแรกจริง
  const fresh = await orders.findOne({ code });
  const usedAt = (fresh?.usedAt as string | undefined) ?? (order.usedAt as string | undefined);
  const usedByName = (fresh?.usedBoothName as string | undefined) ?? undefined;
  await log("duplicate", { ticket: "booth", name, phone, firstUsedAt: usedAt ?? null });
  return NextResponse.json({ result: "duplicate", code, name, phone, usedAt, usedByName });
}