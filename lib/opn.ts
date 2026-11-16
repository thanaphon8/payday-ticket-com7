// ตัวเรียก REST API ของ Opn Payments (เดิมชื่อ Omise) ด้วย fetch ไม่ต้องลง package เพิ่ม
// ต้องมี OMISE_SECRET_KEY ใน .env.local (ขึ้นต้นด้วย skey_test_ หรือ skey_)

const API = "https://api.omise.co";
const TIMEOUT_MS = 15_000;

export class OpnError extends Error {
  status: number;
  code: string;
  constructor(message: string, status: number, code = "") {
    super(message);
    this.name = "OpnError";
    this.status = status;
    this.code = code;
  }
}

function authHeader() {
  const key = process.env.OMISE_SECRET_KEY;
  if (!key) throw new Error("ไม่พบ OMISE_SECRET_KEY ใน .env.local");
  if (!key.startsWith("skey_")) throw new Error("OMISE_SECRET_KEY ต้องเป็น secret key (ขึ้นต้นด้วย skey_)");
  return "Basic " + Buffer.from(`${key}:`).toString("base64");
}

async function call<T>(
  path: string,
  method: "GET" | "POST",
  body?: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      method,
      headers: {
        Authorization: authHeader(),
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...extraHeaders,
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    if (e instanceof Error && e.message.includes("OMISE_SECRET_KEY")) throw e;
    throw new OpnError("เชื่อมต่อ Opn ไม่ได้", 0, "network");
  }

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || data.object === "error") {
    throw new OpnError(String(data.message ?? "Opn error"), res.status, String(data.code ?? ""));
  }
  return data as T;
}

/* ---------- ชนิดข้อมูล ---------- */

type RawCharge = {
  id: string;
  status: string;
  amount: number;
  currency: string;
  expires_at?: string | null;
  failure_code?: string | null;
  failure_message?: string | null;
  metadata?: Record<string, unknown>;
  source?: { scannable_code?: { image?: { download_uri?: string } } } | null;
};

export type PromptPayCharge = {
  id: string;
  status: string; // pending | successful | failed | expired | reversed
  amountSatang: number;
  currency: string;
  expiresAt: string | null;
  qrUrl: string | null; // รูป QR (ใช้เป็น src ของ <img> ได้)
  failureMessage: string | null;
  metadata: Record<string, unknown>;
};

function normalize(c: RawCharge): PromptPayCharge {
  return {
    id: c.id,
    status: c.status,
    amountSatang: c.amount,
    currency: c.currency,
    expiresAt: c.expires_at ?? null,
    qrUrl: c.source?.scannable_code?.image?.download_uri ?? null,
    failureMessage: c.failure_message ?? c.failure_code ?? null,
    metadata: c.metadata ?? {},
  };
}

export const isPaid = (c: PromptPayCharge) => c.status === "successful";
export const isDeadCharge = (c: PromptPayCharge) =>
  c.status === "failed" || c.status === "expired" || c.status === "reversed";

/* ---------- เรียกใช้ ---------- */

// สร้าง charge PromptPay (ได้ QR กลับมา)
// idempotencyKey: ส่งซ้ำด้วยคีย์เดิมจะได้ charge เดิม ไม่สร้างซ้ำ (ใช้ id ของรายการชำระเงิน)
export async function createPromptPayCharge(opts: {
  amountBaht: number;
  expiresAt: Date;
  description: string;
  metadata: Record<string, string>;
  idempotencyKey: string;
}): Promise<PromptPayCharge> {
  const raw = await call<RawCharge>(
    "/charges",
    "POST",
    {
      amount: Math.round(opts.amountBaht * 100), // Opn ใช้หน่วยสตางค์
      currency: "thb",
      source: { type: "promptpay" },
      expires_at: opts.expiresAt.toISOString().replace(/\.\d{3}Z$/, "Z"),
      description: opts.description,
      metadata: opts.metadata,
    },
    { "Idempotency-Key": opts.idempotencyKey },
  );
  return normalize(raw);
}

// ดึงสถานะ charge ล่าสุดจาก Opn (ใช้ยืนยันก่อนออกตั๋วเสมอ ไม่เชื่อข้อมูลที่ webhook ส่งมา)
export async function getCharge(id: string): Promise<PromptPayCharge> {
  if (!/^chrg_[A-Za-z0-9_]+$/.test(id)) throw new OpnError("charge id ไม่ถูกต้อง", 400, "bad_id");
  const raw = await call<RawCharge>(`/charges/${id}`, "GET");
  return normalize(raw);
}