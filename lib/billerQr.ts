import QRCode from "qrcode";

// สร้าง QR พร้อมเพย์แบบ Bill Payment (Tag 30) ด้วย Biller ID 15 หลัก + Ref1
// ใส่ยอดเงินและรหัสอ้างอิงลงใน QR เลย ลูกค้าสแกนแล้วยอดขึ้นเอง ไม่ต้องกรอก

const tlv = (id: string, value: string) => `${id}${String(value.length).padStart(2, "0")}${value}`;

// CRC16-CCITT (poly 0x1021, init 0xFFFF) ตามมาตรฐาน EMV QR
export function crc16(str: string) {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export function buildBillerPayload(opts: { billerId: string; ref1: string; ref2?: string; amountBaht: number }) {
  const { billerId, ref1, ref2, amountBaht } = opts;
  if (!/^\d{15}$/.test(billerId)) throw new Error("PROMPTPAY_BILLER_ID ต้องเป็นเลข 15 หลัก");
  if (!/^[A-Z0-9]{1,20}$/.test(ref1)) throw new Error("Ref1 ต้องเป็น A-Z 0-9 ยาวไม่เกิน 20 ตัว");
  if (!(amountBaht > 0)) throw new Error("ยอดเงินต้องมากกว่า 0");

  let merchant = tlv("00", "A000000677010112") + tlv("01", billerId) + tlv("02", ref1);
  if (ref2) merchant += tlv("03", ref2);

  const body =
    tlv("00", "01") + // payload format
    tlv("01", "12") + // 12 = QR ใช้ครั้งเดียว (มียอด)
    tlv("30", merchant) +
    tlv("53", "764") + // THB
    tlv("54", amountBaht.toFixed(2)) +
    tlv("58", "TH") +
    "6304";
  return body + crc16(body);
}

// คืน data URL ของรูป QR (ใส่ใน <img src> ได้เลย)
export async function makeQrDataUrl(ref: string, amountBaht: number) {
  const payload = buildBillerPayload({
    billerId: process.env.PROMPTPAY_BILLER_ID ?? "",
    ref1: ref,
    ref2: process.env.PROMPTPAY_REF2 || undefined,
    amountBaht,
  });
  return QRCode.toDataURL(payload, { errorCorrectionLevel: "M", margin: 2, width: 480 });
}