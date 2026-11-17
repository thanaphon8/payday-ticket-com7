import { getDb } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/auth";
import type { PaymentTicket } from "@/lib/tickets";

// ส่งออกรายการที่อนุมัติแล้วเป็น CSV (เปิดใน Excel ภาษาไทยได้ ใส่ BOM ให้แล้ว)
const TZ_OFFSET_MS = 7 * 60 * 60 * 1000; // Asia/Bangkok

const bkk = (iso: string | undefined) =>
  iso ? new Date(new Date(iso).getTime() + TZ_OFFSET_MS).toISOString().replace("T", " ").slice(0, 19) : "";

// กัน formula injection ใน Excel และครอบด้วย "" ตามมาตรฐาน CSV
function cell(v: string | number): string {
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

// เบอร์โทรให้ Excel แสดงเป็นข้อความ ไม่ตัดเลข 0 หน้า
const phoneCell = (p: string) => `="${String(p).replace(/[^0-9+]/g, "")}"`;

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return new Response(guard.status === 401 ? "กรุณาเข้าสู่ระบบ" : "ไม่มีสิทธิ์", { status: guard.status });
  }

  const db = await getDb();
  const docs = await db.collection("payments").find({ status: "approved" }).sort({ approvedAt: 1 }).toArray();

  const header = ["Ref1", "ชื่อ", "เบอร์โทร", "ตั๋วเข้างาน", "ตั๋ว Lucky Draw", "ยอดเงิน", "เวลาอนุมัติ", "เวลาสร้างรายการ"];
  const lines = [header.map(cell).join(",")];

  for (const d of docs) {
    const tickets = (d.tickets ?? []) as PaymentTicket[];
    const booth = tickets.filter((t) => t.ticket === "booth").length;
    const lucky = tickets.filter((t) => t.ticket === "lucky").length;
    lines.push(
      [
        cell(d.ref as string),
        cell(d.name as string),
        phoneCell(d.phone as string),
        cell(booth),
        cell(lucky),
        cell(d.amount as number),
        cell(bkk(d.approvedAt as string | undefined)),
        cell(bkk(d.createdAt as string | undefined)),
      ].join(","),
    );
  }

  const stamp = new Date(Date.now() + TZ_OFFSET_MS).toISOString().slice(0, 10);
  return new Response("\uFEFF" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="paid-orders-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}