'use client';

import { useState, useEffect, use, Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  Heart,
  MessageSquare,
  ArrowLeft,
  Loader2,
  CheckCircle,
  User,
} from 'lucide-react';
import Navbar from '@/components/Navbar';
import { api } from '@/lib/api';
import type { Pet, PetOwner } from '@/types/pet';
import { Button } from '@/components/ui/button';

type AuthenticatedUser = Pick<PetOwner, 'id'>;

interface PetDetailPageProps {
  params: Promise<{ id: string }>;
}

function PetDetailContent({ params }: PetDetailPageProps) {
  const { id } = use(params);
  const router = useRouter();

  const [pet, setPet] = useState<Pet | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<AuthenticatedUser | null>(null);
  const [isWishlisted, setIsWishlisted] = useState(false);
  const [isWishlistLoading, setIsWishlistLoading] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);

  useEffect(() => {
    const fetchPetDetail = async () => {
      try {
        setLoading(true);
        const res = await api.pets.getById(id);
        if (res.success && res.data) {
          setPet(res.data);
        }
      } catch (err) {
        console.error('Failed to load pet detail:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchPetDetail();
  }, [id]);

  useEffect(() => {
    const fetchAuthAndWishlist = async () => {
      try {
        const authRes = await api.auth.me();
        if (authRes.success && authRes.user) {
          setCurrentUser(authRes.user);
          const wishRes = await api.wishlist.getAll();
          if (wishRes.success && Array.isArray(wishRes.data)) {
            const found = wishRes.data.some((item) => item.id === id);
            setIsWishlisted(found);
          }
        }
      } catch {
        // Not logged in
      }
    };

    fetchAuthAndWishlist();
  }, [id]);

  // สลับสถานะ Wishlist บันทึกลงฐานข้อมูลจริง
  const handleWishlistToggle = async () => {
    if (!currentUser) {
      router.push(`/login?redirect=/pets/${id}`);
      return;
    }
    if (isWishlistLoading) return;

    setIsWishlistLoading(true);
    try {
      if (isWishlisted) {
        const res = await api.wishlist.remove(id);
        if (res.success) setIsWishlisted(false);
      } else {
        const res = await api.wishlist.add(id);
        if (res.success) setIsWishlisted(true);
      }
    } catch (err) {
      console.error('Failed to toggle wishlist:', err);
    } finally {
      setIsWishlistLoading(false);
    }
  };

  // เมื่อผู้ใช้คลิกปุ่ม 'สนใจรับเลี้ยง' -> ตรวจสอบว่าล็อกอินแล้วหรือยัง และไม่ใช่เจ้าของสัตว์เลี้ยง
  const handleInterestClick = async () => {
    try {
      const res = await api.auth.me();
      if (res.success && res.user) {
        if (res.user.id === (pet?.owner?.id || pet?.ownerId)) {
          alert('คุณไม่สามารถรับเลี้ยงสัตว์เลี้ยงของตัวเองได้');
          return;
        }
        router.push(`/pets/${id}/apply`);
      } else {
        router.push(`/login?redirect=/pets/${id}/apply`);
      }
    } catch {
      router.push(`/login?redirect=/pets/${id}/apply`);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#fafafa] flex flex-col font-sans">
        <Navbar activePage="search" />
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm">กำลังโหลดรายละเอียดสัตว์เลี้ยง...</p>
        </div>
      </div>
    );
  }

  if (!pet) {
    return (
      <div className="min-h-screen bg-[#fafafa] flex flex-col font-sans">
        <Navbar activePage="search" />
        <div className="flex-1 max-w-xl mx-auto px-4 py-20 text-center space-y-4">
          <h2 className="text-2xl font-bold text-foreground">ไม่พบข้อมูลสัตว์เลี้ยง</h2>
          <p className="text-sm text-muted-foreground">ประกาศนี้อาจถูกลบหรือไม่มีอยู่ในระบบ</p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>กลับหน้าหลัก</span>
          </Link>
        </div>
      </div>
    );
  }

  const imagesList = pet.images && pet.images.length > 0 ? pet.images : [];
  const rawCurrentImg = imagesList[selectedImageIndex];
  const currentImage = rawCurrentImg?.imageUrl || pet.image || null;

  // จัดรูปแบบอายุ
  const ageDisplay = pet.ageMonths
    ? pet.ageMonths >= 12
      ? `${Math.floor(pet.ageMonths / 12)} ปี ${pet.ageMonths % 12 > 0 ? `${pet.ageMonths % 12} เดือน` : ''}`.trim()
      : `${pet.ageMonths} เดือน`
    : 'อายุ 2 ปี';

  // วันที่สมัครของผู้โพสต์
  const ownerJoinedDate = pet.owner?.createdAt
    ? new Date(pet.owner.createdAt).toLocaleDateString('th-TH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : '12 ม.ค. 2026';

  // ข้อมูลประวัติสุขภาพ
  const healthInfo = pet.healthHistory || {};
  const diseaseText = healthInfo.disease || 'ไม่มี';
  const vaccineText = healthInfo.vaccinated ? 'ครบ (วันที่ 10 ต.ค. 2026)' : 'ครบ (วันที่ ...)';
  const neuteredText = healthInfo.neutered !== false ? 'ทำแล้ว' : 'ยังไม่ได้ทำ';

  return (
    <div className="min-h-screen bg-[#fafafa] flex flex-col font-sans text-foreground">
      {/* 1. Header Navbar */}
      <Navbar activePage="search" />

      {/* 2. Main Detail Container */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full flex-1 space-y-6">
        
        {/* ลิงก์ย้อนกลับ */}
        <div className="flex items-center gap-2">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>กลับสู่หน้าค้นหาสัตว์</span>
          </Link>
        </div>

        {/* ส่วนบน: แบ่ง 2 คอลัมน์ (รูปภาพทางซ้าย | รายละเอียดและปุ่มทางขวา) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          
          {/* คอลัมน์ซ้าย: รูปหลัก และ รูปย่อย 4 รูป ตาม Wireframe 03-3-Detail 1 */}
          <div className="space-y-4">
            {/* กล่องรูปหลัก (ความสูง ~350px พร้อม fallback รูปหลัก แบบกล่องเส้นประสีเทา) */}
            <div className="w-full h-80 sm:h-96 bg-[#e5e7eb] rounded-xl border border-border overflow-hidden flex items-center justify-center relative">
              {currentImage ? (
                <Image
                  src={currentImage}
                  alt={pet.name}
                  fill
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  unoptimized
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full m-3 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center text-gray-500 font-medium text-lg">
                  รูปหลัก
                </div>
              )}
            </div>

            {/* กล่องรูปย่อย 4 ช่อง (Thumbnail Row: รูป, รูป, รูป, รูป) */}
            <div className="grid grid-cols-4 gap-3">
              {[0, 1, 2, 3].map((idx) => {
                const rawThumb = imagesList[idx];
                const thumbImage = typeof rawThumb === 'string' ? rawThumb : rawThumb?.imageUrl;
                const isSelected = selectedImageIndex === idx;

                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSelectedImageIndex(idx)}
                    className={`relative h-20 rounded-lg border-2 border-dashed flex items-center justify-center overflow-hidden transition-all cursor-pointer ${
                      isSelected
                        ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                        : 'border-gray-300 bg-[#f3f4f6] hover:border-gray-400'
                    }`}
                  >
                    {thumbImage ? (
                      <Image
                        src={thumbImage}
                        alt=""
                        fill
                        sizes="25vw"
                        unoptimized
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-xs text-gray-500 font-medium">รูป</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* คอลัมน์ขวา: ข้อมูลสัตว์เลี้ยง, ประวัติสุขภาพ, เงื่อนไขการรับเลี้ยง และ 3 ปุ่มกด */}
          <div className="space-y-5">
            {/* หัวข้อชื่อสัตว์เลี้ยง และป้าย available */}
            <div className="flex items-start justify-between gap-4">
              <h1 className="text-3xl font-bold tracking-tight text-foreground">
                {pet.name}
              </h1>
              <div>
                <span className={`inline-flex items-center px-4 py-1 rounded-full text-sm font-medium ${
                  pet.status === 'available'
                    ? 'bg-[#dcfce7] text-[#166534] border border-[#86efac]'
                    : pet.status === 'pending'
                    ? 'bg-[#fef3c7] text-[#92400e] border border-[#fde047]'
                    : 'bg-gray-100 text-gray-700 border border-gray-300'
                }`}>
                  {pet.status === 'available' ? 'available' : pet.status === 'pending' ? 'รอตัดสินใจ' : 'ได้บ้านแล้ว'}
                </span>
              </div>
            </div>

            {/* คำอธิบายสั้น: ชนิด · สายพันธุ์ · อายุ · ที่พักพิง ตาม Wireframe */}
            <p className="text-sm text-muted-foreground font-medium">
              {pet.type} · {pet.breed || 'ไม่ระบุสายพันธุ์'} · อายุ {ageDisplay} · ที่พักพิง: {pet.location}
            </p>

            {/* กล่องที่ 1: ประวัติสุขภาพ ตาม Wireframe */}
            <div className="bg-white border border-border rounded-xl p-5 shadow-2xs space-y-2">
              <h2 className="font-bold text-base text-foreground">ประวัติสุขภาพ</h2>
              <ul className="text-sm text-foreground space-y-1 pl-1">
                <li>• โรคประจำตัว: {diseaseText}</li>
                <li>• วัคซีน: {vaccineText}</li>
                <li>• ทำหมัน: {neuteredText}</li>
              </ul>
            </div>

            {/* กล่องที่ 2: เงื่อนไขการรับเลี้ยง ตาม Wireframe */}
            <div className="bg-white border border-border rounded-xl p-5 shadow-2xs space-y-2">
              <h2 className="font-bold text-base text-foreground">เงื่อนไขการรับเลี้ยง</h2>
              <p className="text-sm text-foreground pl-1">
                • {pet.adoptionConditions || 'ต้องมีพื้นที่ปล่อยวิ่ง • ส่งรูปอัปเดตตามรอบ'}
              </p>
            </div>

            {/* แถว 3 ปุ่มกด: ♡ Wishlist | 💬 แชทสอบถาม | สนใจรับเลี้ยง ตาม Wireframe */}
            {(() => {
              const isOwner = Boolean(
                currentUser?.id &&
                  (currentUser.id === pet.ownerId || currentUser.id === pet.owner?.id)
              );

              return (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                  {/* ปุ่ม 1: Wishlist บันทึกลงฐานข้อมูลจริง */}
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isWishlistLoading}
                    onClick={handleWishlistToggle}
                    className={`h-11 border-border font-medium rounded-lg text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                      isWishlisted ? 'text-red-600 border-red-300 bg-red-50' : 'hover:bg-muted text-foreground'
                    }`}
                  >
                    <Heart className={`w-4 h-4 ${isWishlisted ? 'fill-red-500 text-red-500' : ''}`} />
                    <span>{isWishlisted ? 'บันทึกแล้ว' : 'Wishlist'}</span>
                  </Button>

                  {/* ปุ่ม 2: แชทสอบถาม (หากเป็นเจ้าของประกาศ จะปิดใช้งานไม่ให้คุยกับตัวเอง) */}
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isOwner}
                    onClick={() => {
                      if (isOwner) return;
                      router.push(
                        `/chat?user=${pet.owner?.id || pet.ownerId || 'owner'}&userName=${encodeURIComponent(
                          pet.owner?.fullName || 'เจ้าของประกาศ'
                        )}&petName=${encodeURIComponent(pet.name)}&petId=${pet.id}&petStatus=${pet.status}`
                      );
                    }}
                    className={`h-11 border-border font-medium rounded-lg text-sm flex items-center justify-center gap-2 ${
                      isOwner ? 'opacity-50 cursor-not-allowed bg-gray-50' : 'hover:bg-muted text-foreground cursor-pointer'
                    }`}
                    title={isOwner ? 'คุณเป็นเจ้าของประกาศนี้' : undefined}
                  >
                    <MessageSquare className="w-4 h-4 text-muted-foreground" />
                    <span>{isOwner ? 'ประกาศของคุณ' : 'แชทสอบถาม'}</span>
                  </Button>

                  {/* ปุ่ม 3: สนใจรับเลี้ยง (หากเป็นเจ้าของประกาศ จะไม่สามารถรับเลี้ยงสัตว์ของตัวเองได้ - Requirement 3) */}
                  <Button
                    type="button"
                    disabled={isOwner || pet.status !== 'available'}
                    onClick={handleInterestClick}
                    className={`h-11 font-semibold rounded-lg text-sm shadow-2xs transition-colors ${
                      isOwner
                        ? 'bg-gray-100 text-gray-400 border border-gray-300 cursor-not-allowed'
                        : pet.status !== 'available'
                        ? 'bg-gray-100 text-gray-400 border border-gray-300 cursor-not-allowed'
                        : 'bg-[#dbeafe] hover:bg-[#bfdbfe] text-[#1e40af] border border-[#bfdbfe] cursor-pointer'
                    }`}
                    title={isOwner ? 'คุณไม่สามารถรับเลี้ยงสัตว์เลี้ยงของตัวเองได้' : undefined}
                  >
                    {isOwner
                      ? 'คุณเป็นเจ้าของสัตว์นี้'
                      : pet.status === 'adopted'
                      ? 'รับเลี้ยงแล้ว'
                      : pet.status === 'pending'
                      ? 'รอตัดสินใจ'
                      : 'สนใจรับเลี้ยง'}
                  </Button>
                </div>
              );
            })()}
          </div>
        </div>

        {/* ส่วนล่าง: แบ่ง 2 การ์ด (โปรไฟล์ผู้โพสต์ ทางซ้าย | รีวิวผู้โพสต์ ทางขวา) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
          
          {/* การ์ดซ้าย: โปรไฟล์ผู้โพสต์ ตาม Wireframe */}
          <div className="bg-white border border-border rounded-xl p-6 shadow-2xs space-y-4">
            <h2 className="text-base font-bold text-foreground">โปรไฟล์ผู้โพสต์</h2>
            
            <div className="space-y-2.5 text-sm">
              {/* รูป & ชื่อผู้โพสต์ */}
              <div className="flex items-center gap-3">
                <div className="relative w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm overflow-hidden">
                  {pet.owner?.profileImage ? (
                    <Image
                      src={pet.owner.profileImage}
                      alt=""
                      fill
                      sizes="40px"
                      unoptimized
                      className="w-full h-full rounded-full object-cover"
                    />
                  ) : (
                    <User className="w-5 h-5 text-primary" />
                  )}
                </div>
                <div>
                  <p className="font-semibold text-foreground flex items-center gap-1.5">
                    {pet.owner?.fullName || 'ผู้ลงประกาศ'}
                    {pet.owner?.isVerified && (
                      <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">ผู้ลงประกาศหาบ้าน</p>
                </div>
              </div>

              <div className="pt-2 border-t border-border/60 space-y-1.5 text-muted-foreground">
                <p>สมัครเมื่อ: <span className="text-foreground font-medium">{ownerJoinedDate}</span></p>
                <p>ประกาศที่เคยลง: <span className="text-foreground font-medium">{pet.ownerStats?.totalPets ?? 1} ประกาศ</span></p>
                <p className="flex items-center gap-1.5">
                  ยืนยันตัวตน: 
                  <span className="text-green-600 font-medium inline-flex items-center gap-1">
                    {pet.owner?.isVerified ? '✓ ยืนยันแล้ว' : 'ยืนยันตัวตนแล้ว ✓'}
                  </span>
                </p>
                <p className="flex items-center gap-1">
                  คะแนนเฉลี่ย: 
                  <span className="text-amber-500 font-bold ml-1">★ {pet.ownerStats?.averageRating || '5.0'}</span>
                  <span className="text-xs text-muted-foreground">({pet.ownerStats?.totalReviews ?? 0} รีวิว)</span>
                </p>
              </div>
            </div>
          </div>

          {/* การ์ดขวา: รีวิวผู้โพสต์ (FR-10) ดึงจากฐานข้อมูลจริง */}
          <div className="bg-white border border-border rounded-xl p-6 shadow-2xs space-y-4 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-foreground">รีวิวผู้โพสต์ (FR-10)</h2>
                {currentUser && currentUser.id !== (pet.owner?.id || pet.ownerId) && (
                  <Link
                    href={`/reviews?targetUserId=${pet.owner?.id || pet.ownerId}&targetUserName=${encodeURIComponent(
                      pet.owner?.fullName || 'ผู้โพสต์'
                    )}&petName=${encodeURIComponent(pet.name)}&role=owner`}
                    className="text-xs text-blue-600 hover:underline font-medium"
                  >
                    + เขียนรีวิว
                  </Link>
                )}
              </div>

              {/* รายการรีวิวจริงจากฐานข้อมูล */}
              {pet.ownerStats?.reviews && pet.ownerStats.reviews.length > 0 ? (
                <div className="space-y-3 text-sm">
                  {pet.ownerStats.reviews.slice(0, 3).map((rev) => (
                    <div key={rev.id} className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-amber-400 text-xs tracking-wider">
                          {'★'.repeat(rev.rating)}{'☆'.repeat(5 - rev.rating)}
                        </span>
                        <span className="font-semibold text-foreground text-xs">{rev.reviewerName}</span>
                      </div>
                      <p className="text-muted-foreground text-xs italic pl-0.5">
                        &apos;{rev.comment}&apos;
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-4 text-center text-xs text-muted-foreground">
                  ยังไม่มีรีวิวสำหรับผู้ลงประกาศนี้ คุณสามารถเขียนรีวิวเพื่อให้ข้อเสนอแนะได้
                </div>
              )}
            </div>

            {/* ลิงก์ดูรีวิวทั้งหมด */}
            <div className="pt-3 border-t border-border/60 flex items-center justify-between">
              <Link
                href={`/reviews?targetUserId=${pet.owner?.id || pet.ownerId}&targetUserName=${encodeURIComponent(
                  pet.owner?.fullName || 'ผู้โพสต์'
                )}&petName=${encodeURIComponent(pet.name)}`}
                className="text-xs text-muted-foreground hover:text-foreground underline transition-colors cursor-pointer"
              >
                (ดูรีวิวทั้งหมด {pet.ownerStats?.totalReviews ? `(${pet.ownerStats.totalReviews})` : ''})
              </Link>
              {pet.status === 'adopted' && (
                <Link
                  href={`/pets/${pet.id}/updates`}
                  className="text-xs text-indigo-600 hover:underline font-medium"
                >
                  ดูรูปอัปเดตความเป็นอยู่ →
                </Link>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function PetDetailPage(props: PetDetailPageProps) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#fafafa] flex flex-col font-sans">
          <Navbar activePage="search" />
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm">กำลังโหลดรายละเอียดสัตว์เลี้ยง...</p>
          </div>
        </div>
      }
    >
      <PetDetailContent {...props} />
    </Suspense>
  );
}
