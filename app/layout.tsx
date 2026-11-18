import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Payday Park",
  description: "ความสนุกรอบใหม่ ทุกวันเงินออก",
};

// สีแถบเบราว์เซอร์/ขอบตอนปัดเด้งบนมือถือ = ดำเดียวกับแอป
// ปิดการซูม (ล็อกสเกล 1 เท่า)
export const viewport: Viewport = {
  themeColor: "#141414",
  colorScheme: "dark",
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="th"
      className={`${geistSans.variable} ${geistMono.variable} h-full bg-[#141414] antialiased`}
    >
      <body className="flex min-h-full flex-col bg-[#141414] text-white">{children}</body>
    </html>
  );
}