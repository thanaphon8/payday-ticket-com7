import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { getSessionUser } from "@/lib/auth";
import { MAX_SLIPS_PER_PAYMENT, expireStale, fulfillPayment } from "@/lib/tickets";
import { compressSlip, readSlip } from "@/lib/slip";
import { checkSlip, ocrSlip } from "@/lib/slipOcr";
import { uploadSlip } from "@/lib/drive";

const MAX_BYTES = 8 * 1024 * 1024;
const OK_TYPES = ["image/jpeg", "image/png", "image/webp"];

// โหมดทดสอบ: ALLOW_DUP_SLIP=1 ใน .env = ใช้สลีปใบเดิมซ้ำได้ (ไม่เช็กว่าเคยใช้) และไม่เช็กว่าเวลาโอนต้องหลังสร้างรายการ
// ก่อนขึ้นใช้งานจริง ลบบรรทัดนี้ออกจาก .env แล้วรีสตาร์ท ระบบจะกลับมากันสลีปซ้ำเหมือนเดิม
const allowDupSlip = () => process.env.ALLOW_DUP_SLIP === "1";

// รับสลีป (multipart field "slip"):
// 1) อ่าน QR บนสลีป → ได้ transRef  2) กันสลีปซ้ำด้วย unique index  3) เก็บรูปลง Drive
// 4) OCR อ่านยอด/ผู้รับ/เวลาโอน เทียบกับรายการ เก็บผลไว้ใน slips.check ให้ admin ดู
// 5) เปลี่ยนสถานะเป็น reviewing รอ admin อนุมัติ
// 6) ถ้า check.ok = ผ่านทุกข้อ → อนุมัติอัตโนมัติ + ออกตั๋วทันที (ไม่ผ่านก็ค้างรอ admin ตรวจ)
// เร็วขึ้น: OCR + บีบรูปเริ่มทำพร้อมกับอ่าน QR เลย (ไม่รอกัน) ส่วนอัปโหลด Drive เริ่มหลังจองเลขสลีปได้แล้ว
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser().catch(() => null);
  if (!user) return NextResponse.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });

  const { id } = await params;
  if (!ObjectId.isValid(id)) return NextResponse.json({ error: "ไม่พบรายการชำระเงิน" }, { status: 404 });
  const paymentId = new ObjectId(id);
  const userId = new ObjectId(user.id);

  const db = await getDb();
  await expireStale(db, userId);
  const payments = db.collection("payments");
  const slips = db.collection("slips");

  const pay = await payments.findOne({ _id: paymentId, userId });
  if (!pay) return NextResponse.json({ error: "ไม่พบรายการชำระเงิน" }, { status: 404 });
  if (pay.status === "expired")
    return NextResponse.json({ error: "รายการนี้หมดเวลาแล้ว กรุณาสร้างรายการใหม่" }, { status: 410 });
  if (pay.status !== "awaiting_slip" && pay.status !== "rejected")
    return NextResponse.json({ error: "รายการนี้ส่งสลีปแล้ว หรือไม่อยู่ในสถานะที่ส่งได้" }, { status: 409 });

  if ((await slips.countDocuments({ paymentId })) >= MAX_SLIPS_PER_PAYMENT)
    return NextResponse.json({ error: "ส่งสลีปครบจำนวนครั้งแล้ว กรุณาติดต่อเจ้าหน้าที่" }, { status: 429 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("slip");
  if (!(file instanceof File)) return NextResponse.json({ error: "ยังไม่ได้เลือกรูปสลีป" }, { status: 400 });
  if (!OK_TYPES.includes(file.type)) return NextResponse.json({ error: "ใช้ได้เฉพาะรูป JPG / PNG / WebP" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "รูปใหญ่เกิน 8 MB" }, { status: 413 });

  const raw = Buffer.from(await file.arrayBuffer());

  // เริ่ม OCR + บีบรูปทันที ทำคู่กับการอ่าน QR (ไม่มีผลข้างเคียง ถ้าอ่าน QR ไม่ได้ก็ทิ้งผลไป)
  const ocrP = ocrSlip(raw);
  const jpgP = compressSlip(raw);
  jpgP.catch(() => {}); // กัน unhandled rejection กรณีออกก่อนถึงจุดที่รอผล

  const info = await readSlip(raw);
  if (!info)
    return NextResponse.json(
      { error: "อ่าน QR บนสลีปไม่ได้ ใช้สลีปจากแอปธนาคาร ให้เห็น QR ชัด ไม่ครอป ไม่ตัดขอบ แล้วลองใหม่" },
      { status: 422 },
    );

  // จองเลขอ้างอิงสลีปก่อน (unique index ชนกัน = สลีปนี้เคยถูกใช้ ไม่ว่าของรายการไหน)
  // โหมดทดสอบ: ต่อ slipId ท้าย key ให้ไม่ชนกัน
  const dup = allowDupSlip();
  const slipId = new ObjectId();
  const nowIso = new Date().toISOString();
  try {
    await slips.insertOne({
      _id: slipId,
      key: dup ? `${info.sendingBank}-${info.transRef}-${slipId.toString()}` : `${info.sendingBank}-${info.transRef}`,
      sendingBank: info.sendingBank,
      transRef: info.transRef,
      paymentId,
      userId,
      status: "pending",
      fileId: null,
      createdAt: nowIso,
    });
  } catch (e) {
    if ((e as { code?: number }).code === 11000)
      return NextResponse.json({ error: "สลีปนี้เคยถูกใช้แล้ว ใช้สลีปซ้ำไม่ได้" }, { status: 409 });
    throw e;
  }

  let autoOk = false;
  try {
    // อัปโหลด Drive กับ OCR (เริ่มไปแล้ว) รอผลพร้อมกัน (ocrSlip ไม่โยน error ถ้าอ่านไม่ได้จะได้ค่าว่าง)
    const [fileId, ocr] = await Promise.all([
      jpgP.then((jpg) => uploadSlip(db, `${pay.ref}-${slipId.toString()}.jpg`, jpg)),
      ocrP,
    ]);
    const check = checkSlip(ocr, {
      amount: pay.amount as number,
      since: dup ? "1970-01-01T00:00:00.000Z" : (pay.createdAt as string),
    });
    autoOk = check.ok === true;
    await slips.updateOne({ _id: slipId }, { $set: { fileId, check } });
  } catch (e) {
    console.error("อัปสลีปขึ้น Drive ไม่สำเร็จ:", e);
    await slips.deleteOne({ _id: slipId }); // ปล่อยให้ผู้ใช้ส่งใบเดิมซ้ำได้
    return NextResponse.json({ error: "เก็บสลีปไม่สำเร็จ ลองใหม่อีกครั้ง" }, { status: 502 });
  }

  // กันส่งซ้อนสองครั้งพร้อมกัน: อัปเดตได้เฉพาะตอนสถานะยังเป็น awaiting_slip / rejected
  const upd = await payments.updateOne(
    { _id: paymentId, userId, status: { $in: ["awaiting_slip", "rejected"] } },
    { $set: { status: "reviewing", slipId, slipAt: nowIso }, $unset: { rejectReason: "" } },
  );
  if (upd.modifiedCount === 0) {
    await slips.deleteOne({ _id: slipId });
    return NextResponse.json({ error: "รายการนี้ส่งสลีปไปแล้ว" }, { status: 409 });
  }

  // ผ่านทุกข้อ → อนุมัติอัตโนมัติ (ทำเหมือนตอน admin กดอนุมัติ) ถ้าพลาดตรงไหนปล่อยค้าง reviewing ให้ admin จัดการต่อ
  if (autoOk) {
    try {
      const r = await payments.updateOne(
        { _id: paymentId, status: "reviewing" },
        { $set: { status: "approved", approvedAt: new Date().toISOString(), reviewedBy: "auto" } },
      );
      if (r.modifiedCount > 0) {
        await slips.updateOne({ _id: slipId }, { $set: { status: "approved" } });
        await fulfillPayment(db, paymentId);
        return NextResponse.json({ ok: true, status: "approved" });
      }
    } catch (e) {
      console.error("อนุมัติอัตโนมัติไม่สำเร็จ:", e);
    }
  }

  return NextResponse.json({ ok: true, status: "reviewing" });
}