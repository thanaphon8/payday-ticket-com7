import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/auth";

// เฉพาะแอดมิน (ล็อกอิน + กรอกรหัส admin แล้ว)
// โหล = ตั๋ว Lucky Draw ที่ออกแล้ว มีรหัสพนักงาน และยังไม่ถูกรางวัล
// ตั๋วเก่าที่ไม่มี empCode ไม่เข้าโหล
const POOL_FILTER = {
  ticket: "lucky",
  empCode: { $type: "string" },
  won: { $ne: true },
} as const;

const MAX_DRAW_TRIES = 5;

function deny(status: 401 | 403) {
  return NextResponse.json({ error: status === 401 ? "กรุณาเข้าสู่ระบบ" : "ไม่มีสิทธิ์" }, { status });
}

// โหลปัจจุบัน + รายชื่อผู้ถูกรางวัลแล้ว
export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return deny(guard.status);

  const db = await getDb();
  const orders = db.collection("orders");

  const [pool, winners] = await Promise.all([
    orders.find(POOL_FILTER, { projection: { code: 1, empCode: 1 } }).limit(1000).toArray(),
    orders
      .find({ ticket: "lucky", won: true })
      .sort({ wonAt: -1 })
      .limit(200)
      .project({ code: 1, empCode: 1, name: 1, wonAt: 1 })
      .toArray(),
  ]);
  const total = await orders.countDocuments(POOL_FILTER);

  return NextResponse.json({
    total, // จำนวนตั๋วในโหลทั้งหมด
    pool: pool.map((d) => ({ code: d.code as string, empCode: d.empCode as string })), // สูงสุด 1000 ใบ ไว้แสดงตอนตั๋วหล่นลงโหล
    winners: winners.map((d) => ({
      code: d.code as string,
      empCode: d.empCode as string,
      name: d.name as string,
      wonAt: (d.wonAt as string | undefined) ?? null,
    })),
  });
}

// สุ่ม 1 ใบ: ตัดตั๋วที่ถูกออกจากโหล (won = true) แล้วคืนผู้ถูกรางวัล
// เลือกด้วย $sample ฝั่ง DB และเปลี่ยนสถานะแบบ atomic กันสองคนกดสุ่มพร้อมกันได้ใบเดียวกัน
export async function POST() {
  const guard = await requireAdmin();
  if (!guard.ok) return deny(guard.status);

  const db = await getDb();
  const orders = db.collection("orders");

  for (let i = 0; i < MAX_DRAW_TRIES; i++) {
    const [pick] = await orders.aggregate([{ $match: POOL_FILTER }, { $sample: { size: 1 } }]).toArray();
    if (!pick) return NextResponse.json({ error: "ไม่มีตั๋วในโหลแล้ว" }, { status: 404 });

    const wonAt = new Date().toISOString();
    const r = await orders.updateOne(
      { _id: pick._id, ...POOL_FILTER },
      { $set: { won: true, wonAt, wonBy: guard.user.id } },
    );
    if (r.matchedCount === 1) {
      const remaining = await orders.countDocuments(POOL_FILTER);
      return NextResponse.json({
        winner: {
          code: pick.code as string,
          empCode: pick.empCode as string,
          name: pick.name as string,
          wonAt,
        },
        remaining,
      });
    }
    // ใบนี้ถูกคนอื่นจับไปก่อน สุ่มใหม่
  }

  return NextResponse.json({ error: "สุ่มไม่สำเร็จ ลองใหม่อีกครั้ง" }, { status: 409 });
}