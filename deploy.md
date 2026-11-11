# คู่มือการ Deploy ระบบ Work-Planner ขึ้น Vercel และ Prisma Postgres (prisma.io)

เอกสารนี้สรุปขั้นตอนการนำระบบ **Work-Planner** ขึ้นใช้งานจริง (Production) บน **Vercel** โดยใช้ฐานข้อมูล **Prisma Postgres** จาก **prisma.io**

---

## สารบัญ
1. [ขั้นตอนที่ 1: สร้างฐานข้อมูลบน Prisma Postgres (prisma.io)](#ขั้นตอนที่-1-สร้างฐานข้อมูลบน-prisma-postgres-prismaio)
2. [ขั้นตอนที่ 2: Push โครงสร้างตารางและซิงค์ข้อมูลขึ้น Cloud Database](#ขั้นตอนที่-2-push-โครงสร้างตารางและซิงค์ข้อมูลขึ้น-cloud-database)
3. [ขั้นตอนที่ 3: Push โค้ดขึ้น GitHub](#ขั้นตอนที่-3-push-โค้ดขึ้น-github)
4. [ขั้นตอนที่ 4: เชื่อมต่อและ Deploy บน Vercel](#ขั้นตอนที่-4-เชื่อมต่อและ-deploy-บน-vercel)
5. [การตั้งค่า Environment Variables](#การตั้งค่า-environment-variables)
6. [คำถามที่พบบ่อย (Troubleshooting)](#คำถามที่พบบ่อย-troubleshooting)

---

## ขั้นตอนที่ 1: สร้างฐานข้อมูลบน Prisma Postgres (prisma.io)

1. เข้าไปที่ [console.prisma.io](https://console.prisma.io) แล้วลงชื่อเข้าใช้ด้วย GitHub หรือ Google
2. คลิกปุ่ม **"New Project"**
3. เลือก **Prisma Postgres** (Serverless PostgreSQL ฟรี)
4. ตั้งชื่อโปรเจกต์ เช่น `work-planner-db`
5. เลือก Region ที่ใกล้ที่สุด เช่น `Singapore (ap-southeast-1)`
6. เมื่อสร้างเสร็จ ระบบจะแสดง **Database Connection String** เช่น:
   ```env
   DATABASE_URL="prisma+postgres://accelerate.prisma-data.net/?api_key=your_api_key_here"
   ```
   *(หรือ URL มาตรฐาน `postgresql://...`)* ให้คัดลอก (Copy) ค่านี้ไว้

---

## ขั้นตอนที่ 2: Push โครงสร้างตารางและซิงค์ข้อมูลขึ้น Cloud Database

ก่อนที่จะ deploy ขึ้น Vercel ให้รันคำสั่งเหล่านี้จาก Terminal ในโฟลเดอร์โปรเจกต์ เพื่อสร้าง schema และย้ายข้อมูลพนักงาน/ตารางงานเดิมจาก `data/local-store.json` ไปยัง Cloud DB:

```bash
# 1. สร้างตารางฐานข้อมูลทั้งหมดตาม schema.prisma ขึ้นบน prisma.io
DATABASE_URL="<ใส่ connection string ที่ได้จาก prisma.io>" npm run db:push

# 2. นำเข้าข้อมูลเดิม (พนักงาน, ทีม, กะ, แผน Master-plan) จาก local-store.json ขึ้นสู่ Cloud DB
DATABASE_URL="<ใส่ connection string ที่ได้จาก prisma.io>" npm run db:seed
```

> **หมายเหตุ:** สคริปต์ `db:seed` ถูกตั้งค่าให้อ่านข้อมูลล่าสุดจาก `data/local-store.json` อัตโนมัติ ทำให้ข้อมูลพนักงานและตารางกะที่เคยตั้งค่าไว้ไม่สูญหาย

---

## ขั้นตอนที่ 3: Push โค้ดขึ้น GitHub

```bash
git add .
git commit -m "feat: configure production deployment for vercel and prisma postgres"
git push origin main
```

---

## ขั้นตอนที่ 4: เชื่อมต่อและ Deploy บน Vercel

1. เข้าไปที่ [vercel.com](https://vercel.com) แล้วลงชื่อเข้าใช้
2. คลิก **"Add New..."** ➔ เลือก **"Project"**
3. ค้นหาและเลือก Repository `work-planner` จาก GitHub แล้วคลิก **"Import"**
4. ในหน้าการตั้งค่าโปรเจกต์ ให้ไปที่ส่วน **Environment Variables** แล้วเพิ่มตัวแปรดังนี้:

| Key | ค่าตัวอย่าง / คำอธิบาย |
|---|---|
| `DATABASE_URL` | Connection string ที่ได้จาก prisma.io (จากขั้นตอนที่ 1) |
| `ADMIN_USER` | ชื่อบัญชี Admin สำหรับจัดตาราง (เช่น `admin`) |
| `ADMIN_PASS` | รหัสผ่าน Admin (เช่น `your-secure-password`) |
| `SESSION_SECRET` | ข้อความสุ่มสำหรับเข้ารหัส session cookie (เช่น สุ่มความยาว 32 ตัวอักษร) |

5. คลิกปุ่ม **"Deploy"**
6. รอ Vercel ดำเนินการ Build ประมาณ 1–2 นาที เมื่อเสร็จเรียบร้อยจะได้รับ URL สำหรับเข้าใช้งานระบบทันที (เช่น `https://work-planner-xxx.vercel.app`)

---

## การตั้งค่า Environment Variables

คุณสามารถอัปเดตค่าตัวแปรได้ตลอดเวลาที่ **Vercel Dashboard ➔ Settings ➔ Environment Variables**:

```env
# URL ฐานข้อมูล Prisma Postgres
DATABASE_URL="prisma+postgres://accelerate.prisma-data.net/?api_key=..."

# ข้อมูลเข้าสู่ระบบผู้ดูแล (Admin)
ADMIN_USER="admin"
ADMIN_PASS="studio-admin-2026"

# คีย์สุ่มสำหรับ Sign Cookie Session
SESSION_SECRET="c8f1e29a0b3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f"
```

---

## สิ่งที่ระบบเตรียมพร้อมไว้แล้วสำหรับ Vercel

- **Auto Prisma Client Generation**: ใน `package.json` มี `"postinstall": "prisma generate"` และ `"build": "prisma generate && next build"` ทำให้ Vercel สร้าง client bindings อัตโนมัติทุกครั้งที่ build
- **Serverless-Safe Database Connection**: ใน `src/lib/db.ts` มีระบบ Prisma Client Singleton ที่จัดการ Connection Pooling อัตโนมัติ ไม่เปลือง connection ของฐานข้อมูล
- **Read-Only Filesystem Safe**: ป้องกันข้อผิดพลาด `EROFS` บน Vercel Serverless อย่างสมบูรณ์ โดยจะเขียนลง Postgres ทันทีเมื่อมี `DATABASE_URL`

---

## คำถามที่พบบ่อย (Troubleshooting)

- **Q: เข้าเว็บแล้วข้อมูลไม่แสดงหรือขึ้นหน้าว่างเปล่า?**  
  **A:** ตรวจสอบว่าได้รัน `npm run db:push` และ `npm run db:seed` ในขั้นตอนที่ 2 แล้วหรือยัง และตรวจสอบค่า `DATABASE_URL` ใน Vercel Environment Variables ว่าถูกต้องครบถ้วน

- **Q: ล็อกอิน Admin บน Vercel ไม่ผ่าน?**  
  **A:** ตรวจสอบว่าตัวแปร `ADMIN_USER` และ `ADMIN_PASS` ใน Vercel ตรงกับที่พิมพ์ตอนล็อกอินหรือไม่ (ถ้าไม่ได้กำหนดไว้ ค่าเริ่มต้นคือ `admin` / `studio-admin-2026`)

