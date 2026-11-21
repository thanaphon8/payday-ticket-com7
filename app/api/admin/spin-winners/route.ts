import { NextResponse } from "next/server";
import { ObjectId, type Document } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/auth";
import { departmentsOf, getCompany } from "../../../components/departments";
import { branchesOf, branchFullLabel } from "../../../components/branches";

const MAX_ROWS = 2000;

function avatarUrlOf(u: Document | undefined) {
  if (!u || typeof u.avatarFileId !== "string") return null;
  const v = u.avatarAt instanceof Date ? u.avatarAt.toISOString() : String(u.avatarAt ?? "");
  return `/api/admin/users/${u._id.toString()}/avatar${v ? `?v=${encodeURIComponent(v)}` : ""}`;
}

// บริษัท + แผนก (สำนักงานใหญ่) หรือสาขา (หน้าร้าน) ตามที่เลือกตอนสมัคร (บัญชีเก่า = null)
function orgOfUser(u: Document | undefined) {
  const cid = typeof u?.companyId === "number" ? u.companyId : null;
  const did = typeof u?.departmentId === "number" ? u.departmentId : null;
  const bid = typeof u?.branchId === "number" ? u.branchId : null;
  const company = cid ? (getCompany(cid)?.name ?? null) : null;
  const dept = cid && did ? (departmentsOf(cid).find((d) => d.id === did)?.name ?? null) : null;
  const branchDoc = cid && bid ? branchesOf(cid).find((b) => b.id === bid) : undefined;
  const branch = branchDoc ? branchFullLabel(branchDoc) : null;
  return { company, department: dept ?? branch };
}

// ผู้ถูกรางวัลจากตู้สุ่ม (หน้า /spin) ทั้งหมด สำหรับแถบ "ผลสุ่ม Spin" ในหน้า admin
// rank = อันดับตามลำดับที่ได้รางวัล (คนแรก = 1) / เรียงคนที่ได้ล่าสุดขึ้นก่อน
// คืน { winners: [{ id, rank, code, wonAt, name, phone, empCode, company, department, avatarUrl }] }
export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok)
    return NextResponse.json({ error: guard.status === 401 ? "กรุณาเข้าสู่ระบบ" : "ไม่มีสิทธิ์" }, { status: guard.status });

  const db = await getDb();
  const docs = await db
    .collection("orders")
    .find({ ticket: "lucky", won: true })
    .sort({ wonAt: 1 })
    .limit(MAX_ROWS)
    .toArray();

  const userIds = Array.from(
    new Map(
      docs
        .map((d) => d.userId)
        .filter((x): x is ObjectId => x instanceof ObjectId)
        .map((x) => [x.toString(), x] as const),
    ).values(),
  );
  const userDocs = userIds.length ? await db.collection("users").find({ _id: { $in: userIds } }).toArray() : [];
  const userById = new Map(userDocs.map((u) => [u._id.toString(), u]));

  const winners = docs
    .map((d, i) => {
      const user = d.userId instanceof ObjectId ? userById.get(d.userId.toString()) : undefined;
      const org = orgOfUser(user);
      return {
        id: d._id.toString(),
        rank: i + 1,
        code: d.code as string,
        wonAt: (d.wonAt as string | undefined) ?? null,
        name: ((d.name as string | undefined) || (user?.name as string | undefined)) ?? "",
        phone: ((d.phone as string | undefined) || (user?.phone as string | undefined)) ?? "",
        empCode: (d.empCode as string | undefined) ?? (typeof user?.empCode === "string" ? user.empCode : null),
        company: org.company,
        department: org.department,
        avatarUrl: avatarUrlOf(user),
      };
    })
    .reverse();

  return NextResponse.json({ winners });
}