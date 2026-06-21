# Lotto Record MVP

เว็บแอพสำหรับบันทึกเลขสลาก 6 หลัก ตรวจคำนวณผลรางวัล และสรุปรายงานตามรายชื่อ

> ระบบนี้เป็นเครื่องมือบันทึกและตรวจคำนวณข้อมูลสลากส่วนตัวเท่านั้น ไม่ใช่ระบบจำหน่ายสลาก ไม่ใช่ระบบรับแทง ไม่มีระบบฝากถอนเงิน ไม่มีระบบจ่ายรางวัล และไม่มีการชักชวนให้เล่นพนัน

## สิ่งที่ปรับปรุงล่าสุด

- ปรับ UI ใหม่เป็นโทนเรียบหรูแบบทางการ: น้ำเงินกรมท่า / ขาว / ทองสุภาพ
- เปลี่ยนแนวระบบจาก “อัตราจ่าย/หวย” เป็น “บันทึกและตรวจคำนวณสลากส่วนตัว”
- รองรับการบันทึกเลขสลาก 6 หลัก
- รองรับจำนวนใบและราคา/ใบ
- ตรวจคำนวณรางวัลทางการหลัก:
  - รางวัลที่ 1
  - เลขหน้า 3 ตัว
  - เลขท้าย 3 ตัว
  - เลขท้าย 2 ตัว
- เพิ่มการวางข้อความจาก LINE แล้วตรวจสอบก่อนบันทึก
- เพิ่ม Report แยกตามรายชื่อ
- เพิ่ม Copy / Share LINE / Export CSV
- เพิ่ม PWA manifest สำหรับติดตั้งเป็นเว็บแอพบนมือถือ
- ปรับ Supabase schema ให้เหมาะกับข้อมูลสลาก 6 หลัก

## Tech Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- localStorage สำหรับ MVP
- Supabase-ready schema
- Vercel-ready deployment

## วิธีรันในเครื่อง

```bash
npm install
npm run dev
```

เปิดเว็บที่:

```bash
http://localhost:3000
```

## คำสั่งตรวจ build

```bash
npm run build
```

## วิธี Deploy ไป Vercel

1. เข้า Vercel
2. Import GitHub repo นี้
3. Framework เลือก Next.js
4. กด Deploy

## ต่อ Supabase จริง

1. สร้าง Supabase Project
2. เปิด SQL Editor
3. วางโค้ดจาก `supabase/schema.sql`
4. ตั้งค่า `.env.local` จาก `.env.example`
5. ย้ายข้อมูลจาก localStorage ไปใช้ Supabase client
6. เปิด Row Level Security ก่อนใช้จริง

## Roadmap รอบต่อไป

- Supabase Auth
- LINE Login / LIFF
- บันทึกข้อมูลงวดจริงลงฐานข้อมูล
- Role: admin / staff / viewer
- PDF export
- Audit log สำหรับการแก้ไข/ลบรายการ
- Backup/restore รายงวด

## หมายเหตุด้านความปลอดภัย

- เวอร์ชันนี้เก็บข้อมูลใน browser localStorage เพื่อทดสอบ UX ก่อน
- ห้ามใช้เก็บข้อมูลจริงระยะยาวจนกว่าจะต่อ Supabase และ Row Level Security
- ไม่ควรเพิ่มระบบฝากถอน จ่ายเงิน หรือรับรายการจากบุคคลภายนอกแบบสาธารณะ
- ควรตรวจผลรางวัลจากแหล่งทางการก่อนกดคำนวณทุกครั้ง
