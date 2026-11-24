import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { hashPassword, validPassword, validUsername } from "@/lib/auth";
import { validEmpCode } from "@/lib/tickets";

const MAX_TRIES = 5;
const WINDOW_MS = 15 * 60 * 1000;
const BAD = { error: "ข้อมูลไม่ถูกต้อง" };

// ตัวนับครั้งที่ลอง ใช้ _id เป็น string (เช่น "reset:ip:1.2.3.4")
type Attempt = { _id: string; count: number; resetAt: Date };
const attemptsOf = (db: Awaited<ReturnType<typeof getDb>>) =>
  db.collection<Attempt>("authAttempts");

// นับครั้งใน collection authAttempts คืน true ถ้าเกินโควต้า
async function limited(
  db: Awaited<ReturnType<typeof getDb>>,
  key: string
): Promise<boolean> {
  const col = attemptsOf(db);
  const now = new Date();
  const cur = await col.findOne({ _id: key });
  if (!cur || cur.resetAt < now) {
    await col.updateOne(
      { _id: key },
      { $set: { count: 1, resetAt: new Date(now.getTime() + WINDOW_MS) } },
      { upsert: true }
    );
    return false;
  }
  await col.updateOne({ _id: key }, { $inc: { count: 1 } });
  return cur.count + 1 > MAX_TRIES;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const username = String(body?.username ?? "").trim();
    const usernameLower = username.toLowerCase();
    const empCode = String(body?.empCode ?? "").replace(/\D/g, "");
    const password = String(body?.password ?? "");
    const companyId =
      typeof body?.companyId === "number" &&
      Number.isInteger(body.companyId) &&
      body.companyId > 0 &&
      body.companyId <= 99999
        ? (body.companyId as number)
        : null;

    if (
      companyId === null ||
      !validUsername(username) ||
      !validEmpCode(empCode)
    ) {
      return NextResponse.json(BAD, { status: 400 });
    }
    if (!validPassword(password)) {
      return NextResponse.json(
        { errors: { password: "รหัสผ่านต้องยาวอย่างน้อย 6 ตัวอักษร" } },
        { status: 400 }
      );
    }

    const db = await getDb();
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

    // จำกัดทั้งต่อ IP และต่อ username (นับทุกครั้งที่ยิง ไม่ว่าถูกหรือผิด)
    const [byIp, byUser] = await Promise.all([
      limited(db, `reset:ip:${ip}`),
      limited(db, `reset:user:${usernameLower}`),
    ]);
    if (byIp || byUser) {
      return NextResponse.json(
        { error: "ลองบ่อยเกินไป รอสักครู่แล้วลองใหม่" },
        { status: 429 }
      );
    }

    const u = await db
      .collection("users")
      .findOne({ usernameLower, companyId, empCode });
    if (!u) return NextResponse.json(BAD, { status: 401 });

    await db.collection("users").updateOne(
      { _id: u._id },
      {
        $set: {
          passwordHash: await hashPassword(password),
          passwordChangedAt: new Date(),
        },
      }
    );
    await attemptsOf(db).deleteOne({ _id: `reset:user:${usernameLower}` });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("reset-password failed", e);
    return NextResponse.json({ error: "เซิร์ฟเวอร์ผิดพลาด" }, { status: 500 });
  }
}