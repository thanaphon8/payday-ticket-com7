import { NextResponse } from "next/server";
import { ObjectId, type Document } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/auth";
import { expireStale, type PaymentTicket } from "@/lib/tickets";
import type { SlipCheck } from "@/lib/slipOcr";
import { departmentsOf, getCompany } from "../../../components/departments";
import { branchesOf, branchFullLabel } from "../../../components/branches";

const LISTABLE = ["reviewing", "approved", "auto", "rejected"] as const;
const LIST_LIMIT = 300; // ค้นหาฝั่งหน้าเว็บ จึงส่งมาเยอะขึ้นเพื่อให้ค้นเจอ

// เคยถูกปฏิเสธ (ไม่ว่าตอนนี้สถานะอะไร) = status rejected หรือมี rejectCount / rejectReason
const EVER_REJECTED = {
  $or: [{ status: "rejected" }, { rejectCount: { $gt: 0 } }, { rejectReason: { $type: "string" } }],
};

// แท็ก "แก้ไข" = ออเดอร์เดิมที่เคยถูกปฏิเสธ แล้วผู้ซื้อส่งสลีปใหม่เข้ามา (ตอนนี้รอตรวจ/อนุมัติแล้ว)
// ออเดอร์ใหม่ที่ผู้ซื้อกดสร้างเอง (QR ใหม่) เป็นคนละรายการ ไม่มี rejectCount จึงไม่ติดแท็ก
function retryOf(d: Document) {
  if (d.status !== "reviewing" && d.status !== "approved") return null;
  const count =
    typeof d.rejectCount === "number" && d.rejectCount > 0
      ? d.rejectCount
      : typeof d.rejectReason === "string" && d.rejectReason
        ? 1
        : 0;
  if (count === 0) return null;
  const last = (d.lastRejectReason as string | undefined) ?? (d.rejectReason as string | undefined) ?? null;
  return { count, lastReason: last };
}

function avatarUrlOf(id: ObjectId, u: Document | undefined) {
  if (!u || typeof u.avatarFileId !== "string") return null;
  const v = u.avatarAt instanceof Date ? u.avatarAt.toISOString() : String(u.avatarAt ?? "");
  return `/api/admin/users/${id.toString()}/avatar${v ? `?v=${encodeURIComponent(v)}` : ""}`;
}

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

// รายการสำหรับหน้า admin: ?status=reviewing (ค่าเริ่มต้น) | approved | auto | rejected
// auto = อนุมัติแล้วโดยระบบอัตโนมัติ (reviewedBy = "auto") ซึ่งยังนับรวมอยู่ใน approved ด้วย
// rejected = ทุกรายการที่เคยถูกปฏิเสธ (แม้ผู้ซื้อส่งสลีปใหม่แล้วก็ยังอยู่ในแถบนี้)
// คืน { counts: { reviewing, approved, auto, rejected, bans }, payments: [...] }
// counts.bans = จำนวนผู้ใช้ที่ถูกแบนอยู่ตอนนี้ (ใช้แสดงจุดแดงที่เมนู "ถูกแบน")
// slip.check = ผล OCR เทียบกับรายการ (null = สลีปเก่าที่ยังไม่เคยตรวจ)
// avatarUrl = รูปโปรไฟล์ผู้ซื้อ / retry = ไม่ใช่ null ถ้าส่งสลีปใหม่ในออเดอร์เดิมหลังถูกปฏิเสธ (แท็ก "แก้ไข")
// empCode / company / department = ข้อมูลของผู้ซื้อ (ไว้ให้หน้าเว็บค้นหา)
export async function GET(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return NextResponse.json({ error: guard.status === 401 ? "กรุณาเข้าสู่ระบบ" : "ไม่มีสิทธิ์" }, { status: guard.status });

  const q = new URL(req.url).searchParams.get("status") ?? "reviewing";
  const status = (LISTABLE as readonly string[]).includes(q) ? q : "reviewing";
  const filter =
    status === "auto"
      ? { status: "approved", reviewedBy: "auto" }
      : status === "rejected"
        ? EVER_REJECTED
        : { status };

  const db = await getDb();
  await expireStale(db);
  const payments = db.collection("payments");

  const [reviewing, approved, auto, rejected, bans, docs] = await Promise.all([
    payments.countDocuments({ status: "reviewing" }),
    payments.countDocuments({ status: "approved" }),
    payments.countDocuments({ status: "approved", reviewedBy: "auto" }),
    payments.countDocuments(EVER_REJECTED),
    db.collection("users").countDocuments({ bannedUntil: { $gt: new Date().toISOString() } }),
    payments
      .find(filter)
      // รอตรวจ: เก่าสุดก่อน (ตรวจตามคิว) / ประวัติ: ใหม่สุดก่อน
      .sort(status === "reviewing" ? { slipAt: 1 } : { createdAt: -1 })
      .limit(LIST_LIMIT)
      .toArray(),
  ]);

  const slipIds = docs.map((d) => d.slipId).filter((x): x is ObjectId => x instanceof ObjectId);
  const slipDocs = slipIds.length ? await db.collection("slips").find({ _id: { $in: slipIds } }).toArray() : [];
  const slipById = new Map(slipDocs.map((s) => [s._id.toString(), s]));

  const uniqUsers = new Map<string, ObjectId>();
  for (const d of docs) if (d.userId instanceof ObjectId) uniqUsers.set(d.userId.toString(), d.userId);
  const userIds = Array.from(uniqUsers.values());

  const userDocs = userIds.length
    ? await db
        .collection("users")
        .find(
          { _id: { $in: userIds } },
          { projection: { avatarFileId: 1, avatarAt: 1, empCode: 1, companyId: 1, departmentId: 1, branchId: 1 } },
        )
        .toArray()
    : [];
  const userById = new Map(userDocs.map((u) => [u._id.toString(), u]));

  const list = docs.map((d) => {
    const tickets = d.tickets as PaymentTicket[];
    const slip = d.slipId ? slipById.get(String(d.slipId)) : undefined;
    const uid = d.userId instanceof ObjectId ? d.userId : null;
    const user = uid ? userById.get(uid.toString()) : undefined;
    const org = orgOfUser(user);
    return {
      id: d._id.toString(),
      ref: d.ref as string,
      name: d.name as string,
      phone: d.phone as string,
      empCode: org.empCode ?? (typeof d.empCode === "string" && d.empCode ? d.empCode : null),
      company: org.company,
      department: org.department,
      amount: d.amount as number,
      status: d.status as string,
      auto: d.status === "approved" && d.reviewedBy === "auto",
      createdAt: d.createdAt as string,
      slipAt: (d.slipAt as string | undefined) ?? null,
      booth: tickets.filter((t) => t.ticket === "booth").length,
      lucky: tickets.filter((t) => t.ticket === "lucky").length,
      rejectReason: (d.rejectReason as string | undefined) ?? null,
      avatarUrl: uid ? avatarUrlOf(uid, user) : null,
      retry: retryOf(d),
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