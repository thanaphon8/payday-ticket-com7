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