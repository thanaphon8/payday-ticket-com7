import os from "os";
import path from "path";
import sharp, { type Sharp } from "sharp";
import { createWorker, type Worker } from "tesseract.js";

// ต้องทำก่อนใช้:
//  1) npm i tesseract.js
//  2) สร้าง next.config.ts ที่มี serverExternalPackages: ["tesseract.js", "sharp"] แล้วรีสตาร์ท dev server
//  3) ครั้งแรก tesseract.js โหลดไฟล์ภาษา tha/eng จากอินเทอร์เน็ต (ใหญ่ ใช้เวลานาน)
//     โหลดเสร็จจะเก็บไว้ในโฟลเดอร์ชั่วคราวของเครื่อง ครั้งถัดไปเร็วขึ้นมาก
//  4) (ไม่บังคับ) .env: RECEIVER_NAME=ชื่อผู้รับ ถ้าไม่ตั้ง ใช้ "บริษัท คอมเซเว่น จำกัด (มหาชน)"
//     ตั้งหลายชื่อได้ คั่นด้วย , (ใช้เมื่อชื่อผู้รับเปลี่ยน)

export type SlipOcr = {
  amount: number | null;
  amounts: number[];
  receiverOk: boolean;
  transferAt: string | null;
  rawText: string;
  error: string | null;
};
export type SlipCheck = {
  amount: number | null;
  amountOk: boolean;
  receiverOk: boolean;
  timeOk: boolean;
  transferAt: string | null;
  ok: boolean;
  rawText?: string; // ข้อความดิบที่ OCR อ่านได้ ไว้ตรวจปัญหาช่วงทดสอบ
  error?: string | null;
};

// ชื่อผู้รับที่ยอมรับ (บิลของร้านจะแสดงเป็นชื่อบริษัทนี้บนสลีป)
export const RECEIVER_NAME_DEFAULT = "บริษัท คอมเซเว่น จำกัด (มหาชน)";

const INIT_WAIT_MS = 25_000; // รอ worker พร้อมได้นานแค่ไหนต่อหนึ่งคำขอ (โหลดภาษาต่อเบื้องหลังได้)
const OCR_WAIT_MS = 30_000; // เวลารวมสำหรับอ่านรูปหลังจาก worker พร้อมแล้ว

let workerP: Promise<Worker> | null = null;
let thaiOk = true;
let queue: Promise<unknown> = Promise.resolve();

async function makeWorker(): Promise<Worker> {
  const opts = {
    cachePath: path.join(os.tmpdir(), "tesseract-cache"),
    errorHandler: (e: unknown) => console.error("tesseract worker error:", e),
  };
  try {
    thaiOk = true;
    return await createWorker(["tha", "eng"], 1, opts);
  } catch (e) {
    // โหลดภาษาไทยไม่ได้ ถอยไปใช้อังกฤษอย่างเดียว จะได้ยังอ่านยอดและวันเวลาที่เป็นตัวเลขได้
    console.error("โหลดภาษาไทยของ tesseract ไม่ได้ ใช้ eng อย่างเดียว:", e);
    thaiOk = false;
    return await createWorker(["eng"], 1, opts);
  }
}

function getWorker() {
  if (!workerP) {
    workerP = makeWorker().catch((e) => {
      workerP = null;
      throw e;
    });
  }
  return workerP;
}

// ปิด worker ที่ค้าง แล้วเริ่มใหม่ในคำขอถัดไป
function resetWorker() {
  const p = workerP;
  workerP = null;
  queue = Promise.resolve();
  p?.then((w) => w.terminate()).catch(() => undefined);
}

// เริ่มโหลด worker ตั้งแต่ตอนโหลดโมดูล ให้การโหลดภาษาครั้งแรกเกิดเบื้องหลัง ไม่ผูกกับเวลารอของคำขอ
getWorker().catch((e) => console.error("เตรียม OCR ไม่สำเร็จ:", e));

// ให้ OCR ทำทีละใบ กัน worker ตัวเดียวถูกเรียกชนกัน
function recognize(img: Buffer): Promise<string> {
  const job = queue.then(async () => {
    const w = await getWorker();
    const { data } = await w.recognize(img);
    return data.text;
  });
  queue = job.catch(() => undefined);
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

const NUM = "([0-9][0-9,]*(?:\\.[0-9]{1,2})?)";

// คืนยอดที่เป็นไปได้ทั้งหมด (ยอดที่มีป้าย "จำนวน" มาก่อน) ให้ checkSlip เทียบกับยอดออเดอร์
function parseAmounts(flat: string): number[] {
  const found: number[] = [];
  const push = (s: string) => {
    const n = Number(s.replace(/,/g, ""));
    if (Number.isFinite(n) && n > 0 && !found.includes(n)) found.push(n);
  };
  for (const m of flat.matchAll(new RegExp(`(?:จำนวนเงิน|จำนวน|Amount)[:：]?฿?${NUM}`, "gi"))) push(m[1]);
  for (const m of flat.matchAll(new RegExp(`${NUM}(?:บาท|THB)`, "gi"))) push(m[1]);
  for (const m of flat.matchAll(/(?<![\d.])(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2}(?!\d)/g)) push(m[0]);
  return found;
}

/* ---------- ผู้รับ (ชื่อบริษัท) ---------- */

// ตัดช่องว่าง วรรณยุกต์ การันต์ และวงเล็บ เพราะ OCR ภาษาไทยมักพลาดตรงนี้
const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[\s()（）.\-_]/g, "")
    .replace(/[\u0E48-\u0E4C]/g, "");

function receiverMatches(flat: string): boolean {
  const text = norm(flat);
  const names = (process.env.RECEIVER_NAME ?? RECEIVER_NAME_DEFAULT)
    .split(",")
    .map(norm)
    .filter((n) => n.length >= 4);
  if (names.some((n) => text.includes(n))) return true;
  // ถ้าอ่านชื่อเต็มไม่ครบ ยอมรับเมื่อเจอคำหลักของชื่อบริษัท
  return text.includes("คอมเซเวน") || text.includes("เซเวนจำกัด") || text.includes("comseven");
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
  `(\\d{1,2}) ?(${MONTHS.map((m) => `(?:${m})`).join("|")}) ?(\\d{2,4})\\D{0,4}?(\\d{1,2}):(\\d{2})`,
  "i",
);
const DATE_NUM_RE = /(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})\D{0,4}?(\d{1,2}):(\d{2})/;

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

function parseTransferAt(spaced: string): string | null {
  const m = DATE_RE.exec(spaced);
  if (m) {
    const tok = m[2];
    const mi = MONTHS.findIndex((x) => new RegExp(`^(?:${x})$`, "i").test(tok));
    const iso = toIso(Number(m[1]), mi, m[3], /[ก-๙]/.test(tok), Number(m[4]), Number(m[5]));
    if (iso) return iso;
  }
  const n = DATE_NUM_RE.exec(spaced);
  if (n) return toIso(Number(n[1]), Number(n[2]) - 1, n[3], true, Number(n[4]), Number(n[5]));
  return null;
}

/* ---------- ใช้งานจริง ---------- */

function analyze(text: string) {
  const flat = text.replace(/\s+/g, "");
  const spaced = text.replace(/(?<=[ก-๙.])\s+(?=[ก-๙.])/g, "").replace(/\s+/g, " ");
  return { amounts: parseAmounts(flat), receiverOk: receiverMatches(flat), transferAt: parseTransferAt(spaced) };
}

// ไม่โยน error: อ่านไม่ได้ = ค่าว่าง ให้ admin ตรวจเอง (error เก็บใน out.error)
export async function ocrSlip(buf: Buffer): Promise<SlipOcr> {
  const out: SlipOcr = { amount: null, amounts: [], receiverOk: false, transferAt: null, rawText: "", error: null };
  const texts: string[] = [];

  try {
    // รอ worker พร้อมก่อน ถ้ายังโหลดภาษาไม่เสร็จ ปล่อยให้โหลดต่อเบื้องหลัง แล้วให้ลองอัพโหลดใหม่
    await withTimeout(getWorker(), INIT_WAIT_MS, "OCR กำลังเตรียมระบบ (โหลดภาษาครั้งแรก) รอสักครู่แล้วอัพโหลดใหม่");

    const deadline = Date.now() + OCR_WAIT_MS;
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
    if (!thaiOk) out.error = "โหลดภาษาไทยไม่ได้ อ่านได้เฉพาะตัวเลขและตัวอักษรอังกฤษ";
  } catch (e) {
    out.error = e instanceof Error ? e.message : String(e);
    console.error("OCR สลีปไม่สำเร็จ:", e);
    if (out.error === "OCR timeout") resetWorker(); // worker อาจค้าง เริ่มใหม่ในคำขอถัดไป
  }

  out.amount = out.amounts[0] ?? null;
  out.rawText = texts.join("\n-----\n").slice(0, 1200);
  return out;
}

// since = เวลาที่สร้างรายการ (สลีปต้องโอนหลังจากนี้)
export function checkSlip(o: SlipOcr, expect: { amount: number; since: string }): SlipCheck {
  const amountOk = o.amounts.some((a) => Math.abs(a - expect.amount) < 0.005);
  const t = o.transferAt ? Date.parse(o.transferAt) : NaN;
  const since = Date.parse(expect.since);
  const timeOk =
    Number.isFinite(t) && Number.isFinite(since) && t >= since - 2 * 60_000 && t <= Date.now() + 10 * 60_000;
  return {
    amount: amountOk ? expect.amount : o.amount,
    amountOk,
    receiverOk: o.receiverOk,
    timeOk,
    transferAt: o.transferAt,
    ok: amountOk && o.receiverOk && timeOk,
    rawText: o.rawText,
    error: o.error,
  };
}