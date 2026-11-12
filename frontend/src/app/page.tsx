'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Search,
  RotateCcw,
  Heart,
  Plus,
  Loader2,
  Info,
  Calendar,
  MapPin,
  Check,
  ShieldCheck,
  ExternalLink,
} from 'lucide-react';
import Navbar from '@/components/Navbar';
import { api } from '@/lib/api';
import { Pet } from '@/types/pet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function HomePage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [pets, setPets] = useState<Pet[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Filter States
  const [type, setType] = useState('all');
  const [breed, setBreed] = useState('');
  const [location, setLocation] = useState('');
  const [status, setStatus] = useState('available');

  // Wishlist set of pet IDs (Real DB - Requirement 5)
  const [wishlist, setWishlist] = useState<Set<string>>(new Set());

  // ตรวจสอบสถานะล็อกอินและโหลด Wishlist จริงของผู้ใช้นี้
  useEffect(() => {
    const fetchAuthAndWishlist = async () => {
      try {
        const authRes = await api.auth.me().catch(() => null);
        if (authRes?.success && authRes.user) {
          setCurrentUser(authRes.user);
          const wishRes = await api.wishlist.getAll().catch(() => null);
          if (wishRes?.success && Array.isArray(wishRes.data)) {
            const ids = new Set<string>(wishRes.data.map((p: any) => p.id));
            setWishlist(ids);
          }
        } else {
          setCurrentUser(null);
          setWishlist(new Set());
        }
      } catch {
        // Not logged in
      }
    };
    fetchAuthAndWishlist();
  }, []);

  // ฟังก์ชันดึงข้อมูลสัตว์เลี้ยง
  const fetchPets = useCallback(
    async (targetPage = 1, append = false) => {
      try {
        if (append) {
          setLoadingMore(true);
        } else {
          setLoading(true);
        }

        const res = await api.pets.getAll({
          type: type === 'all' ? undefined : type,
          breed: breed.trim() || undefined,
          location: location.trim() || undefined,
          status: status === 'all' ? undefined : status,
          page: targetPage,
          limit: 9,
        });

        if (res.success) {
          const list = Array.isArray(res.data) ? res.data : ((res.data as any)?.pets || []);
          if (append) {
            setPets((prev) => [...prev, ...list]);
          } else {
            setPets(list);
          }
          setTotal(res.total ?? (res.data as any)?.total ?? list.length);
          setTotalPages(res.totalPages ?? (res.data as any)?.totalPages ?? 1);
          setPage(targetPage);
        }
      } catch (err) {
        console.error('Failed to load pets:', err);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [type, breed, location, status]
  );

  useEffect(() => {
    fetchPets(1, false);
  }, [fetchPets]);

  // ค้นหา
  const handleSearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    fetchPets(1, false);
  };

  // ล้างตัวกรอง
  const handleResetFilters = () => {
    setType('all');
    setBreed('');
    setLocation('');
    setStatus('all');
  };

  // โหลดเพิ่มเติม
  const handleLoadMore = () => {
    if (page < totalPages) {
      fetchPets(page + 1, true);
    }
  };

  // สลับสถานะ Wishlist บันทึกลงฐานข้อมูลจริง (Requirement 5)
  const toggleWishlist = async (petId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    if (!currentUser) {
      router.push('/login?redirect=/');
      return;
    }

    const isCurrentlyIn = wishlist.has(petId);
    // Optimistic UI update
    setWishlist((prev) => {
      const next = new Set(prev);
      if (isCurrentlyIn) {
        next.delete(petId);
      } else {
        next.add(petId);
      }
      return next;
    });

    try {
      if (isCurrentlyIn) {
        await api.wishlist.remove(petId);
      } else {
        await api.wishlist.add(petId);
      }
    } catch (err) {
      console.error('Failed to sync wishlist with DB:', err);
      // Revert on failure
      setWishlist((prev) => {
        const next = new Set(prev);
        if (isCurrentlyIn) next.add(petId);
        else next.delete(petId);
        return next;
      });
    }
  };

  // แปลงสถานะเป็น Badge สีและข้อความตาม Wireframe
  const renderStatusBadge = (petStatus: string) => {
    switch (petStatus) {
      case 'available':
        return (
          <span className="inline-flex items-center px-4 py-1 rounded-full text-sm font-medium bg-[#dcfce7] text-[#166534] border border-[#86efac]">
            available
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center px-4 py-1 rounded-full text-sm font-medium bg-[#fef3c7] text-[#92400e] border border-[#fde047]">
            รอตัดสินใจ
          </span>
        );
      case 'adopted':
        return (
          <span className="inline-flex items-center px-4 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-700 border border-gray-300">
            ได้บ้านแล้ว
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-4 py-1 rounded-full text-sm font-medium bg-secondary text-secondary-foreground border border-border">
            {petStatus}
          </span>
        );
    }
  };

  return (
    <div className="min-h-screen bg-[#fafafa] flex flex-col font-sans text-foreground">
      {/* 1. Header & Navigation bar */}
      <Navbar activePage="search" />

      {/* 2. Main Content Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full flex-1 space-y-6">
        
        {/* กล่องตัวกรองและค้นหา (Filter Bar ตาม Wireframe) */}
        <section className="bg-white border border-border rounded-xl p-4 shadow-2xs">
          <form onSubmit={handleSearch} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
            {/* 1. ชนิดสัตว์ */}
            <div className="w-full">
              <select
                id="filterType"
                aria-label="ชนิดสัตว์"
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full h-10 px-3 bg-white border border-input rounded-lg text-sm text-foreground focus:outline-hidden focus:ring-2 focus:ring-ring"
              >
                <option value="all">ชนิดสัตว์ (ทั้งหมด)</option>
                <option value="สุนัข">สุนัข (Dog)</option>
                <option value="แมว">แมว (Cat)</option>
                <option value="อื่นๆ">อื่นๆ</option>
              </select>
            </div>

            {/* 2. สายพันธุ์ */}
            <div className="w-full">
              <Input
                id="filterBreed"
                placeholder="สายพันธุ์"
                value={breed}
                onChange={(e) => setBreed(e.target.value)}
                className="h-10 text-sm bg-white"
              />
            </div>

            {/* 3. ที่พักพิง / พื้นที่ */}
            <div className="w-full">
              <Input
                id="filterLocation"
                placeholder="ที่พักพิง/พื้นที่"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="h-10 text-sm bg-white"
              />
            </div>

            {/* 4. สถานะ */}
            <div className="w-full">
              <select
                id="filterStatus"
                aria-label="สถานะสัตว์เลี้ยง"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full h-10 px-3 bg-white border border-input rounded-lg text-sm text-foreground focus:outline-hidden focus:ring-2 focus:ring-ring"
              >
                <option value="available">สถานะ: available</option>
                <option value="all">สถานะ: ทั้งหมด</option>
                <option value="pending">สถานะ: รอตัดสินใจ</option>
                <option value="adopted">สถานะ: ได้บ้านแล้ว</option>
              </select>
            </div>

            {/* 5. ปุ่มค้นหา */}
            <Button
              type="submit"
              className="h-10 bg-[#dbeafe] hover:bg-[#bfdbfe] text-[#1e40af] font-medium rounded-lg text-sm transition-colors border border-[#bfdbfe] shadow-2xs"
            >
              <Search className="w-4 h-4 mr-1.5" />
              ค้นหา
            </Button>

            {/* 6. ปุ่มล้างตัวกรอง */}
            <Button
              type="button"
              variant="outline"
              onClick={handleResetFilters}
              className="h-10 border-border hover:bg-muted text-muted-foreground hover:text-foreground font-medium rounded-lg text-sm transition-colors"
            >
              <RotateCcw className="w-4 h-4 mr-1.5" />
              ล้างตัวกรอง
            </Button>
          </form>
        </section>

        {/* 3. รายการสัตว์เลี้ยง (Pet Cards Grid) */}
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center text-muted-foreground gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm">กำลังโหลดข้อมูลสัตว์เลี้ยง...</p>
          </div>
        ) : pets.length > 0 ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {pets.map((pet) => {
                const isWishlisted = wishlist.has(pet.id);
                let rawImg =
                  pet.image ||
                  (pet.images && pet.images.length > 0
                    ? typeof pet.images[0] === 'string'
                      ? pet.images[0]
                      : pet.images[0].imageUrl
                    : null);
                if (typeof rawImg === 'string' && (rawImg.startsWith('http://localhost:5000data:') || rawImg.startsWith('https://localhost:5000data:'))) {
                  rawImg = rawImg.replace(/^https?:\/\/localhost:5000/, '');
                }
                const primaryImage = rawImg;

                return (
                  <Link
                    key={pet.id}
                    href={`/pets/${pet.id}`}
                    className="bg-white border border-border rounded-xl overflow-hidden hover:shadow-md transition-shadow cursor-pointer flex flex-col group"
                  >
                    {/* ส่วนแสดงรูปภาพ (หากไม่มีรูปภาพ ให้แสดงกล่องสีเทา 'รูปภาพ' ตรงกลางตาม Wireframe) */}
                    <div className="w-full h-52 bg-[#e5e7eb] flex items-center justify-center border-b border-border relative overflow-hidden">
                      {primaryImage ? (
                        <>
                          <img
                            src={primaryImage}
                            alt={pet.name}
                            onError={(e) => {
                              const target = e.currentTarget;
                              target.style.display = 'none';
                              const fallback = target.nextElementSibling as HTMLElement;
                              if (fallback) fallback.style.display = 'flex';
                            }}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                          <div
                            style={{ display: 'none' }}
                            className="w-full h-full border border-dashed border-gray-300 m-2 rounded-lg items-center justify-center text-gray-500 font-medium"
                          >
                            รูปภาพ
                          </div>
                        </>
                      ) : (
                        <div className="w-full h-full border border-dashed border-gray-300 m-2 rounded-lg flex items-center justify-center text-gray-500 font-medium">
                          รูปภาพ
                        </div>
                      )}

                      {/* ปุ่มหัวใจ Wishlist ที่มุมบนขวา */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          toggleWishlist(pet.id, e);
                        }}
                        className="absolute top-3 right-3 w-9 h-9 rounded-full bg-white/90 backdrop-blur-xs flex items-center justify-center hover:bg-white shadow-2xs transition-transform active:scale-90"
                        title={isWishlisted ? 'ลบออกจาก Wishlist' : 'เพิ่มใน Wishlist'}
                      >
                        <Heart
                          className={`w-5 h-5 transition-colors ${
                            isWishlisted
                              ? 'text-red-500 fill-red-500'
                              : 'text-gray-600 hover:text-red-500'
                          }`}
                        />
                      </button>
                    </div>

                    {/* รายละเอียดการ์ด */}
                    <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <h2 className="text-xl font-bold tracking-tight text-foreground group-hover:text-primary transition-colors">
                            {pet.name}
                          </h2>
                          <Heart
                            onClick={(e) => {
                              e.preventDefault();
                              toggleWishlist(pet.id, e);
                            }}
                            className={`w-5 h-5 cursor-pointer transition-colors ${
                              isWishlisted
                                ? 'text-red-500 fill-red-500'
                                : 'text-gray-400 hover:text-red-500'
                            }`}
                          />
                        </div>

                        {/* ชนิด · สายพันธุ์ · ที่พักพิง/พื้นที่ ตาม Wireframe */}
                        <p className="text-sm text-muted-foreground">
                          {pet.type} · {pet.breed || 'ไม่ระบุสายพันธุ์'} · {pet.location}
                        </p>
                      </div>

                      {/* ป้ายแสดงสถานะ (Status Badge) */}
                      <div>
                        {renderStatusBadge(pet.status)}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>

            {/* ปุ่มโหลดเพิ่มเติม ตาม Wireframe */}
            <div className="pt-2 flex items-center justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={handleLoadMore}
                disabled={loadingMore || page >= totalPages}
                className="h-10 px-6 border-border rounded-lg text-sm font-medium hover:bg-muted"
              >
                {loadingMore ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    กำลังโหลด...
                  </>
                ) : page >= totalPages ? (
                  'แสดงข้อมูลครบทั้งหมดแล้ว'
                ) : (
                  'โหลดเพิ่มเติม'
                )}
              </Button>

              <span className="text-xs text-muted-foreground">
                แสดง {pets.length} จากทั้งหมด {total} ตัว
              </span>
            </div>
          </div>
        ) : (
          /* 4. สถานะว่าง (Empty state - เมื่อไม่พบสัตว์เลี้ยงตามตัวกรอง) ตาม Wireframe */
          <div className="border border-dashed border-border rounded-xl p-12 text-center my-8 space-y-3 bg-white shadow-2xs">
            <p className="text-xs text-muted-foreground font-medium">
              สถานะว่าง (Empty state) – เมื่อไม่พบสัตว์เลี้ยงตามตัวกรอง
            </p>
            <div className="py-2 space-y-1">
              <h3 className="text-lg font-bold text-foreground">ไม่พบสัตว์เลี้ยง</h3>
              <p className="text-sm text-muted-foreground">ลองปรับตัวกรอง หรือล้างตัวกรอง</p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={handleResetFilters}
              className="h-10 px-5 text-sm"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              ล้างตัวกรอง
            </Button>
          </div>
        )}

        {/* 6. ปุ่มลอย/ปุ่มมุมขวาล่างสำหรับลงประกาศหาบ้านใหม่ (+ ลงประกาศหาบ้าน) ตาม Wireframe */}
        <div className="flex justify-end pt-4 pb-8">
          <Link
            href="/pets/create"
            className="inline-flex items-center gap-2 bg-[#dbeafe] hover:bg-[#bfdbfe] text-[#1e40af] border border-[#bfdbfe] font-medium px-6 py-2.5 rounded-lg shadow-sm transition-all hover:shadow-md cursor-pointer text-sm"
          >
            <Plus className="w-4 h-4" />
            <span>ลงประกาศหาบ้าน</span>
          </Link>
        </div>
      </main>
    </div>
  );
}
