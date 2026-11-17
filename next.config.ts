import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // tesseract.js เปิด worker แยก และ sharp เป็นไลบรารีเนทีฟ ห้ามให้ bundler รวมเข้าไปด้วย
  serverExternalPackages: ["tesseract.js", "sharp"],
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