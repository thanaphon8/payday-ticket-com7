import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/auth";
import { expireStale, type PaymentTicket } from "@/lib/tickets";
import type { SlipCheck } from "@/lib/slipOcr";

const LISTABLE = ["reviewing", "approved", "auto", "rejected"] as const;

// รายการสำหรับหน้า admin: ?status=reviewing (ค่าเริ่มต้น) | approved | auto | rejected
// auto = อนุมัติแล้วโดยระบบอัตโนมัติ (reviewedBy = "auto") ซึ่งยังนับรวมอยู่ใน approved ด้วย
// คืน { counts: { reviewing, approved, auto, rejected, bans }, payments: [...] }
// counts.bans = จำนวนผู้ใช้ที่ถูกแบนอยู่ตอนนี้ (ใช้แสดงจุดแดงที่เมนู "ถูกแบน")
// slip.check = ผล OCR เทียบกับรายการ (null = สลีปเก่าที่ยังไม่เคยตรวจ)
export async function GET(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return NextResponse.json({ error: guard.status === 401 ? "กรุณาเข้าสู่ระบบ" : "ไม่มีสิทธิ์" }, { status: guard.status });

  const q = new URL(req.url).searchParams.get("status") ?? "reviewing";
  const status = (LISTABLE as readonly string[]).includes(q) ? q : "reviewing";
  const filter = status === "auto" ? { status: "approved", reviewedBy: "auto" } : { status };

  const db = await getDb();
  await expireStale(db);
  const payments = db.collection("payments");

  const [reviewing, approved, auto, rejected, bans, docs] = await Promise.all([
    payments.countDocuments({ status: "reviewing" }),
    payments.countDocuments({ status: "approved" }),
    payments.countDocuments({ status: "approved", reviewedBy: "auto" }),
    payments.countDocuments({ status: "rejected" }),
    db.collection("users").countDocuments({ bannedUntil: { $gt: new Date().toISOString() } }),
    payments
      .find(filter)
      // รอตรวจ: เก่าสุดก่อน (ตรวจตามคิว) / ประวัติ: ใหม่สุดก่อน
      .sort(status === "reviewing" ? { slipAt: 1 } : { createdAt: -1 })
      .limit(100)
      .toArray(),
  ]);

  const slipIds = docs.map((d) => d.slipId).filter((x): x is ObjectId => x instanceof ObjectId);
  const slipDocs = slipIds.length ? await db.collection("slips").find({ _id: { $in: slipIds } }).toArray() : [];
  const slipById = new Map(slipDocs.map((s) => [s._id.toString(), s]));

  const list = docs.map((d) => {
    const tickets = d.tickets as PaymentTicket[];
    const slip = d.slipId ? slipById.get(String(d.slipId)) : undefined;
    return {
      id: d._id.toString(),
      ref: d.ref as string,
      name: d.name as string,
      phone: d.phone as string,
      amount: d.amount as number,
      status: d.status as string,
      auto: d.status === "approved" && d.reviewedBy === "auto",
      createdAt: d.createdAt as string,
      slipAt: (d.slipAt as string | undefined) ?? null,
      booth: tickets.filter((t) => t.ticket === "booth").length,
      lucky: tickets.filter((t) => t.ticket === "lucky").length,
      rejectReason: (d.rejectReason as string | undefined) ?? null,
      slip: slip
        ? {
            transRef: slip.transRef as string,
            sendingBank: slip.sendingBank as string,
            check: (slip.check as SlipCheck | undefined) ?? null,
          }
        : null,
    };
  });

  return NextResponse.json({ counts: { reviewing, approved, auto, rejected, bans }, payments: list });
}