import type { Db } from "mongodb";

// เก็บรูปสลีปและรูปโปรไฟล์ลง Google Drive ผ่าน Google Apps Script (apps-script/Code.gs)
// สลีป = โฟลเดอร์หลัก / รูปโปรไฟล์ = โฟลเดอร์ย่อย profile (สคริปต์สร้างให้เอง)
// สคริปต์รันเป็นบัญชีของคุณ ไฟล์จึงอยู่ใน Drive ของคุณ ไม่ต้องใช้ OAuth / googleapis
// ต้องตั้ง GAS_URL (ลงท้าย /exec) และ GAS_SECRET (ตรงกับ SECRET ในสคริปต์) ใน .env.local

type GasReply = { ok: boolean; error?: string; fileId?: string; data?: string; mimeType?: string };

async function callGas(payload: Record<string, unknown>): Promise<GasReply> {
  const url = process.env.GAS_URL;
  const secret = process.env.GAS_SECRET;
  if (!url || !secret) throw new Error("ตั้งค่า GAS_URL / GAS_SECRET ใน .env.local ไม่ครบ");

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ secret, ...payload }),
    redirect: "follow", // Apps Script ตอบกลับผ่าน redirect
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });

  const text = await res.text();
  let reply: GasReply;
  try {
    reply = JSON.parse(text) as GasReply;
  } catch {
    // ได้ HTML กลับมา = deploy ไม่ได้ตั้ง "Anyone" หรือ URL ผิด
    throw new Error(`Apps Script ตอบกลับไม่ใช่ JSON (HTTP ${res.status}) เช็ก GAS_URL และสิทธิ์ Who has access = Anyone`);
  }
  if (!reply.ok) throw new Error(`Apps Script: ${reply.error ?? "unknown error"}`);
  return reply;
}

// อัปโหลดรูป (jpg) ลงโฟลเดอร์ payday-slips ใน Drive → คืน fileId
// พารามิเตอร์ db คงไว้ให้ตรงกับที่ route เรียกอยู่ ไม่ได้ใช้แล้ว
export async function uploadSlip(_db: Db, name: string, jpg: Buffer): Promise<string> {
  const r = await callGas({
    action: "upload",
    name,
    mimeType: "image/jpeg",
    data: jpg.toString("base64"),
  });
  if (!r.fileId) throw new Error("Apps Script ไม่ส่ง fileId กลับมา");
  return r.fileId;
}

// ดึงรูปสลีปจาก Drive ตาม fileId
export async function downloadSlip(fileId: string): Promise<Buffer> {
  const r = await callGas({ action: "download", fileId });
  if (!r.data) throw new Error("Apps Script ไม่ส่งข้อมูลรูปกลับมา");
  return Buffer.from(r.data, "base64");
}

/* ---------- รูปโปรไฟล์ (โฟลเดอร์ย่อย profile) ---------- */

// อัปโหลดรูปโปรไฟล์ (jpg) → คืน fileId
export async function uploadAvatar(name: string, jpg: Buffer): Promise<string> {
  const r = await callGas({
    action: "upload",
    folder: "profile",
    name,
    mimeType: "image/jpeg",
    data: jpg.toString("base64"),
  });
  if (!r.fileId) throw new Error("Apps Script ไม่ส่ง fileId กลับมา");
  return r.fileId;
}

// ดึงรูปโปรไฟล์จากโฟลเดอร์ profile ตาม fileId
export async function downloadAvatar(fileId: string): Promise<Buffer> {
  const r = await callGas({ action: "download", folder: "profile", fileId });
  if (!r.data) throw new Error("Apps Script ไม่ส่งข้อมูลรูปกลับมา");
  return Buffer.from(r.data, "base64");
}

// ลบรูปโปรไฟล์ (ย้ายลงถังขยะใน Drive)
export async function deleteAvatar(fileId: string): Promise<void> {
  await callGas({ action: "delete", folder: "profile", fileId });
}