import fs from "fs";
import os from "os";
import path from "path";
import sharp, { type Sharp } from "sharp";
import { createWorker, type Worker } from "tesseract.js";

// ต้องทำก่อนใช้:
//  1) npm i tesseract.js
//  2) สร้าง next.config.ts ที่มี serverExternalPackages: ["tesseract.js", "sharp"] แล้วรีสตาร์ท dev server
//  3) ไฟล์ภาษา: วาง tessdata/tha.traineddata และ tessdata/eng.traineddata ไว้ในโปรเจกต์ (ใช้บน Vercel ไม่ต้องโหลดจากเน็ต)
//     ถ้าไม่มีไฟล์ในโฟลเดอร์นี้ tesseract.js จะโหลดจากอินเทอร์เน็ตตอนรันครั้งแรก (ใหญ่ ใช้เวลานาน) แล้วเก็บไว้ในโฟลเดอร์ชั่วคราว
//  4) (ไม่บังคับ) .env: RECEIVER_NAME=ชื่อผู้รับ ถ้าไม่ตั้ง ใช้ "คอมเซเว่น เพื่อการกุศล"
//     ตั้งหลายชื่อได้ คั่นด้วย , (ใช้เมื่อชื่อผู้รับเปลี่ยน)

export type SlipOcr = {
  amount: number | null;
  amounts: number[];
  receiverOk: boolean;
  transferAt: string | null;
  rawText: string;
  error: string | null;
  // true = OCR อ่านรูปได้จริง (ไม่ error และเจออย่างน้อยหนึ่งค่า ยอด/ผู้รับ/วันเวลา) ใช้ตัดสินว่าแบนได้ไหม
  readable: boolean;
};
export type SlipCheck = {
  amount: number | null;
  amountOk: boolean;
  receiverOk: boolean;
  timeOk: boolean;
  transferAt: string | null;
  ok: boolean;
  shouldBan?: boolean; // อ่านสลีปได้ แต่ไม่ผ่านทั้ง 3 ข้อพร้อมกัน (ยอดเงินไม่ตรง + ผู้รับไม่ตรง + วันเวลาโอนไม่ตรง)
  banned?: boolean; // ระบบแบนผู้ซื้อไปแล้วจากสลีปใบนี้
  rawText?: string; // ข้อความดิบที่ OCR อ่านได้ ไว้ตรวจปัญหาช่วงทดสอบ
  error?: string | null;
};

// ชื่อผู้รับที่ยอมรับ (แสดงบนสลีปเป็นชื่อบัญชีนี้)
export const RECEIVER_NAME_DEFAULT = "คอมเซเว่น เพื่อการกุศล";

// ชื่อผู้รับอื่นที่ปรากฏบนสลีปของแต่ละธนาคาร (บัญชีเดียวกัน แต่แต่ละธนาคารแสดงชื่อไม่เหมือนกัน)
// รับเสมอ แม้ตั้ง RECEIVER_NAME ใน .env เพิ่มชื่อใหม่ที่ธนาคารอื่นแสดงได้ที่นี่
export const RECEIVER_ALIASES = [
  "บมจ. คอมเซเว่น เพื่อการกุศล", // กสิกรไทย (K+)
  "COM7 FOR CHARITY", // กรุงเทพ (Bualuang mBanking)
  "COM7 PUBLIC COMPANY LIMITED FOR CHARITY",
  "COM7 PUBLIC CO.,LTD. FOR CHARITY",
];

// Biller ID ของผู้รับ (บางธนาคารแสดงเลขนี้ใต้ชื่อ) ใช้ยืนยันผู้รับอีกทาง
export const RECEIVER_BILLER_IDS = ["010753600031508"];

// เวลาโอนต้องไม่เกินกี่นาทีหลังสร้างออเดอร์ (และต้องเป็นวันเดียวกับออเดอร์ตามเวลาไทย)
export const MAX_TRANSFER_DELAY_MIN = 60;

const INIT_WAIT_MS = 40_000; // รอ worker พร้อมได้นานแค่ไหนต่อหนึ่งคำขอ (โหลดภาษาต่อเบื้องหลังได้)
const TOTAL_MS = 55_000; // เวลารวมทั้งคำขอ (รอ worker + อ่านรูป) ต้องน้อยกว่า maxDuration 60 วิ ของ route

// เก็บ worker ไว้ที่ globalThis: ตอน dev โมดูลถูกโหลดใหม่บ่อย (HMR) ถ้าเก็บในตัวแปรโมดูล จะสร้าง worker ซ้อนหลายตัวจนช้า/ค้าง
type OcrState = {
  workerP: Promise<Worker> | null;
  thaiOk: boolean;
  queue: Promise<unknown>;
  warmed: boolean;
};
const g = globalThis as unknown as { __slipOcr?: OcrState };
const S: OcrState = (g.__slipOcr ??= { workerP: null, thaiOk: true, queue: Promise.resolve(), warmed: false });

// ไฟล์ภาษาในโปรเจกต์ (ต้องมีทั้ง tha และ eng) ใช้ไฟล์นี้ก่อน ไม่ต้องโหลดจากอินเทอร์เน็ต
const TESSDATA_DIR = path.join(process.cwd(), "tessdata");
const hasLocalLang = () =>
  ["tha", "eng"].every((l) => fs.existsSync(path.join(TESSDATA_DIR, `${l}.traineddata`)));

async function makeWorker(): Promise<Worker> {
  const local = hasLocalLang();
  console.log(`[OCR] เริ่มเตรียม worker (ไฟล์ภาษา: ${local ? "ในโปรเจกต์ " + TESSDATA_DIR : "โหลดจากเน็ต"})`);
  const t0 = Date.now();
  let lastStatus = "";
  const opts = {
    cachePath: path.join(os.tmpdir(), "tesseract-cache"),
    errorHandler: (e: unknown) => console.error("[OCR] tesseract worker error:", e),
    logger: (m: { status?: string; progress?: number }) => {
      // log เฉพาะตอนสถานะเปลี่ยน (ไม่ log ตอนอ่านรูป) ไว้ดูใน terminal ว่าค้างตรงขั้นไหน
      if (!m.status || m.status === "recognizing text" || m.status === lastStatus) return;
      lastStatus = m.status;
      console.log(`[OCR] ${m.status} (${Math.round((Date.now() - t0) / 1000)}s)`);
    },
    ...(local ? ({ langPath: TESSDATA_DIR, gzip: false, cacheMethod: "none" } as const) : {}),
  };
  try {
    S.thaiOk = true;
    const w = await createWorker(["tha", "eng"], 1, opts);
    console.log(`[OCR] worker พร้อมแล้ว ใช้เวลา ${Math.round((Date.now() - t0) / 1000)} วินาที`);
    return w;
  } catch (e) {
    // โหลดภาษาไทยไม่ได้ ถอยไปใช้อังกฤษอย่างเดียว จะได้ยังอ่านยอดและวันเวลาที่เป็นตัวเลขได้
    console.error("[OCR] โหลดภาษาไทยของ tesseract ไม่ได้ ใช้ eng อย่างเดียว:", e);
    S.thaiOk = false;
    return await createWorker(["eng"], 1, opts);
  }
}

function getWorker() {
  if (!S.workerP) {
    S.workerP = makeWorker().catch((e) => {
      console.error("[OCR] เตรียม worker ไม่สำเร็จ:", e);
      S.workerP = null;
      throw e;
    });
  }
  return S.workerP;
}

// ปิด worker ที่ค้าง แล้วเริ่มใหม่ในคำขอถัดไป
function resetWorker() {
  const p = S.workerP;
  S.workerP = null;
  S.queue = Promise.resolve();
  p?.then((w) => w.terminate()).catch(() => undefined);
}

// เริ่มโหลด worker ตั้งแต่ตอนโหลดโมดูล (ครั้งเดียวต่อโปรเซส) ให้การโหลดภาษาครั้งแรกเกิดเบื้องหลัง ไม่ผูกกับเวลารอของคำขอ
if (!S.warmed) {
  S.warmed = true;
  getWorker().catch(() => undefined);
}

// ให้ OCR ทำทีละใบ กัน worker ตัวเดียวถูกเรียกชนกัน
function recognize(img: Buffer): Promise<string> {
  const job = S.queue.then(async () => {
    const w = await getWorker();
    const { data } = await w.recognize(img);
    return data.text;
  });
  S.queue = job.catch(() => undefined);
  return job;
}

function withTimeout<T>(p: Promise<T>, ms: number, msg: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(msg)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

// ลองเตรียมรูปหลายแบบ เพราะพื้นหลังสลีปแต่ละธนาคารต่างกัน
const PASSES: ((s: Sharp) => Sharp)[] = [
  (s) => s.resize({ width: 1600 }).greyscale().normalise(),
  (s) => s.resize({ width: 2400 }).greyscale().normalise().sharpen(),
  (s) => s.resize({ width: 2000 }).greyscale().normalise().threshold(150),
];

async function readText(buf: Buffer, pass: number) {
  const img = await PASSES[pass](sharp(buf, { failOn: "none" }).rotate()).png().toBuffer();
  return recognize(img);
}

/* ---------- ยอดเงิน ---------- */

// ยอดเงินในสลีปมีทศนิยม 2 ตำแหน่งเสมอ (เช่น 1.00 / 1,000.00) อ่านจากข้อความที่ยังเว้นวรรค/ขึ้นบรรทัดไว้
// ห้ามรวมเป็นบรรทัดเดียวติดกัน: OCR มักมีตัวอักษรขยะ (เช่น "5") อยู่บรรทัดเดียวกับคำว่า Amount ถ้าตัดช่องว่างทิ้งจะกลายเป็น "51.00"
const AMOUNT_RE = /(?<![\d.,])(\d{1,3}(?:,\d{3})+|\d+)\.(\d{2})(?!\d)/g;
const AMOUNT_UNIT_RE = /(?<![\d.,])(\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})? ?(?:บาท|Baht|THB)/gi;

// คืนยอดที่เป็นไปได้ทั้งหมด ให้ checkSlip เทียบกับยอดออเดอร์
function parseAmounts(text: string): number[] {
  const t = text.replace(/[ \t\u00a0]+/g, " ");
  const found: number[] = [];
  const push = (s: string) => {
    const n = Number(s.replace(/,/g, ""));
    if (Number.isFinite(n) && n > 0 && !found.includes(n)) found.push(n);
  };
  for (const m of t.matchAll(AMOUNT_RE)) push(`${m[1]}.${m[2]}`);
  for (const m of t.matchAll(AMOUNT_UNIT_RE)) push(m[1]);
  return found;
}

/* ---------- ผู้รับ (ชื่อบริษัท) ---------- */

// ตัดช่องว่าง วรรณยุกต์ การันต์ และวงเล็บ เพราะ OCR ภาษาไทยมักพลาดตรงนี้
const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[\s()（）.\-_]/g, "")
    .replace(/[่-์]/g, "");

function receiverMatches(flat: string): boolean {
  const text = norm(flat);
  // Biller ID ของผู้รับ (กรุงเทพแสดงใต้ชื่อ)
  if (RECEIVER_BILLER_IDS.some((id) => text.includes(id))) return true;
  const names = [...(process.env.RECEIVER_NAME ?? RECEIVER_NAME_DEFAULT).split(","), ...RECEIVER_ALIASES]
    .map(norm)
    .filter((n) => n.length >= 4);
  if (names.some((n) => text.includes(n))) return true;
  // ถ้าอ่านชื่อเต็มไม่ครบ ยอมรับเมื่อเจอคำหลักของชื่อผู้รับ (ไทย: "คอมเซเวน"+"กุศล" / อังกฤษ: "COM7"+"CHARITY")
  if ((text.includes("คอมเซเวน") && text.includes("กุศล")) || text.includes("คอมเซเวนเพือการกุศล")) return true;
  // สลีปภาษาอังกฤษ: "COM7 FOR CHARITY" / "COM7 PUBLIC CO.,LTD. FOR CHARITY"
  return text.includes("com7") && text.includes("charity");
}

/* ---------- วันเวลาโอน ---------- */

const MONTHS = [
  "ม\\.?ค\\.?|Jan",
  "ก\\.?พ\\.?|Feb",
  "มี\\.?ค\\.?|Mar",
  "เม\\.?ย\\.?|Apr",
  "พ\\.?ค\\.?|May",
  "มิ\\.?ย\\.?|Jun",
  "ก\\.?ค\\.?|Jul",
  "ส\\.?ค\\.?|Aug",
  "ก\\.?ย\\.?|Sep",
  "ต\\.?ค\\.?|Oct",
  "พ\\.?ย\\.?|Nov",
  "ธ\\.?ค\\.?|Dec",
];
const DATE_RE = new RegExp(
  `(\\d{1,2}) ?(${MONTHS.map((m) => `(?:${m})`).join("|")}) ?(\\d{2,4})\\D{0,4}?(\\d{1,2}):(\\d{2})(?: ?([AaPp])\\.?[Mm]\\.?)?`,
  "i",
);
const DATE_NUM_RE = /(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})\D{0,4}?(\d{1,2}):(\d{2})(?: ?([AaPp])\.?[Mm]\.?)?/;

// แปลงเป็น ISO (UTC) โดยตีความเวลาบนสลีปเป็นเวลาไทย (UTC+7)
function toIso(day: number, mi: number, ys: string, thaiYear2: boolean, hh: number, mm: number): string | null {
  let year = Number(ys);
  if (ys.length === 2) year = thaiYear2 ? 2500 + year - 543 : 2000 + year;
  else if (ys.length === 4) year = year > 2400 ? year - 543 : year;
  else return null;
  if (mi < 0 || mi > 11 || day < 1 || day > 31 || hh > 23 || mm > 59) return null;
  const d = new Date(Date.UTC(year, mi, day, hh - 7, mm));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// สลีปภาษาอังกฤษใช้ AM/PM (เช่น 6:09 PM = 18:09)
function to24(hh: number, ap?: string): number {
  if (!ap) return hh;
  const pm = ap.toLowerCase() === "p";
  if (pm && hh < 12) return hh + 12;
  if (!pm && hh === 12) return 0;
  return hh;
}

function parseTransferAt(spaced: string): string | null {
  const m = DATE_RE.exec(spaced);
  if (m) {
    const tok = m[2];
    const mi = MONTHS.findIndex((x) => new RegExp(`^(?:${x})$`, "i").test(tok));
    const iso = toIso(Number(m[1]), mi, m[3], /[ก-๙]/.test(tok), to24(Number(m[4]), m[6]), Number(m[5]));
    if (iso) return iso;
  }
  const n = DATE_NUM_RE.exec(spaced);
  if (n) return toIso(Number(n[1]), Number(n[2]) - 1, n[3], true, to24(Number(n[4]), n[6]), Number(n[5]));
  return null;
}

/* ---------- ใช้งานจริง ---------- */

function analyze(text: string) {
  const flat = text.replace(/\s+/g, "");
  const spaced = text.replace(/(?<=[ก-๙.])\s+(?=[ก-๙.])/g, "").replace(/\s+/g, " ");
  return { amounts: parseAmounts(text), receiverOk: receiverMatches(flat), transferAt: parseTransferAt(spaced) };
}

// ไม่โยน error: อ่านไม่ได้ = ค่าว่าง ให้ admin ตรวจเอง (error เก็บใน out.error)
export async function ocrSlip(buf: Buffer): Promise<SlipOcr> {
  const out: SlipOcr = {
    amount: null,
    amounts: [],
    receiverOk: false,
    transferAt: null,
    rawText: "",
    error: null,
    readable: false,
  };
  const texts: string[] = [];
  const startedAt = Date.now();

  try {
    // รอ worker พร้อมก่อน ถ้ายังโหลดภาษาไม่เสร็จ ปล่อยให้โหลดต่อเบื้องหลัง (ไม่ปิด worker) แล้วให้ลองอัพโหลดใหม่
    await withTimeout(
      getWorker(),
      INIT_WAIT_MS,
      "OCR กำลังเตรียมระบบ (โหลดภาษาครั้งแรก) รอสักครู่แล้วอัพโหลดใหม่",
    );

    const deadline = startedAt + TOTAL_MS;
    for (let i = 0; i < PASSES.length; i++) {
      const left = deadline - Date.now();
      if (left < 3000) break;
      const text = await withTimeout(readText(buf, i), left, "OCR timeout");
      texts.push(text);
      const r = analyze(text);
      for (const a of r.amounts) if (!out.amounts.includes(a)) out.amounts.push(a);
      if (r.receiverOk) out.receiverOk = true;
      if (!out.transferAt) out.transferAt = r.transferAt;
      if (out.amounts.length > 0 && out.receiverOk && out.transferAt) break;
    }
    if (!S.thaiOk) out.error = "โหลดภาษาไทยไม่ได้ อ่านได้เฉพาะตัวเลขและตัวอักษรอังกฤษ";
  } catch (e) {
    out.error = e instanceof Error ? e.message : String(e);
    console.error("[OCR] อ่านสลีปไม่สำเร็จ:", e);
    if (out.error === "OCR timeout") resetWorker(); // worker อาจค้าง เริ่มใหม่ในคำขอถัดไป
  }

  out.amount = out.amounts[0] ?? null;
  out.rawText = texts.join("\n-----\n").slice(0, 1200);
  // อ่านได้จริง = ไม่ error และเจออย่างน้อยหนึ่งค่า (ว่าง/error/timeout = อ่านไม่ได้ ไม่แบน ให้ admin ตรวจ)
  out.readable = !out.error && (out.amounts.length > 0 || out.receiverOk || out.transferAt !== null);
  return out;
}

// วันที่ตามเวลาไทย (YYYY-MM-DD) ของเวลา ms
const thaiDay = (ms: number) => new Date(ms + 7 * 3_600_000).toISOString().slice(0, 10);

// since = เวลาที่สร้างรายการ
// เวลาโอนผ่านเมื่อ: วันเดียวกับออเดอร์ (เวลาไทย) และโอนหลังสร้างออเดอร์ไม่เกิน MAX_TRANSFER_DELAY_MIN นาที (เผื่อนาฬิกาคลาดก่อนสร้าง 2 นาที)
// skipTime = โหมดทดสอบ: ไม่เทียบกับเวลาออเดอร์ และไม่แบน
// แบนอัตโนมัติ: อ่านสลีปได้ และ ยอดเงินไม่ตรง + ผู้รับไม่ตรง + วันเวลาไม่ตรง ครบทั้ง 3 ข้อพร้อมกัน
export function checkSlip(
  o: SlipOcr,
  expect: { amount: number; since: string; skipTime?: boolean },
): SlipCheck {
  const amountOk = o.amounts.some((a) => Math.abs(a - expect.amount) < 0.005);
  const t = o.transferAt ? Date.parse(o.transferAt) : NaN;
  const since = Date.parse(expect.since);
  const notFuture = Number.isFinite(t) && t <= Date.now() + 10 * 60_000;
  const timeOk =
    notFuture &&
    (expect.skipTime === true ||
      (Number.isFinite(since) &&
        thaiDay(t) === thaiDay(since) &&
        t >= since - 2 * 60_000 &&
        t <= since + MAX_TRANSFER_DELAY_MIN * 60_000));
  const ok = amountOk && o.receiverOk && timeOk;
  return {
    amount: amountOk ? expect.amount : o.amount,
    amountOk,
    receiverOk: o.receiverOk,
    timeOk,
    transferAt: o.transferAt,
    ok,
    shouldBan: expect.skipTime !== true && o.readable && !amountOk && !o.receiverOk && !timeOk,
    rawText: o.rawText,
    error: o.error,
  };
}