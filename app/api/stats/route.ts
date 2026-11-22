import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";

// จำนวนตั๋วที่ขายแล้ว (นับเฉพาะตั๋วที่ admin อนุมัติสลีปและออกตั๋วแล้ว)
// ตั๋วเข้าซุ้ม: นับเป็นชุด (1 ชุด = 1 ใบ part "paper") / Lucky Draw: นับเป็นใบ
export async function GET() {
  try {
    const db = await getDb();
    const orders = db.collection("orders");
    const rows = await orders
      .aggregate<{ _id: string; n: number }>([
        { $match: { $or: [{ ticket: "booth", part: "paper" }, { ticket: "lucky" }] } },
        { $lookup: { from: "payments", localField: "paymentId", foreignField: "_id", as: "pay" } },
        { $match: { "pay.status": "approved" } },
        { $group: { _id: "$ticket", n: { $sum: 1 } } },
      ])
      .toArray();
    const booth = rows.find((r) => r._id === "booth")?.n ?? 0;
    const lucky = rows.find((r) => r._id === "lucky")?.n ?? 0;
    return NextResponse.json({ booth, lucky }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "โหลดข้อมูลไม่สำเร็จ" }, { status: 500 });
  }
}