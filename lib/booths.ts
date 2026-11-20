// บัญชีสำหรับยิงบาร์โค้ดที่หน้า /ticket: 6 ซุ้ม (ตั๋วเล่นซุ้ม ฿50) + 1 จุดรับตั๋วกระดาษ (staff)
// ตั้ง username / รหัสผ่านใน .env.local ตาม key ของแต่ละบัญชี (รหัสผ่านยาวอย่างน้อย 8 ตัว ไม่ตั้ง = ปิดบัญชีนั้น)
//   BOOTH_1_USER, BOOTH_1_PASSWORD ... BOOTH_6_USER, BOOTH_6_PASSWORD
//   BOOTH_PAPER_USER, BOOTH_PAPER_PASSWORD
// id ใช้เก็บในประวัติสแกน อย่าเปลี่ยนหลังเปิดใช้งานแล้ว (เปลี่ยน name ได้ตลอด)
export type BoothKind = "play" | "paper";
export type Booth = { id: string; key: string; name: string; kind: BoothKind };

export const BOOTHS: readonly Booth[] = [
  { id: "b1", key: "1", name: "ซุ้มปาลูกโป่ง", kind: "play" },
  { id: "b2", key: "2", name: "ซุ้ม 2", kind: "play" }, // TODO: แก้ชื่อซุ้ม
  { id: "b3", key: "3", name: "ซุ้ม 3", kind: "play" }, // TODO: แก้ชื่อซุ้ม
  { id: "b4", key: "4", name: "ซุ้ม 4", kind: "play" }, // TODO: แก้ชื่อซุ้ม
  { id: "b5", key: "5", name: "ซุ้ม 5", kind: "play" }, // TODO: แก้ชื่อซุ้ม
  { id: "b6", key: "6", name: "ซุ้ม 6", kind: "play" }, // TODO: แก้ชื่อซุ้ม
  { id: "paper", key: "PAPER", name: "จุดรับตั๋วกระดาษ", kind: "paper" },
];

export const boothById = (id: string) => BOOTHS.find((b) => b.id === id);

export function boothCreds(b: Booth) {
  return {
    user: process.env[`BOOTH_${b.key}_USER`] ?? "",
    password: process.env[`BOOTH_${b.key}_PASSWORD`] ?? "",
  };
}