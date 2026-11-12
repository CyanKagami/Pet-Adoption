'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  PawPrint,
  User,
  LogOut,
  LogIn,
  ChevronDown,
  Bell,
  Heart,
  MessageSquare,
  FileText,
  CheckCircle,
} from 'lucide-react';
import { api } from '@/lib/api';

interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  phoneNumber?: string | null;
  profileImage?: string | null;
  isVerified?: boolean;
}

export default function Navbar({ activePage = 'search' }: { activePage?: string }) {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [isLoadingUser, setIsLoadingUser] = useState(true);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState<number | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // ตรวจสอบสถานะการล็อกอินของผู้ใช้
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await api.auth.me();
        if (res.success && res.user) {
          setCurrentUser(res.user);
        } else {
          setCurrentUser(null);
        }
      } catch {
        setCurrentUser(null);
      } finally {
        setIsLoadingUser(false);
      }
    };

    fetchUser();
  }, []);

  // ดึงจำนวนการแจ้งเตือนจริงเฉพาะเมื่อล็อกอินแล้ว (Requirement 2: Only own only can read)
  useEffect(() => {
    if (currentUser) {
      api.notifications
        .getAll()
        .then((res) => {
          if (res.success && Array.isArray(res.data)) {
            setUnreadCount(res.data.length);
          }
        })
        .catch(() => setUnreadCount(null));
    } else {
      setUnreadCount(null);
    }
  }, [currentUser]);

  // ปิด Dropdown เมื่อคลิกข้างนอก
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // การคลิกปุ่มโปรไฟล์
  const handleProfileClick = () => {
    if (!currentUser) {
      // หากยังไม่ได้เข้าสู่ระบบ -> ไปที่หน้า /login ทันที
      router.push('/login');
    } else {
      // หากเข้าสู่ระบบแล้ว -> เปิด/ปิด Dropdown
      setIsDropdownOpen((prev) => !prev);
    }
  };

  // ออกจากระบบ
  const handleLogout = async () => {
    try {
      await api.auth.logout();
      setCurrentUser(null);
      setIsDropdownOpen(false);
      router.push('/login');
      router.refresh();
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  return (
    <header className="w-full bg-white border-b border-border shadow-xs sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* โลโก้ PetHome */}
        <Link
          href="/"
          className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground hover:opacity-90 transition-opacity"
        >
          <PawPrint className="w-7 h-7 text-primary fill-primary" />
          <span>PetHome</span>
        </Link>

        {/* เมนูนำทางขวามือตาม Wireframe */}
        <nav className="flex items-center gap-6 sm:gap-8 text-sm font-medium">
          <Link
            href="/"
            className={`transition-colors hover:text-primary ${
              activePage === 'search' ? 'text-primary font-semibold' : 'text-foreground'
            }`}
          >
            ค้นหาสัตว์
          </Link>

          <Link
            href="/pets"
            className={`transition-colors hover:text-primary hidden sm:inline-flex ${
              activePage === 'my-pets' ? 'text-primary font-semibold' : 'text-foreground'
            }`}
          >
            ประกาศของฉัน
          </Link>

          <Link
            href="/wishlist"
            className={`transition-colors hover:text-primary hidden md:inline-flex items-center gap-1.5 ${
              activePage === 'wishlist' ? 'text-primary font-semibold' : 'text-foreground'
            }`}
          >
            <Heart className="w-4 h-4 text-muted-foreground" />
            <span>Wishlist</span>
          </Link>

          <Link
            href="/chat"
            className={`transition-colors hover:text-primary hidden md:inline-flex items-center gap-1.5 ${
              activePage === 'chat' ? 'text-primary font-semibold' : 'text-foreground'
            }`}
          >
            <MessageSquare className="w-4 h-4 text-muted-foreground" />
            <span>แชท</span>
          </Link>

          <Link
            href="/notifications"
            className={`transition-colors hover:text-primary hidden sm:inline-flex items-center gap-1 ${
              activePage === 'notifications' ? 'text-primary font-semibold' : 'text-foreground'
            }`}
          >
            <Bell className="w-4 h-4 text-muted-foreground" />
            <span>
              แจ้งเตือน{currentUser && unreadCount !== null && unreadCount > 0 ? ` (${unreadCount})` : ''}
            </span>
          </Link>

          {/* ปุ่มโปรไฟล์ (เมื่อคลิกจะไปที่ /login ถ้ายังไม่ล็อกอิน หรือเปิดตัวเลือก /logout ถ้าล็อกอินแล้ว) */}
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={handleProfileClick}
              className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-foreground hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer border border-transparent hover:border-border font-medium"
              title={currentUser ? `บัญชี: ${currentUser.fullName}` : 'เข้าสู่ระบบ'}
            >
              <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">
                {currentUser?.fullName ? currentUser.fullName.charAt(0).toUpperCase() : <User className="w-4 h-4" />}
              </div>
              <span className="hidden sm:inline">
                {currentUser ? currentUser.fullName.split(' ')[0] : 'โปรไฟล์'}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
            </button>

            {/* Dropdown Menu เมื่อผู้ใช้เข้าสู่ระบบแล้ว */}
            {isDropdownOpen && currentUser && (
              <div className="absolute right-0 mt-2 w-64 bg-card rounded-xl border border-border shadow-lg py-2 z-50 text-foreground animate-in fade-in zoom-in-95 duration-100">
                <div className="px-4 py-3 border-b border-border">
                  <p className="text-sm font-semibold text-foreground truncate flex items-center gap-1.5">
                    {currentUser.fullName}
                    {currentUser.isVerified && (
                      <CheckCircle className="w-4 h-4 text-green-500 fill-green-100 shrink-0" />
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{currentUser.email}</p>
                  {currentUser.isVerified && (
                    <span className="inline-block mt-1 text-[11px] bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full font-medium">
                      ยืนยันตัวตนแล้ว ✓
                    </span>
                  )}
                </div>

                <div className="py-1">
                  <Link
                    href="/pets"
                    onClick={() => setIsDropdownOpen(false)}
                    className="flex items-center gap-2.5 px-4 py-2 text-sm text-foreground hover:bg-accent transition-colors"
                  >
                    <FileText className="w-4 h-4 text-muted-foreground" />
                    <span>ประกาศของฉัน</span>
                  </Link>

                  <Link
                    href="/pets/create"
                    onClick={() => setIsDropdownOpen(false)}
                    className="flex items-center gap-2.5 px-4 py-2 text-sm text-foreground hover:bg-accent transition-colors"
                  >
                    <PawPrint className="w-4 h-4 text-muted-foreground" />
                    <span>ลงประกาศหาบ้านใหม่</span>
                  </Link>
                </div>

                <div className="border-t border-border pt-1">
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="w-full text-left flex items-center gap-2.5 px-4 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors cursor-pointer font-medium"
                  >
                    <LogOut className="w-4 h-4 text-destructive" />
                    <span>ออกจากระบบ (Logout)</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
}
