import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/auth";
import { downloadSlip } from "@/lib/drive";

// ส่งรูปสลีปจาก Google Drive ให้ admin ดู (รูปไม่เปิดสาธารณะ ผ่านเว็บเราเท่านั้น)
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return NextResponse.json({ error: "ไม่มีสิทธิ์" }, { status: guard.status });

  const { id } = await params;
  if (!ObjectId.isValid(id)) return NextResponse.json({ error: "ไม่พบรายการ" }, { status: 404 });

  const db = await getDb();
  const pay = await db.collection("payments").findOne({ _id: new ObjectId(id) });
  const slip = pay?.slipId ? await db.collection("slips").findOne({ _id: pay.slipId }) : null;
  if (!slip?.fileId) return NextResponse.json({ error: "ไม่พบรูปสลีป" }, { status: 404 });

  try {
    const buf = await downloadSlip(slip.fileId as string);
    return new NextResponse(new Uint8Array(buf), {
      headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=3600" },
    });
  } catch (e) {
    console.error("ดึงสลีปจาก Drive ไม่สำเร็จ:", e);
    return NextResponse.json({ error: "ดึงรูปจาก Drive ไม่ได้" }, { status: 502 });
  }
}