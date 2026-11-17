import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/auth";
import { expireStale, type PaymentTicket } from "@/lib/tickets";

const LISTABLE = ["reviewing", "approved", "rejected"] as const;

// รายการสำหรับหน้า admin: ?status=reviewing (ค่าเริ่มต้น) | approved | rejected
// คืน { counts: { reviewing, approved, rejected }, payments: [...] }
export async function GET(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return NextResponse.json({ error: guard.status === 401 ? "กรุณาเข้าสู่ระบบ" : "ไม่มีสิทธิ์" }, { status: guard.status });

  const q = new URL(req.url).searchParams.get("status") ?? "reviewing";
  const status = (LISTABLE as readonly string[]).includes(q) ? q : "reviewing";

  const db = await getDb();
  await expireStale(db);
  const payments = db.collection("payments");

  const [reviewing, approved, rejected, docs] = await Promise.all([
    payments.countDocuments({ status: "reviewing" }),
    payments.countDocuments({ status: "approved" }),
    payments.countDocuments({ status: "rejected" }),
    payments
      .find({ status })
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
      createdAt: d.createdAt as string,
      slipAt: (d.slipAt as string | undefined) ?? null,
      booth: tickets.filter((t) => t.ticket === "booth").length,
      lucky: tickets.filter((t) => t.ticket === "lucky").length,
      rejectReason: (d.rejectReason as string | undefined) ?? null,
      slip: slip ? { transRef: slip.transRef as string, sendingBank: slip.sendingBank as string } : null,
    };
  });

  return NextResponse.json({ counts: { reviewing, approved, rejected }, payments: list });
}