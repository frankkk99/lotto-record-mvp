# Lotto Record MVP

เว็บแอปสำหรับบันทึกและคำนวณข้อมูลรายงวด พร้อม Report และแชร์สรุปไป LINE

> ระบบนี้เป็นเครื่องมือบันทึกและคำนวณข้อมูลส่วนตัวเท่านั้น ไม่มีระบบรับซื้อ-ขายสลาก ไม่มีระบบรับแทง ไม่มีระบบฝากถอนเงิน ไม่มีระบบจ่ายรางวัล และไม่มีการชักชวนให้เล่นพนัน

## MVP ที่ทำแล้ว

- Login แบบง่ายด้วยชื่อผู้ใช้งาน
- เลือกงวดวันที่
- เพิ่มรายการแบบเร็ว: ชื่อ, เลข, ประเภท, จำนวนเงิน, อัตราจ่าย, หมายเหตุ
- รายการล่าสุด
- Report ตามรายชื่อ
- คำนวณผลหลังออกผล
- Copy summary และ Web Share สำหรับส่งต่อไป LINE
- Supabase schema สำหรับต่อยอดระบบจริง

## Tech Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Supabase-ready schema

## วิธีรันในเครื่อง

```bash
npm install
npm run dev
```

เปิดเว็บที่:

```bash
http://localhost:3000
```

## วิธีอัปขึ้น GitHub

สร้าง repo เปล่าบน GitHub เช่น `lotto-record-mvp` แล้วรัน:

```bash
git init
git add .
git commit -m "Initial Lotto Record MVP"
git branch -M main
git remote add origin https://github.com/frankkk99/lotto-record-mvp.git
git push -u origin main
```

## วิธี Deploy ไป Vercel

1. เข้า Vercel
2. Import GitHub repo
3. Framework เลือก Next.js
4. กด Deploy

## ต่อ Supabase จริง

1. สร้าง Supabase Project
2. เปิด SQL Editor
3. วางโค้ดจาก `supabase/schema.sql`
4. ตั้งค่า `.env.local` จาก `.env.example`
5. เปลี่ยน logic จาก localStorage ไป Supabase client

## ต่อ LINE OA / LIFF ต่อไป

ฟีเจอร์ที่ควรเพิ่มในรอบถัดไป:

- LINE Login
- LIFF เปิดหน้า Add Entry ใน LINE
- shareTargetPicker สำหรับแชร์เข้าแชต/กลุ่ม
- Messaging API Webhook `/api/line/webhook`
- Rich Menu: เพิ่มรายการ, Report, คำนวณผล, ประวัติ

## หมายเหตุด้านความปลอดภัย

- เวอร์ชันนี้เก็บข้อมูลใน browser localStorage เพื่อทดสอบ UX ก่อน
- ห้ามใช้เก็บข้อมูลจริงระยะยาวจนกว่าจะต่อ Supabase และ Row Level Security
- ไม่ควรเพิ่มระบบฝากถอน จ่ายเงิน หรือรับรายการจากบุคคลภายนอกแบบสาธารณะ
