import type { Metadata } from "next";
import { Prompt } from "next/font/google";
import "./globals.css";

const prompt = Prompt({
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-prompt"
});

export const metadata: Metadata = {
  title: "Lotto Record MVP",
  description: "ระบบบันทึกและคำนวณข้อมูลส่วนตัว พร้อมรายงานและแชร์ LINE"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <body className={`${prompt.variable} font-sans`}>{children}</body>
    </html>
  );
}
