import type { Metadata, Viewport } from "next";
import { Prompt } from "next/font/google";
import "./globals.css";

const prompt = Prompt({
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-prompt"
});

export const metadata: Metadata = {
  title: "ระบบจดเลขเร็ว",
  description: "เว็บแอพบันทึกเลขส่วนตัวสำหรับหน้างาน ปุ่มใหญ่ จดเร็ว สรุปยอดง่าย และไม่มีระบบรับเงินออนไลน์",
  applicationName: "ระบบจดเลขเร็ว",
  manifest: "/manifest.webmanifest"
};

export const viewport: Viewport = {
  themeColor: "#0b2e59",
  width: "device-width",
  initialScale: 1
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <body className={`${prompt.variable} font-sans`}>{children}</body>
    </html>
  );
}
