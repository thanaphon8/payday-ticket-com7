import { NextResponse } from "next/server";
import type { Db, Document, ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/auth";
import { departmentsOf, getCompany } from "../../components/departments";
import { branchesOf, branchFullLabel } from "../../components/branches";

// เฉพาะแอดมิน (ล็อกอิน + กรอกรหัส admin แล้ว)
// โหล = ตั๋ว Lucky Draw ที่ออกแล้ว มีรหัสพนักงาน และยังไม่ถูกรางวัล
// ตั๋วเก่าที่ไม่มี empCode ไม่เข้าโหล
const POOL_FILTER = {
  ticket: "lucky",
  empCode: { $type: "string" },
  won: { $ne: true },
} as const;

const MAX_DRAW_TRIES = 5;
const MAX_BATCH = 20; // สุ่มได้สูงสุดกี่คนต่อการกดครั้งเดียว (ต้องตรงกับ MAX_BATCH ในหน้า spin)

function deny(status: 401 | 403) {
  return NextResponse.json({ error: status === 401 ? "กรุณาเข้าสู่ระบบ" : "ไม่มีสิทธิ์" }, { status });
}

// บริษัท + แผนก (สำนักงานใหญ่) หรือสาขา (หน้าร้าน) + รูปโปรไฟล์ ของเจ้าของตั๋ว ตามที่เลือกตอนสมัคร
// บัญชีเก่าที่ไม่มีข้อมูลนี้ = null
type Org = { company: string | null; department: string | null; avatarAt: string | null };

async function orgOfUsers(db: Db, userIds: (ObjectId | undefined)[]): Promise<Map<string, Org>> {
  const ids = userIds.filter((x): x is ObjectId => !!x);
  const out = new Map<string, Org>();
  if (ids.length === 0) return out;
  const users = await db
    .collection("users")
    .find({ _id: { $in: ids } }, { projection: { companyId: 1, departmentId: 1, branchId: 1, avatarAt: 1 } })
    .toArray();
  for (const u of users) {
    const cid = typeof u.companyId === "number" ? u.companyId : null;
    const did = typeof u.departmentId === "number" ? u.departmentId : null;
    const bid = typeof u.branchId === "number" ? u.branchId : null;
    const company = cid ? (getCompany(cid)?.name ?? null) : null;
    const dept = cid && did ? (departmentsOf(cid).find((d) => d.id === did)?.name ?? null) : null;
    const branchDoc = cid && bid ? branchesOf(cid).find((b) => b.id === bid) : undefined;
    const branch = branchDoc ? branchFullLabel(branchDoc) : null;
    const avatarAt = typeof u.avatarAt === "string" && u.avatarAt ? u.avatarAt : null;
    out.set(u._id.toString(), { company, department: dept ?? branch, avatarAt });
  }
  return out;
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
      .project({ code: 1, empCode: 1, name: 1, wonAt: 1, userId: 1 })
      .toArray(),
  ]);
  const total = await orders.countDocuments(POOL_FILTER);
  const orgs = await orgOfUsers(
    db,
    winners.map((d) => d.userId as ObjectId | undefined),
  );

  return NextResponse.json({
    total, // จำนวนตั๋วในโหลทั้งหมด
    pool: pool.map((d) => ({ code: d.code as string, empCode: d.empCode as string })), // สูงสุด 1000 ใบ ไว้แสดงตอนตั๋วหล่นลงโหล
    winners: winners.map((d) => {
      const uid = d.userId ? String(d.userId) : "";
      const org = orgs.get(uid);
      return {
        code: d.code as string,
        empCode: d.empCode as string,
        name: d.name as string,
        wonAt: (d.wonAt as string | undefined) ?? null,
        company: org?.company ?? null,
        department: org?.department ?? null,
        userId: uid || null,
        avatarAt: org?.avatarAt ?? null,
      };
    }),
  });
}

// สุ่มผู้ถูกรางวัล: body = { count } (ไม่ส่ง = 1 คน / สูงสุด MAX_BATCH)
// ตัดตั๋วที่ถูกออกจากโหล (won = true) แล้วคืน winners เรียงตามลำดับที่สุ่มได้ (winner = คนแรก ไว้ให้โค้ดเก่า)
// โหลเหลือน้อยกว่าที่ขอ = ได้เท่าที่มี / พยายามไม่ซ้ำคน (empCode) ในรอบเดียวกัน จนกว่าจะไม่เหลือคนอื่นให้สุ่ม
// เลือกด้วย $sample ฝั่ง DB และเปลี่ยนสถานะแบบ atomic กันสองคนกดสุ่มพร้อมกันได้ใบเดียวกัน
export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return deny(guard.status);

  const body = await req.json().catch(() => null);
  const asked = Math.floor(Number(body?.count));
  const count = Number.isFinite(asked) ? Math.min(MAX_BATCH, Math.max(1, asked)) : 1;

  const db = await getDb();
  const orders = db.collection("orders");

  const picks: (Document & { wonAt: string })[] = [];
  const baseMs = Date.now();
  let empty = false;
  let failed = false;

  for (let n = 0; n < count && !empty && !failed; n++) {
    let got = false;
    for (let i = 0; i < MAX_DRAW_TRIES; i++) {
      // พยายามไม่ให้ได้คนเดิม (empCode ซ้ำ) ในรอบเดียวกัน ถ้าไม่เหลือคนอื่นแล้วค่อยยอมให้ซ้ำ
      const got_codes = picks.map((p) => p.empCode as string);
      let [pick] = got_codes.length
        ? await orders
            .aggregate([{ $match: { ...POOL_FILTER, empCode: { $type: "string", $nin: got_codes } } }, { $sample: { size: 1 } }])
            .toArray()
        : [];
      if (!pick) [pick] = await orders.aggregate([{ $match: POOL_FILTER }, { $sample: { size: 1 } }]).toArray();
      if (!pick) {
        empty = true;
        break;
      }
      // +n มิลลิวินาที: wonAt ของแต่ละคนไม่ซ้ำกัน เรียงลำดับที่สุ่มได้คงที่เวลาโหลดรายชื่อใหม่
      const wonAt = new Date(baseMs + picks.length).toISOString();
      const r = await orders.updateOne(
        { _id: pick._id, ...POOL_FILTER },
        { $set: { won: true, wonAt, wonBy: guard.user.id } },
      );
      if (r.matchedCount === 1) {
        picks.push({ ...pick, wonAt });
        got = true;
        break;
      }
      // ใบนี้ถูกคนอื่นจับไปก่อน สุ่มใหม่
    }
    if (!got && !empty) failed = true;
  }

  if (picks.length === 0) {
    if (empty) return NextResponse.json({ error: "ไม่มีตั๋วในโหลแล้ว" }, { status: 404 });
    return NextResponse.json({ error: "สุ่มไม่สำเร็จ ลองใหม่อีกครั้ง" }, { status: 409 });
  }

  const remaining = await orders.countDocuments(POOL_FILTER);
  const orgs = await orgOfUsers(
    db,
    picks.map((p) => p.userId as ObjectId | undefined),
  );
  const winners = picks.map((p) => {
    const uid = p.userId ? String(p.userId) : "";
    const org = orgs.get(uid);
    return {
      code: p.code as string,
      empCode: p.empCode as string,
      name: p.name as string,
      wonAt: p.wonAt,
      company: org?.company ?? null,
      department: org?.department ?? null,
      userId: uid || null,
      avatarAt: org?.avatarAt ?? null,
    };
  });

  return NextResponse.json({ winners, winner: winners[0], remaining });
}