import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/auth";
import { expireStale, type PaymentTicket } from "@/lib/tickets";

// สรุปยอดสำหรับหน้า admin
// นับยอดขายจากรายการที่ "อนุมัติแล้ว" เท่านั้น ส่วน "รอตรวจ" แยกไว้ต่างหาก
const TZ_OFFSET_MS = 7 * 60 * 60 * 1000; // Asia/Bangkok

const dayKey = (iso: string) => new Date(new Date(iso).getTime() + TZ_OFFSET_MS).toISOString().slice(0, 10);

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return NextResponse.json({ error: guard.status === 401 ? "กรุณาเข้าสู่ระบบ" : "ไม่มีสิทธิ์" }, { status: guard.status });
  }

  const db = await getDb();
  await expireStale(db);
  const payments = db.collection("payments");

  const [approvedDocs, reviewingDocs, rejected] = await Promise.all([
    payments
      .find({ status: "approved" }, { projection: { userId: 1, phone: 1, tickets: 1, amount: 1, approvedAt: 1, createdAt: 1 } })
      .toArray(),
    payments.find({ status: "reviewing" }, { projection: { amount: 1 } }).toArray(),
    payments.countDocuments({ status: "rejected" }),
  ]);

  const buyers = new Set<string>();
  const booth = { count: 0, amount: 0 };
  const lucky = { count: 0, amount: 0 };
  const daily = new Map<string, { date: string; orders: number; booth: number; lucky: number; amount: number }>();

  for (const d of approvedDocs) {
    buyers.add(d.userId ? String(d.userId) : String(d.phone ?? d._id));
    const tickets = (d.tickets ?? []) as PaymentTicket[];

    let b = 0;
    let l = 0;
    for (const t of tickets) {
      if (t.ticket === "booth") {
        booth.count += 1;
        booth.amount += t.price;
        b += 1;
      } else if (t.ticket === "lucky") {
        lucky.count += 1;
        lucky.amount += t.price;
        l += 1;
      }
    }

    const when = (d.approvedAt as string | undefined) ?? (d.createdAt as string);
    const key = dayKey(when);
    const row = daily.get(key) ?? { date: key, orders: 0, booth: 0, lucky: 0, amount: 0 };
    row.orders += 1;
    row.booth += b;
    row.lucky += l;
    row.amount += (d.amount as number) ?? 0;
    daily.set(key, row);
  }

  return NextResponse.json({
    buyers: buyers.size,
    orders: approvedDocs.length,
    booth,
    lucky,
    total: { count: booth.count + lucky.count, amount: booth.amount + lucky.amount },
    pending: {
      count: reviewingDocs.length,
      amount: reviewingDocs.reduce((s, d) => s + ((d.amount as number) ?? 0), 0),
    },
    rejected,
    daily: [...daily.values()].sort((a, b) => (a.date < b.date ? 1 : -1)),
    generatedAt: new Date().toISOString(),
  });
}