import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // tesseract.js เปิด worker แยก และ sharp เป็นไลบรารีเนทีฟ ห้ามให้ bundler รวมเข้าไปด้วย
  serverExternalPackages: ["tesseract.js", "sharp"],
  // Vercel: ไฟล์ที่ tesseract.js โหลดตอนรัน (worker, wasm, ไฟล์ภาษา) ไม่ถูกตรวจเจอเองตอน build ต้องสั่งให้แนบไปกับฟังก์ชันสลีป
  // หมายเหตุ: key ห้ามใช้ "[id]" เพราะ [ ] เป็นอักขระพิเศษของ glob ทำให้ไม่ match เส้นทางจริง (ไฟล์เลยไม่ถูกแนบ → Cannot find module '..')
  outputFileTracingIncludes: {
    "/api/payments/**/*": [
      "./tessdata/**/*",
      "./node_modules/tesseract.js/**/*",
      "./node_modules/tesseract.js-core/**/*",
      // ไลบรารีที่ worker ของ tesseract.js ใช้ (worker รันแยกไฟล์ ตัวตรวจเส้นทางไม่เห็นเอง)
      "./node_modules/bmp-js/**/*",
      "./node_modules/idb-keyval/**/*",
      "./node_modules/is-url/**/*",
      "./node_modules/node-fetch/**/*",
      "./node_modules/whatwg-url/**/*",
      "./node_modules/tr46/**/*",
      "./node_modules/webidl-conversions/**/*",
      "./node_modules/regenerator-runtime/**/*",
      "./node_modules/wasm-feature-detect/**/*",
      "./node_modules/zlibjs/**/*",
    ],
  },
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;