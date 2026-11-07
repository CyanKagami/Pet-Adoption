# 🐾 Pet Adoption Platform

ระบบแพลตฟอร์มค้นหาและรับเลี้ยงสัตว์เลี้ยง (Full-Stack Monorepo Project)

---

## 🛠 Tech Stack

### 🎨 Frontend
* **Framework:** Next.js (App Router) + TypeScript
* **Styling:** Tailwind CSS + shadcn/ui
* **Data Fetching:** TanStack Query (React Query)
* **Form & Validation:** React Hook Form + Zod
* **Icons:** Lucide React

### ⚙️ Backend
* **Runtime & Framework:** Node.js + Express.js (TypeScript)
* **API Pattern:** REST API (Swagger / OpenAPI Documentation)
* **Validation:** Zod
* **ORM:** Prisma ORM
* **Authentication:** JWT (JSON Web Tokens)

### 🗄️ Database
* **Database:** PostgreSQL

### 🐳 DevOps & Infrastructure
* **Containerization:** Docker & Docker Compose

---

## 📁 Project Directory Structure

```text
pet-adoption-platform/
├── docker-compose.yml           # Docker Compose file สำหรับรันทุก Services
├── README.md                    # คู่มือการติดตั้งและใช้งานโปรเจกต์
├── .env.example                 # ตัวอย่างไฟล์ Environment Variables
│
├── backend/                     # Express.js + TypeScript Application
│   ├── dockerfile               # Dockerfile สำหรับ Backend
│   ├── package.json
│   ├── tsconfig.json
│   ├── prisma/
│   │   └── schema.prisma        # Database Schema Definition & Migrations
│   └── src/
│       ├── config/              # Database connection, env configs
│       ├── controllers/         # Request Handler Controllers
│       ├── middlewares/         # Auth, Error Handler, Zod Validation
│       ├── routes/              # API Route Handlers (Express Router)
│       ├── services/            # Business Logic Layer
│       ├── utils/               # Helper functions (JWT, Password Hash)
│       ├── validations/         # Zod Request Schemas
│       └── app.ts               # Express Entrypoint
│
└── frontend/                    # Next.js (App Router) Application
    ├── dockerfile               # Dockerfile สำหรับ Frontend
    ├── package.json
    ├── tsconfig.json
    ├── tailwind.config.ts
    └── src/
        ├── app/                 # Next.js App Router (Pages, Layouts, APIs)
        │   ├── (auth)/          # Auth Pages (Login, Register)
        │   ├── pets/            # Pet Listings & Details Pages
        │   ├── dashboard/       # User & Pet Owner Dashboard
        │   └── layout.tsx
        ├── components/          # UI Components
        │   ├── ui/              # shadcn/ui Reusable Components
        │   └── shared/          # Header, Navbar, Footer, Cards
        ├── hooks/               # Custom React Hooks & TanStack Query Hooks
        ├── lib/                 # Axios instance, Utils
        ├── services/            # API Call Functions
        ├── types/               # TypeScript Interfaces/Types
        └── validators/          # Zod Form Validation Schemas
```

---

## 🚀 Step-by-Step Setup & Development Guide

### 📋 Prerequisites
* [Node.js](https://nodejs.org/) (v18 ขึ้นไป)
* [Docker Desktop](https://www.docker.com/products/docker-desktop/) และ Docker Compose
* [Git](https://git-scm.com/)

---

### 1. 📥 Clone & Environment Setup

```bash
# Clone Repository
git clone https://github.com/your-repo/pet-adoption-platform.git
cd pet-adoption-platform

# สร้างไฟล์ .env
cp .env.example .env
```

---

### 2. 🐳 Option A: รันด้วย Docker Compose (แนะนำสำหรับ Development แบบรวมทุกอย่าง)

คำสั่งเดียวสำหรับสั่งให้ Docker ทำการ Build และ Start ทุก Container (PostgreSQL, Redis, Backend, Frontend):

```bash
# สั่ง Run Services ทั้งหมดแบบ Background Mode
docker-compose up -d --build

# ดู Log ของบริการทั้งหมด
docker-compose logs -f

# หยุดการทำงานของ Services ทั้งหมด
docker-compose down
```

เมื่อรันเสร็จเรียบร้อย จะสามารถเข้าใช้งานบริการต่างๆ ได้ดังนี้:
* 🌐 **Frontend (Next.js):** `http://localhost:3000`
* 🔌 **Backend API (Express):** `http://localhost:5000/api/v1`
* 📑 **Swagger API Docs:** `http://localhost:5000/docs`
* 🗄️ **PostgreSQL Database:** `localhost:5432`

---

### 3. 💻 Option B: รันแบบ Local Development (กรณีต้องการแก้ไข Code สด)

#### ขั้นตอนที่ 1: รันเฉพาะ Database & Redis ด้วย Docker
```bash
docker-compose up -d postgres redis
```

#### ขั้นตอนที่ 2: ติดตั้ง Dependencies และ Migration ฝั่ง Backend
```bash
cd backend

# ติดตั้ง Dependencies
npm install

# รัน Prisma Migration สร้าง Table ใน Database
npx prisma migrate dev --name init

# รัน Backend Server (Dev Mode)
npm run dev
```

#### ขั้นตอนที่ 3: ติดตั้ง Dependencies และรัน Frontend
เปิด Terminal อีกหน้าต่างหนึ่ง:
```bash
cd frontend

# ติดตั้ง Dependencies
npm install

# รัน Next.js App (Dev Mode)
npm run dev
```

---

## 🧪 Commands Summary Reference

| คำสั่ง | รายละเอียด |
| --- | --- |
| `docker-compose up -d` | สั่งรันทุก Container ในแบบ Background |
| `npx prisma studio` | เปิด Web UI ดูข้อมูลในฐานข้อมูล (รันในโฟลเดอร์ `/backend`) |
| `npm run lint` | ตรวจสอบการเขียน Code ด้วย ESLint |
| `npm run build` | สั่ง Build Production Code |

---

## 📝 License
Distributed under the MIT License.