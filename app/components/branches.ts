// สาขา (1 สาขา = 1 กลุ่ม เหมือน 1 แผนก) — id เก็บใน DB ห้ามเปลี่ยนเลขเดิม
// province = "จังหวัด/ภาค" (ไม่บังคับ)
// RAW ว่างไว้: วางข้อมูลสาขาเองได้เลย หรือวางทับไฟล์นี้ด้วย branches.ts ตัวอย่าง (API เหมือนกันทุกตัว ใช้ได้ทันที)
import { departmentsOf, getCompany, getDepartment } from "./departments";

export type Branch = { id: number; companyId: number; name: string; province?: string };

// [id, companyId, name, province]
// ตัวอย่าง: [1, 1, "ID 115_Studio 7_Future Park_Rangsit", "ปทุมธานี/ภาคกลาง"],
const RAW: [number, number, string, string?][] = [];

export const BRANCHES: Branch[] = RAW.map(([id, companyId, name, province]) => ({
  id,
  companyId,
  name,
  province,
}));

export const getBranch = (id?: number | null) =>
  BRANCHES.find((b) => b.id === id) ?? null;

export const branchesOf = (companyId?: number | null) =>
  BRANCHES.filter((b) => b.companyId === companyId);

// ชื่อสาขาที่อ่านง่าย: ตัด "ID 115_" ข้างหน้าออก
export const branchLabel = (b: Branch) => b.name.replace(/^\s*ID\s*\d+\s*_\s*/i, "");

// รหัสสาขา เช่น "ID 115_Studio 7_..." → "115" (ไม่มีรหัส = null)
export const branchCode = (b: Branch) =>
  b.name.match(/^\s*ID\s*(\d+)/i)?.[1] ?? null;

// จังหวัด / ภาค ดึงจาก province ("ปทุมธานี/ภาคกลาง") อัตโนมัติ
export const branchProvince = (b: Branch) =>
  b.province?.split("/")[0]?.trim() || null;
export const branchRegion = (b: Branch) =>
  b.province?.split("/")[1]?.trim() || null;

// ชื่อพร้อมรหัสสาขา: "ID 115 · Studio 7_Future Park_Rangsit"
export const branchFullLabel = (b: Branch) => {
  const code = branchCode(b);
  return code ? `ID ${code} · ${branchLabel(b)}` : branchLabel(b);
};

// ตัวช่วยแสดงโปรไฟล์: ส่ง user ที่มี companyId/departmentId/branchId
export function orgOf(u?: {
  companyId?: number | null;
  departmentId?: number | null;
  branchId?: number | null;
} | null) {
  const company = getCompany(u?.companyId);
  const dept = getDepartment(u?.departmentId);
  const branch = getBranch(u?.branchId);
  return {
    company: company?.name ?? null,
    department: dept?.name ?? null,
    branch: branch ? branchLabel(branch) : null,
  };
}

// ตรวจฝั่งเซิร์ฟเวอร์: แผนก/สาขาต้องอยู่ในบริษัทที่เลือก
// สำนักงานใหญ่ = แผนก / หน้าร้าน = สาขา
// บริษัทที่มีทั้งสองแบบ: เลือกอย่างใดอย่างหนึ่งก็พอ
// บริษัทที่มีแค่แผนก บังคับแผนก / มีแค่สาขา บังคับสาขา
export function validateOrg(
  companyId: number,
  departmentId?: number | null,
  branchId?: number | null
): { departmentId?: string; branchId?: string; companyId?: string } {
  const err: { departmentId?: string; branchId?: string; companyId?: string } = {};
  if (!getCompany(companyId)) {
    err.companyId = "เลือกบริษัท";
    return err;
  }
  const hasDepts = departmentsOf(companyId).length > 0;
  const hasBranches = branchesOf(companyId).length > 0;
  if (departmentId && getDepartment(departmentId)?.companyId !== companyId)
    err.departmentId = "แผนกไม่อยู่ในบริษัทที่เลือก";
  if (branchId && getBranch(branchId)?.companyId !== companyId)
    err.branchId = "สาขาไม่อยู่ในบริษัทที่เลือก";
  if (!departmentId && !branchId) {
    if (hasDepts && hasBranches) err.departmentId = "เลือกแผนกหรือสาขาของคุณ";
    else if (hasDepts) err.departmentId = "เลือกแผนกของคุณ";
    else if (hasBranches) err.branchId = "เลือกสาขาของคุณ";
  }
  return err;
}