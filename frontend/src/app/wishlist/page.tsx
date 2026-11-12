// src/app/wishlist/page.tsx
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Heart, Loader2 } from 'lucide-react';
import Navbar from '@/components/Navbar';
import { api } from '@/lib/api';

interface WishlistItem {
  id: string;
  name: string;
  type: string;
  breed?: string | null;
  status: 'available' | 'pending' | 'adopted' | string;
  image?: string | null;
  images?: string[];
}

export default function WishlistPage() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [wishlist, setWishlist] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState<string | null>(null);

  // ดึงข้อมูล Wishlist จริงของแต่ละบุคคลจากฐานข้อมูล (Requirement 5: Each person has their own wishlist)
  useEffect(() => {
    const fetchWishlistPets = async () => {
      try {
        setLoading(true);
        const authRes = await api.auth.me().catch(() => null);
        if (authRes?.success && authRes.user) {
          setCurrentUser(authRes.user);
          const res = await api.wishlist.getAll();
          if (res.success && Array.isArray(res.data)) {
            setWishlist(res.data);
          } else {
            setWishlist([]);
          }
        } else {
          setCurrentUser(null);
          setWishlist([]);
        }
      } catch (err) {
        console.error('Failed to load wishlist:', err);
        setWishlist([]);
      } finally {
        setLoading(false);
      }
    };

    fetchWishlistPets();
  }, []);

  // ลบออกจาก Wishlist จริงใน PostgreSQL
  const handleRemoveFromWishlist = async (id: string) => {
    setRemovingId(id);
    try {
      const res = await api.wishlist.remove(id);
      if (res.success) {
        setWishlist((prev) => prev.filter((item) => item.id !== id));
      } else {
        setWishlist((prev) => prev.filter((item) => item.id !== id));
      }
    } catch {
      setWishlist((prev) => prev.filter((item) => item.id !== id));
    } finally {
      setRemovingId(null);
    }
  };

  const renderStatusBadge = (status: string) => {
    if (status === 'available') {
      return (
        <span className="inline-block px-3.5 py-1 rounded-full text-xs font-semibold bg-[#dcfce7] text-[#166534] border border-[#86efac]">
          available
        </span>
      );
    }
    if (status === 'pending') {
      return (
        <span className="inline-block px-3.5 py-1 rounded-full text-xs font-semibold bg-[#fef3c7] text-[#92400e] border border-[#fde047]">
          รอตัดสินใจ
        </span>
      );
    }
    return (
      <span className="inline-block px-3.5 py-1 rounded-full text-xs font-semibold bg-[#e5e7eb] text-gray-700 border border-gray-300">
        adopted
      </span>
    );
  };

  if (!currentUser && !loading) {
    return (
      <div className="min-h-screen bg-white flex flex-col font-sans text-foreground">
        <Navbar activePage="wishlist" />
        <main className="max-w-md mx-auto px-4 py-24 text-center space-y-4">
          <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto border border-red-200">
            <Heart className="w-8 h-8 fill-red-500 text-red-500" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">เข้าสู่ระบบเพื่อดู Wishlist ของคุณ</h1>
          <p className="text-sm text-gray-600">
            แต่ละบัญชีผู้ใช้มีรายการโปรด (Wishlist) ส่วนตัวเฉพาะของตนเอง กรุณาเข้าสู่ระบบก่อนเข้าถึงข้อมูล
          </p>
          <div className="pt-2">
            <Link
              href="/login?redirect=/wishlist"
              className="inline-flex items-center justify-center px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors shadow-xs"
            >
              เข้าสู่ระบบ (Login)
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex flex-col font-sans text-foreground">
      {/* 1. Header Navbar */}
      <Navbar activePage="wishlist" />

      {/* 2. Main Content (Wireframe 09-9-Wishlist 1) */}
      <main className="max-w-6xl mx-auto px-6 sm:px-10 py-8 w-full flex-1 space-y-8">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
          Wishlist ของฉัน
        </h1>

        {/* Wishlist Cards Grid */}
        {loading ? (
          <div className="py-24 flex flex-col items-center justify-center text-muted-foreground gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm">กำลังโหลดข้อมูล Wishlist จากฐานข้อมูล...</p>
          </div>
        ) : wishlist.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {wishlist.map((pet) => {
              const displayImage = pet.image || (Array.isArray(pet.images) && pet.images.length > 0 ? pet.images[0] : null);

              return (
                <div
                  key={pet.id}
                  className="border border-gray-400 bg-white rounded-lg p-5 flex flex-col justify-between space-y-4 shadow-2xs hover:shadow-xs transition-shadow"
                >
                  {/* กรอบรูปภาพตาม Wireframe */}
                  <div className="w-full h-44 border border-dashed border-gray-400 rounded-lg flex items-center justify-center text-gray-400 text-sm font-medium bg-gray-50 overflow-hidden">
                    {displayImage ? (
                      <img
                        src={displayImage}
                        alt={pet.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span>รูปภาพ</span>
                    )}
                  </div>

                  {/* รายละเอียดสัตว์เลี้ยง */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Link
                        href={`/pets/${pet.id}`}
                        className="text-lg font-bold text-gray-900 hover:underline hover:text-blue-600 transition-colors"
                      >
                        {pet.name}
                      </Link>
                      {renderStatusBadge(pet.status)}
                    </div>

                    <p className="text-sm text-gray-600">
                      {pet.type} · {pet.breed || 'ไม่ระบุสายพันธุ์'}
                    </p>
                  </div>

                  {/* แถบปุ่มด้านล่าง: ลบออกจาก Wishlist | ดูรายละเอียด */}
                  <div className="pt-2 border-t border-gray-200 flex items-center justify-between gap-3">
                    <button
                      type="button"
                      disabled={removingId === pet.id}
                      onClick={() => handleRemoveFromWishlist(pet.id)}
                      className="text-xs text-red-600 hover:text-red-700 hover:underline font-medium cursor-pointer flex items-center gap-1 disabled:opacity-50"
                    >
                      {removingId === pet.id ? (
                        <span className="flex items-center gap-1">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          <span>กำลังลบ...</span>
                        </span>
                      ) : (
                        <span>ลบออกจาก Wishlist</span>
                      )}
                    </button>

                    <Link
                      href={`/pets/${pet.id}`}
                      className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-[#dbeafe] hover:bg-[#bfdbfe] text-[#1e40af] border border-[#bfdbfe] transition-colors cursor-pointer"
                    >
                      ดูรายละเอียด
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Empty state ตามกรอบสีฟ้าใน Wireframe 09-9-Wishlist 1 */
          <div className="border border-gray-400 bg-white rounded-lg p-12 text-center space-y-4 shadow-2xs">
            <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto border border-blue-200">
              <Heart className="w-6 h-6 fill-blue-500 text-blue-500" />
            </div>
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-gray-900">
                ยังไม่มีสัตว์เลี้ยงใน Wishlist
              </h2>
              <p className="text-sm text-gray-600 max-w-sm mx-auto">
                กดรูปหัวใจ ♡ ที่มุมบนขวาของการ์ดสัตว์เลี้ยงในหน้าค้นหา เพื่อบันทึกสัตว์ที่คุณสนใจไว้ดูภายหลัง
              </p>
            </div>
            <div className="pt-2">
              <Link
                href="/"
                className="inline-flex items-center justify-center px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors shadow-2xs cursor-pointer"
              >
                ค้นหาสัตว์เลี้ยง
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
