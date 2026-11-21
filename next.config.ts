import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // tesseract.js เปิด worker แยก และ sharp เป็นไลบรารีเนทีฟ ห้ามให้ bundler รวมเข้าไปด้วย
  serverExternalPackages: ["tesseract.js", "sharp"],
  // Vercel: ไฟล์ที่ tesseract.js โหลดตอนรัน (worker, wasm, ไฟล์ภาษา) ไม่ถูกตรวจเจอเองตอน build ต้องสั่งให้แนบไปกับฟังก์ชันสลีป
  outputFileTracingIncludes: {
    "/api/payments/[id]/slip": [
      "./tessdata/**/*",
      "./node_modules/tesseract.js/**/*",
      "./node_modules/tesseract.js-core/**/*",
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