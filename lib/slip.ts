import sharp from "sharp";
import jsQR from "jsqr";
import { crc16 } from "./billerQr";

// อ่าน QR บนสลีปโอนเงินของธนาคารไทย (มาตรฐาน Mini QR ของ ธปท.)
// ได้ข้อมูล: รหัสธนาคารผู้โอน + transRef (เลขอ้างอิงรายการ ซ้ำกันไม่ได้)
// หมายเหตุ: QR นี้ไม่มียอดเงิน ยอดต้องให้ admin เทียบกับรายการเข้าบัญชี

export type SlipInfo = { sendingBank: string; transRef: string };

function parseTlv(s: string): Record<string, string> | null {
  const out: Record<string, string> = {};
  let i = 0;
  while (i < s.length) {
    if (i + 4 > s.length) return null;
    const id = s.slice(i, i + 2);
    const len = Number(s.slice(i + 2, i + 4));
    if (!Number.isInteger(len) || i + 4 + len > s.length) return null;
    out[id] = s.slice(i + 4, i + 4 + len);
    i += 4 + len;
  }
  return out;
}

export function parseSlipPayload(payload: string): SlipInfo | null {
  const m = /9104([0-9A-Fa-f]{4})$/.exec(payload);
  if (!m) return null;
  if (crc16(payload.slice(0, -4)) !== m[1].toUpperCase()) return null; // CRC ไม่ตรง = QR เสีย/ถูกแก้

  const top = parseTlv(payload);
  const sub = top?.["00"] ? parseTlv(top["00"]) : null;
  const sendingBank = sub?.["01"] ?? "";
  const transRef = sub?.["02"] ?? "";
  if (!/^\d{3}$/.test(sendingBank) || !/^[A-Za-z0-9]{10,40}$/.test(transRef)) return null;
  return { sendingBank, transRef };
}

async function decodeAt(buf: Buffer, width: number, enhance: boolean) {
  let img = sharp(buf, { failOn: "none" }).rotate().resize({ width });
  if (enhance) img = img.greyscale().normalise().sharpen();
  const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const res = jsQR(new Uint8ClampedArray(data), info.width, info.height, { inversionAttempts: "attemptBoth" });
  return res?.data ?? null;
}

// ลองหลายขนาด/หลายแบบ เพราะสลีปแคปหน้าจอแต่ละเครื่องคมชัดไม่เท่ากัน
export async function readSlip(buf: Buffer): Promise<SlipInfo | null> {
  const tries: [number, boolean][] = [
    [1200, false],
    [1800, false],
    [1200, true],
    [2400, true],
    [800, true],
  ];
  for (const [w, enhance] of tries) {
    try {
      const text = await decodeAt(buf, w, enhance);
      const info = text ? parseSlipPayload(text) : null;
      if (info) return info;
    } catch {
      /* ลองแบบถัดไป */
    }
  }
  return null;
}

// ย่อรูปก่อนเก็บลง Drive (~100-300KB ต่อใบ)
export function compressSlip(buf: Buffer) {
  return sharp(buf, { failOn: "none" })
    .rotate()
    .resize({ width: 1600, withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
}

// รูปโปรไฟล์: ครอปจัตุรัสกลางภาพ 512×512 JPG (~30-80KB)
export function compressAvatar(buf: Buffer) {
  return sharp(buf, { failOn: "none" })
    .rotate()
    .resize(512, 512, { fit: "cover" })
    .jpeg({ quality: 85 })
    .toBuffer();
}