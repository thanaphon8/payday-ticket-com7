import QRCode from "qrcode";

// สร้าง QR พร้อมเพย์ Bill Payment ของ คอมเซเว่น เพื่อการกุศล โครงสร้างเหมือน QR ต้นฉบับของผู้รับ
// (Tag 30 + Tag 31 + point of initiation 11) แต่ใส่ยอดเงินตามออเดอร์ลง Tag 54 ลูกค้าสแกนแล้วยอดขึ้นเอง
// ไม่ฝังรหัสออเดอร์ลงใน QR (Biller ตายตัว Ref1/Ref2 เป็นค่าของผู้รับ) การจับคู่รายการใช้ยอด + เวลาโอน + เลขอ้างอิงสลีป

const BILLER_ID_DEFAULT = "010753600031508";
const REF1_DEFAULT = "KB000001637654";
const REF2_DEFAULT = "KPS004KB000001637654";
const BANK_CODE_DEFAULT = "004"; // Tag 31: รหัสธนาคารของบัญชีผู้รับ (004 = กสิกรไทย)

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

export function buildBillerPayload(opts: {
  billerId: string;
  ref1: string;
  ref2?: string;
  bankCode?: string;
  amountBaht: number;
}) {
  const { billerId, ref1, ref2, bankCode, amountBaht } = opts;
  if (!/^\d{15}$/.test(billerId)) throw new Error("PROMPTPAY_BILLER_ID ต้องเป็นเลข 15 หลัก");
  if (!/^[A-Z0-9]{1,20}$/.test(ref1)) throw new Error("Ref1 ต้องเป็น A-Z 0-9 ยาวไม่เกิน 20 ตัว");
  if (ref2 && !/^[A-Z0-9]{1,20}$/.test(ref2)) throw new Error("Ref2 ต้องเป็น A-Z 0-9 ยาวไม่เกิน 20 ตัว");
  if (bankCode && !/^\d{3}$/.test(bankCode)) throw new Error("รหัสธนาคารต้องเป็นเลข 3 หลัก");
  if (!(amountBaht > 0)) throw new Error("ยอดเงินต้องมากกว่า 0");

  // Tag 30: Bill Payment (Biller ID + Ref1 + Ref2)
  let biller = tlv("00", "A000000677010112") + tlv("01", billerId) + tlv("02", ref1);
  if (ref2) biller += tlv("03", ref2);

  // Tag 31: ช่องทางโอนเข้าบัญชีธนาคารของผู้รับ (เหมือน QR ต้นฉบับ)
  let bank = "";
  if (bankCode) {
    bank = tlv("00", "A000000677010113") + tlv("01", bankCode) + tlv("02", ref1);
    if (ref2) bank += tlv("04", ref2);
  }

  const body =
    tlv("00", "01") + // payload format
    tlv("01", "11") + // 11 = แบบเดียวกับ QR ต้นฉบับ
    tlv("30", biller) +
    (bank ? tlv("31", bank) : "") +
    tlv("53", "764") + // THB
    tlv("54", amountBaht.toFixed(2)) +
    tlv("58", "TH") +
    "6304";
  return body + crc16(body);
}

// คืน data URL ของรูป QR (ใส่ใน <img src> ได้เลย) ref = รหัสออเดอร์ (ไม่ได้ฝังใน QR แล้ว คงพารามิเตอร์ไว้ให้ route เดิมเรียกได้)
export async function makeQrDataUrl(_ref: string, amountBaht: number) {
  const payload = buildBillerPayload({
    billerId: process.env.PROMPTPAY_BILLER_ID || BILLER_ID_DEFAULT,
    ref1: process.env.PROMPTPAY_REF1 || REF1_DEFAULT,
    ref2: process.env.PROMPTPAY_REF2 || REF2_DEFAULT,
    bankCode: process.env.PROMPTPAY_BANK_CODE || BANK_CODE_DEFAULT,
    amountBaht,
  });
  return QRCode.toDataURL(payload, { errorCorrectionLevel: "M", margin: 2, width: 720 });
}