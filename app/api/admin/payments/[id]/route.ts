import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/auth";
import { PAYMENT_TTL_MINUTES, fulfillPayment } from "@/lib/tickets";

// admin กดอนุมัติ / ปฏิเสธ: body = { action: "approve" } หรือ { action: "reject", reason }
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return NextResponse.json({ error: guard.status === 401 ? "กรุณาเข้าสู่ระบบ" : "ไม่มีสิทธิ์" }, { status: guard.status });

  const { id } = await params;
  if (!ObjectId.isValid(id)) return NextResponse.json({ error: "ไม่พบรายการ" }, { status: 404 });
  const paymentId = new ObjectId(id);

  const body = await req.json().catch(() => null);
  const action = body?.action;
  const db = await getDb();
  const payments = db.collection("payments");
  const slips = db.collection("slips");
  const nowIso = new Date().toISOString();

  const pay = await payments.findOne({ _id: paymentId });
  if (!pay) return NextResponse.json({ error: "ไม่พบรายการ" }, { status: 404 });

  if (action === "approve") {
    // เปลี่ยนจาก reviewing เป็น approved ได้ครั้งเดียว (กัน admin สองคนกดชนกัน)
    const r = await payments.updateOne(
      { _id: paymentId, status: "reviewing" },
      { $set: { status: "approved", approvedAt: nowIso, reviewedBy: guard.user.id } },
    );
    if (r.matchedCount === 0)
      return NextResponse.json({ error: "รายการนี้ถูกจัดการไปแล้ว รีเฟรชหน้าจอ" }, { status: 409 });
    if (pay.slipId) await slips.updateOne({ _id: pay.slipId }, { $set: { status: "approved" } });
    await fulfillPayment(db, paymentId);
    return NextResponse.json({ ok: true, status: "approved" });
  }

  if (action === "reject") {
    const reason = String(body?.reason ?? "").trim().slice(0, 200);
    if (reason.length < 2) return NextResponse.json({ error: "ใส่เหตุผลที่ปฏิเสธ" }, { status: 400 });
    // ปฏิเสธแล้วให้เวลาผู้ซื้อส่งสลีปใหม่อีก PAYMENT_TTL_MINUTES นาที (ในออเดอร์เดิม)
    // rejectCount / lastRejectReason เก็บไว้ถาวร ใช้ติดแท็ก "แก้ไข" เมื่อผู้ซื้อส่งสลีปใหม่ในออเดอร์เดิม และให้รายการยังอยู่ในแถบ "ปฏิเสธ"
    const r = await payments.updateOne(
      { _id: paymentId, status: "reviewing" },
      {
        $set: {
          status: "rejected",
          rejectReason: reason,
          lastRejectReason: reason,
          reviewedAt: nowIso,
          reviewedBy: guard.user.id,
          expiresAt: new Date(Date.now() + PAYMENT_TTL_MINUTES * 60_000).toISOString(),
        },
        $inc: { rejectCount: 1 },
      },
    );
    if (r.matchedCount === 0)
      return NextResponse.json({ error: "รายการนี้ถูกจัดการไปแล้ว รีเฟรชหน้าจอ" }, { status: 409 });
    if (pay.slipId) await slips.updateOne({ _id: pay.slipId }, { $set: { status: "rejected" } });
    return NextResponse.json({ ok: true, status: "rejected" });
  }

  return NextResponse.json({ error: "action ไม่ถูกต้อง" }, { status: 400 });
}