import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/auth";
import { BOOTHS, boothById } from "@/lib/booths";

// ประวัติการยิงตั๋วเข้างานสำหรับหน้า admin: ?limit=200 (สูงสุด 500) &booth=<id ซุ้ม> (กรองเฉพาะซุ้ม)
// คืน { total, rejected, booths, scans }
//  - total    = จำนวนตั๋วที่ยิงสำเร็จ (result = "ok") ทุกซุ้มรวมกัน
//  - rejected = จำนวนครั้งที่ยิงแล้วไม่ผ่าน (ซ้ำ / ผิดประเภท / ไม่พบ)
//  - booths   = สรุปรายซุ้ม [{ id, name, kind, count, amount, rejected, lastAt }] (amount = เงินรวมที่ซุ้มนั้นยิงได้)
//  - scans    = ประวัติล่าสุด (ซุ้มไหน ยิงให้ใคร เวลาไหน มูลค่าเท่าไหร่)
export async function GET(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return NextResponse.json({ error: guard.status === 401 ? "กรุณากรอกรหัสผ่าน admin" : "ไม่มีสิทธิ์" }, { status: guard.status });
  }

  const params = new URL(req.url).searchParams;
  const raw = Number(params.get("limit"));
  const limit = Number.isFinite(raw) && raw >= 1 ? Math.min(500, Math.floor(raw)) : 200;
  const boothParam = params.get("booth") ?? "";
  const filter = boothParam && boothById(boothParam) ? { boothId: boothParam } : {};

  const db = await getDb();
  const scans = db.collection("scans");

  const [total, rejected, docs, grouped] = await Promise.all([
    scans.countDocuments({ result: "ok" }),
    scans.countDocuments({ result: { $ne: "ok" } }),
    scans.find(filter).sort({ at: -1 }).limit(limit).toArray(),
    scans
      .aggregate([
        {
          $group: {
            _id: { b: "$boothId", ok: { $eq: ["$result", "ok"] } },
            count: { $sum: 1 },
            amount: { $sum: { $ifNull: ["$amount", 0] } },
            lastAt: { $max: "$at" },
          },
        },
      ])
      .toArray(),
  ]);

  const stat = new Map<string, { count: number; amount: number; rejected: number; lastAt: string | null }>();
  for (const g of grouped) {
    const id = (g._id as { b?: string } | null)?.b;
    if (!id) continue; // ประวัติเก่าก่อนแยกบัญชีซุ้ม ไม่มีซุ้ม
    const s = stat.get(id) ?? { count: 0, amount: 0, rejected: 0, lastAt: null };
    if ((g._id as { ok: boolean }).ok) {
      s.count += g.count as number;
      s.amount += g.amount as number;
    } else {
      s.rejected += g.count as number;
    }
    const last = g.lastAt as string | undefined;
    if (last && (!s.lastAt || last > s.lastAt)) s.lastAt = last;
    stat.set(id, s);
  }

  return NextResponse.json({
    total,
    rejected,
    booths: BOOTHS.map((b) => ({
      id: b.id,
      name: b.name,
      kind: b.kind,
      ...(stat.get(b.id) ?? { count: 0, amount: 0, rejected: 0, lastAt: null }),
    })),
    scans: docs.map((d) => ({
      id: d._id.toString(),
      code: d.code as string,
      result: d.result as string,
      at: d.at as string,
      name: (d.name as string | undefined) ?? null,
      phone: (d.phone as string | undefined) ?? null,
      ticket: (d.ticket as string | undefined) ?? null,
      firstUsedAt: (d.firstUsedAt as string | undefined) ?? null,
      boothId: (d.boothId as string | undefined) ?? null,
      boothName: (d.boothName as string | undefined) ?? null,
      amount: typeof d.amount === "number" ? d.amount : null,
    })),
  });
}