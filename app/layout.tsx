import type { Metadata, Viewport } from "next";
import { Prompt } from "next/font/google";
import "./globals.css";

const prompt = Prompt({
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-prompt"
});

export const metadata: Metadata = {
  title: "Lotto Record MVP",
  description: "เว็บแอพบันทึกและตรวจคำนวณข้อมูลสลากส่วนตัว พร้อม Report และแชร์ LINE",
  applicationName: "Lotto Record MVP",
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
