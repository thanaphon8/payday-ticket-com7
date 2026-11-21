import { NextResponse } from "next/server";
import { ObjectId, type Document } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/auth";
import { BOOTHS, boothById } from "@/lib/booths";
import { departmentsOf, getCompany } from "../../../components/departments";
import { branchesOf, branchFullLabel } from "../../../components/branches";

// รหัสพนักงาน + บริษัท + แผนก (สำนักงานใหญ่) หรือสาขา (หน้าร้าน) ของผู้ใช้ ตามที่เลือกตอนสมัคร (บัญชีเก่า = null)
function orgOfUser(u: Document | undefined) {
  const cid = typeof u?.companyId === "number" ? u.companyId : null;
  const did = typeof u?.departmentId === "number" ? u.departmentId : null;
  const bid = typeof u?.branchId === "number" ? u.branchId : null;
  const company = cid ? (getCompany(cid)?.name ?? null) : null;
  const dept = cid && did ? (departmentsOf(cid).find((d) => d.id === did)?.name ?? null) : null;
  const branchDoc = cid && bid ? branchesOf(cid).find((b) => b.id === bid) : undefined;
  const branch = branchDoc ? branchFullLabel(branchDoc) : null;
  return {
    empCode: typeof u?.empCode === "string" && u.empCode ? u.empCode : null,
    company,
    department: dept ?? branch,
  };
}

// ประวัติการยิงตั๋วเข้างานสำหรับหน้า admin: ?limit=200 (สูงสุด 500) &booth=<id ซุ้ม> (กรองเฉพาะซุ้ม)
// คืน { total, rejected, booths, scans }
//  - total    = จำนวนตั๋วที่ยิงสำเร็จ (result = "ok") ทุกซุ้มรวมกัน
//  - rejected = จำนวนครั้งที่ยิงแล้วไม่ผ่าน (ซ้ำ / ผิดประเภท / ไม่พบ)
//  - booths   = สรุปรายซุ้ม [{ id, name, kind, count, amount, rejected, lastAt }] (amount = เงินรวมที่ซุ้มนั้นยิงได้)
//  - scans    = ประวัติล่าสุด (ซุ้มไหน ยิงให้ใคร เวลาไหน มูลค่าเท่าไหร่ + รหัสพนักงาน/บริษัท/แผนกของเจ้าของตั๋ว)
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

  // เจ้าของตั๋ว: code → order → user (ไว้แสดง/ค้นหาด้วยรหัสพนักงาน บริษัท แผนก)
  const codes = Array.from(new Set(docs.map((d) => d.code).filter((c): c is string => typeof c === "string")));
  const orderDocs = codes.length
    ? await db
        .collection("orders")
        .find({ code: { $in: codes } }, { projection: { code: 1, userId: 1, empCode: 1 } })
        .toArray()
    : [];
  const orderByCode = new Map(orderDocs.map((o) => [o.code as string, o]));
  const userIds = Array.from(
    new Map(
      orderDocs
        .map((o) => o.userId)
        .filter((x): x is ObjectId => x instanceof ObjectId)
        .map((x) => [x.toString(), x] as const),
    ).values(),
  );
  const userDocs = userIds.length
    ? await db
        .collection("users")
        .find({ _id: { $in: userIds } }, { projection: { empCode: 1, companyId: 1, departmentId: 1, branchId: 1 } })
        .toArray()
    : [];
  const userById = new Map(userDocs.map((u) => [u._id.toString(), u]));

  return NextResponse.json({
    total,
    rejected,
    booths: BOOTHS.map((b) => ({
      id: b.id,
      name: b.name,
      kind: b.kind,
      ...(stat.get(b.id) ?? { count: 0, amount: 0, rejected: 0, lastAt: null }),
    })),
    scans: docs.map((d) => {
      const order = orderByCode.get(d.code as string);
      const uid = order?.userId instanceof ObjectId ? order.userId.toString() : "";
      const org = orgOfUser(uid ? userById.get(uid) : undefined);
      return {
        id: d._id.toString(),
        code: d.code as string,
        result: d.result as string,
        at: d.at as string,
        name: (d.name as string | undefined) ?? null,
        phone: (d.phone as string | undefined) ?? null,
        empCode: org.empCode ?? (typeof order?.empCode === "string" && order.empCode ? order.empCode : null),
        company: org.company,
        department: org.department,
        ticket: (d.ticket as string | undefined) ?? null,
        firstUsedAt: (d.firstUsedAt as string | undefined) ?? null,
        boothId: (d.boothId as string | undefined) ?? null,
        boothName: (d.boothName as string | undefined) ?? null,
        amount: typeof d.amount === "number" ? d.amount : null,
      };
    }),
  });
}