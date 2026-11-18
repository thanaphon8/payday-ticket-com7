import { MongoClient, type Db } from "mongodb";

const DB_NAME = "payday";

// เก็บ client ไว้ใน globalThis กันต่อ DB ซ้ำตอน hot reload (dev) / หลาย request
const g = globalThis as unknown as {
  _paydayMongo?: Promise<MongoClient>;
  _paydayIndexes?: Promise<void>;
};

export async function getDb(): Promise<Db> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("ไม่พบ MONGODB_URI ใน .env.local");

  if (!g._paydayMongo) {
    g._paydayMongo = new MongoClient(uri).connect().catch((e) => {
      g._paydayMongo = undefined; // ต่อไม่ได้ ให้ลองใหม่ request ถัดไป
      throw e;
    });
  }
  const db = (await g._paydayMongo).db(DB_NAME);

  if (!g._paydayIndexes) {
    g._paydayIndexes = Promise.all([
      db.collection("users").createIndex({ usernameLower: 1 }, { unique: true }),
      db.collection("orders").createIndex({ code: 1 }, { unique: true }),
      db.collection("orders").createIndex({ userId: 1, at: -1 }),
      db.collection("orders").createIndex({ paymentId: 1 }),
      // รายการโอนเงิน: ของตัวเอง / หน้า admin กรองตามสถานะ / รหัสอ้างอิง (Ref1) ไม่ซ้ำ
      db.collection("payments").createIndex({ userId: 1, createdAt: -1 }),
      db.collection("payments").createIndex({ status: 1, createdAt: -1 }),
      db
        .collection("payments")
        .createIndex({ ref: 1 }, { unique: true, partialFilterExpression: { ref: { $type: "string" } } }),
      // สลีป: key = ธนาคาร-transRef ซ้ำไม่ได้ (กันใช้สลีปใบเดิมซ้ำ)
      db.collection("slips").createIndex({ key: 1 }, { unique: true }),
      db.collection("slips").createIndex({ paymentId: 1 }),
      // ประวัติการสแกนตั๋วเข้างาน: หน้า admin เรียงตามเวลา / ค้นตามรหัสตั๋ว
      db.collection("scans").createIndex({ at: -1 }),
      db.collection("scans").createIndex({ code: 1 }),
      // ตั๋ว 1 ใบ สแกนสำเร็จ (result = "ok") ได้ครั้งเดียวเท่านั้น กันยิงซ้ำระดับฐานข้อมูล
      db
        .collection("scans")
        .createIndex({ code: 1 }, { unique: true, partialFilterExpression: { result: "ok" }, name: "code_ok_once" }),
    ])
      .then(() => undefined)
      .catch((e) => {
        g._paydayIndexes = undefined;
        throw e;
      });
  }
  await g._paydayIndexes;
  return db;
}