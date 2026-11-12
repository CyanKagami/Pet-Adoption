// src/app/login/page.tsx
'use client';

import { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { PawPrint, Loader2, Info } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function LoginFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get('redirect') || '';

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    // เช็ครหัสผ่านตรงกันกรณีสมัครสมาชิก
    if (mode === 'register' && password !== confirmPassword) {
      setErrorMessage('รหัสผ่านและยืนยันรหัสผ่านไม่ตรงกัน');
      return;
    }

    setIsLoading(true);

    try {
      let res;
      if (mode === 'login') {
        res = await api.auth.login({ email, password });
      } else {
        res = await api.auth.register({ email, password, fullName });
      }

      if (res.success) {
        setSuccessMessage(`${res.message}! ยินดีต้อนรับ ${res.user.fullName}`);
        setTimeout(() => {
          const destination = redirectUrl || '/';
          router.push(destination);
          router.refresh();
        }, 800);
      } else {
        setErrorMessage(res.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
      }
    } catch {
      setErrorMessage('ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md bg-card border border-border rounded-xl p-8 shadow-sm space-y-6">
      {/* แจ้งเตือนกรณีถูก Redirect มาจากการคลิกสนใจสัตว์เลี้ยง */}
      {redirectUrl && (
        <div className="flex items-start gap-2.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-xs sm:text-sm rounded-lg p-3">
          <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <span>กรุณาเข้าสู่ระบบก่อน เพื่อดำเนินการกรอกแบบประเมินความพร้อมรับเลี้ยง</span>
        </div>
      )}

      {/* หัวข้อสลับแท็บ เข้าสู่ระบบ | สมัครสมาชิก */}
      <div className="flex justify-center items-center gap-3 text-lg font-bold border-b border-border pb-4">
        <button
          type="button"
          onClick={() => { setMode('login'); setErrorMessage(''); }}
          className={`transition-colors cursor-pointer ${mode === 'login' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
        >
          เข้าสู่ระบบ
        </button>
        <span className="text-muted-foreground">|</span>
        <button
          type="button"
          onClick={() => { setMode('register'); setErrorMessage(''); }}
          className={`transition-colors cursor-pointer ${mode === 'register' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
        >
          สมัครสมาชิก
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* ฟิลด์เพิ่มเติมเฉพาะตอนสมัครสมาชิก */}
        {mode === 'register' && (
          <div className="space-y-1.5">
            <Label htmlFor="fullName">ชื่อที่แสดง</Label>
            <Input
              id="fullName"
              placeholder="สมชาย ใจดี"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required={mode === 'register'}
            />
          </div>
        )}

        {/* ช่องกรอกอีเมล */}
        <div className="space-y-1.5">
          <Label htmlFor="email">อีเมล</Label>
          <Input
            id="email"
            type="email"
            placeholder="name@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        {/* ช่องกรอกรหัสผ่าน */}
        <div className="space-y-1.5">
          <Label htmlFor="password">รหัสผ่าน</Label>
          <Input
            id="password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        {/* ช่องยืนยันรหัสผ่าน (เฉพาะสมัครสมาชิก) */}
        {mode === 'register' && (
          <div className="space-y-1.5">
            <Label htmlFor="confirmPassword">ยืนยันรหัสผ่าน</Label>
            <Input
              id="confirmPassword"
              type="password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required={mode === 'register'}
            />
          </div>
        )}

        {/* แสดงข้อความแจ้งเตือน Error หรือ Success */}
        {errorMessage && (
          <p className="text-sm font-medium text-destructive text-center">
            {errorMessage}
          </p>
        )}
        {successMessage && (
          <p className="text-sm font-medium text-green-600 dark:text-green-400 text-center">
            {successMessage}
          </p>
        )}

        {/* ปุ่มกด Action */}
        <Button
          type="submit"
          disabled={isLoading}
          className="w-full bg-primary text-primary-foreground hover:opacity-90 transition-opacity h-11 text-base font-medium rounded-lg"
        >
          {isLoading
            ? 'กำลังดำเนินการ...'
            : mode === 'login'
            ? 'เข้าสู่ระบบ'
            : 'สร้างบัญชีผู้ใช้'}
        </Button>
      </form>

      {/* สลับสถานะด้านล่าง */}
      <div className="text-center text-sm text-muted-foreground pt-2">
        {mode === 'login' ? (
          <p>
            ยังไม่มีบัญชี?{' '}
            <button
              type="button"
              onClick={() => { setMode('register'); setErrorMessage(''); }}
              className="font-medium text-foreground underline hover:text-primary cursor-pointer"
            >
              สมัครสมาชิก
            </button>
          </p>
        ) : (
          <p>
            มีบัญชีอยู่แล้ว?{' '}
            <button
              type="button"
              onClick={() => { setMode('login'); setErrorMessage(''); }}
              className="font-medium text-foreground underline hover:text-primary cursor-pointer"
            >
              เข้าสู่ระบบ
            </button>
          </p>
        )}
      </div>

      {/* บัญชีสำหรับทดสอบสิทธิ์แชทและความเป็นส่วนตัว (Chat Ownership & Privacy Testing) */}
      <div className="mt-4 pt-4 border-t border-border space-y-2">
        <p className="text-xs font-semibold text-gray-700">บัญชีทดสอบในระบบ (Password: Password123!):</p>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <button
            type="button"
            onClick={() => {
              setEmail('demo@pethome.com');
              setPassword('Password123!');
            }}
            className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-left transition-colors cursor-pointer"
          >
            <div className="font-bold text-gray-900">PetHome (เจ้าของ)</div>
            <div className="text-[11px] text-gray-500 truncate">demo@pethome.com</div>
          </button>
          <button
            type="button"
            onClick={() => {
              setEmail('somchai@example.com');
              setPassword('Password123!');
            }}
            className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-left transition-colors cursor-pointer"
          >
            <div className="font-bold text-gray-900">คุณสมชาย</div>
            <div className="text-[11px] text-gray-500 truncate">somchai@example.com</div>
          </button>
          <button
            type="button"
            onClick={() => {
              setEmail('jaidee@example.com');
              setPassword('Password123!');
            }}
            className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-left transition-colors cursor-pointer"
          >
            <div className="font-bold text-gray-900">คุณใจดี</div>
            <div className="text-[11px] text-gray-500 truncate">jaidee@example.com</div>
          </button>
          <button
            type="button"
            onClick={() => {
              setEmail('manee@example.com');
              setPassword('Password123!');
            }}
            className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-left transition-colors cursor-pointer"
          >
            <div className="font-bold text-gray-900">คุณมานี (ไม่เคยแชท)</div>
            <div className="text-[11px] text-gray-500 truncate">manee@example.com</div>
          </button>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* 1. Header แถบด้านบนตาม Wireframe */}
      <header className="w-full bg-card border-b border-border py-4 px-8 shadow-xs">
        <Link href="/" className="inline-flex items-center gap-2 text-xl font-bold tracking-tight text-foreground">
          <PawPrint className="w-6 h-6 text-primary fill-primary" />
          <span>PetHome</span>
        </Link>
      </header>

      {/* 2. ฟอร์มกล่องตรงกลาง */}
      <main className="flex-1 flex items-center justify-center p-4">
        <Suspense
          fallback={
            <div className="w-full max-w-md bg-card border border-border rounded-xl p-8 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          }
        >
          <LoginFormContent />
        </Suspense>
      </main>
    </div>
  );
}
