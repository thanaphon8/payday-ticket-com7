import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/auth";

// ประวัติการยิงตั๋วเข้างานสำหรับหน้า admin: ?limit=200 (สูงสุด 500)
// คืน { total, rejected, scans: [{ id, code, result, at, name, phone, ticket, firstUsedAt }] }
//  - total    = จำนวนตั๋วที่ยิงสำเร็จ (result = "ok")
//  - rejected = จำนวนครั้งที่ยิงแล้วไม่ผ่าน (ซ้ำ / ไม่ใช่ตั๋วเข้าซุ้ม / ไม่พบ)
export async function GET(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return NextResponse.json({ error: guard.status === 401 ? "กรุณากรอกรหัสผ่าน admin" : "ไม่มีสิทธิ์" }, { status: guard.status });
  }

  const raw = Number(new URL(req.url).searchParams.get("limit"));
  const limit = Number.isFinite(raw) && raw >= 1 ? Math.min(500, Math.floor(raw)) : 200;

  const db = await getDb();
  const scans = db.collection("scans");

  const [total, rejected, docs] = await Promise.all([
    scans.countDocuments({ result: "ok" }),
    scans.countDocuments({ result: { $ne: "ok" } }),
    scans.find({}).sort({ at: -1 }).limit(limit).toArray(),
  ]);

  return NextResponse.json({
    total,
    rejected,
    scans: docs.map((d) => ({
      id: d._id.toString(),
      code: d.code as string,
      result: d.result as string,
      at: d.at as string,
      name: (d.name as string | undefined) ?? null,
      phone: (d.phone as string | undefined) ?? null,
      ticket: (d.ticket as string | undefined) ?? null,
      firstUsedAt: (d.firstUsedAt as string | undefined) ?? null,
    })),
  });
}