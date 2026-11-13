// src/app/pets/[id]/updates/page.tsx
'use client';

import { useState, useEffect, useRef, use, Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { X, UploadCloud, ChevronDown, Check, Loader2, CheckCircle2 } from 'lucide-react';
import Navbar from '@/components/Navbar';
import { api } from '@/lib/api';
import { PET_UPDATE_PERIODS, type Pet, type PetOwner, type PetUpdatePeriod } from '@/types/pet';

type AuthenticatedUser = Pick<PetOwner, 'id'>;

interface ApiErrorDetails {
  code?: string;
  message?: string;
}

function getApiErrorDetails(value: unknown): ApiErrorDetails {
  if (!value || typeof value !== 'object' || !('error' in value)) return {};
  const error = value.error;
  if (!error || typeof error !== 'object') return {};
  return {
    code: 'code' in error && typeof error.code === 'string' ? error.code : undefined,
    message: 'message' in error && typeof error.message === 'string' ? error.message : undefined,
  };
}

interface PetUpdatesPageProps {
  params: Promise<{ id: string }>;
}

interface PetUpdateItem {
  id: string;
  petId: string;
  period: PetUpdatePeriod;
  description?: string | null;
  images: string[];
  createdAt: string;
}

interface SelectedImage {
  file: File;
  previewUrl: string;
}

function PetUpdatesContent({ params }: PetUpdatesPageProps) {
  const { id } = use(params);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imagePreviewUrls = useRef(new Set<string>());

  const [pet, setPet] = useState<Pet | null>(null);
  const [currentUser, setCurrentUser] = useState<AuthenticatedUser | null>(null);
  const [period, setPeriod] = useState<PetUpdatePeriod>('1m');
  const [isPeriodOpen, setIsPeriodOpen] = useState(false);
  const periodDropdownRef = useRef<HTMLDivElement>(null);

  const [images, setImages] = useState<SelectedImage[]>([]);
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);

  // ข้อมูลอัปเดตจริงจากฐานข้อมูล
  const [realUpdates, setRealUpdates] = useState<PetUpdateItem[]>([]);
  const [loadingUpdates, setLoadingUpdates] = useState(true);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (periodDropdownRef.current && !periodDropdownRef.current.contains(event.target as Node)) {
        setIsPeriodOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => () => {
    imagePreviewUrls.current.forEach((url) => URL.revokeObjectURL(url));
    imagePreviewUrls.current.clear();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadPetAndUpdates = async () => {
      try {
        const authRes = await api.auth.me().catch(() => null);
        if (!cancelled && authRes?.success && authRes.user) {
          setCurrentUser(authRes.user);
        }

        const petRes = await api.pets.getById(id);
        if (!cancelled && petRes.success && petRes.data) {
          setPet(petRes.data);
        }

        if (cancelled) return;
        setLoadingUpdates(true);
        const updatesRes = await api.petUpdates.getForPet(id);
        if (!cancelled) {
          setRealUpdates(
            updatesRes.success && Array.isArray(updatesRes.data) ? updatesRes.data : []
          );
        }
      } catch (err) {
        if (!cancelled) console.error('Failed to load pet and updates:', err);
      } finally {
        if (!cancelled) setLoadingUpdates(false);
      }
    };

    void loadPetAndUpdates();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleImageUpload = (files: FileList | null) => {
    if (!files) return;
    const remainingSlots = Math.max(0, 5 - images.length);
    const selectedImages = Array.from(files).slice(0, remainingSlots).map((file) => {
      const previewUrl = URL.createObjectURL(file);
      imagePreviewUrls.current.add(previewUrl);
      return { file, previewUrl };
    });
    setImages((current) => [...current, ...selectedImages].slice(0, 5));
  };

  const removeImage = (index: number) => {
    const removedImage = images[index];
    if (removedImage) {
      URL.revokeObjectURL(removedImage.previewUrl);
      imagePreviewUrls.current.delete(removedImage.previewUrl);
    }
    setImages((prev) => prev.filter((_, idx) => idx !== index));
  };

  const isImagesValid = images.length >= 3;

  // ส่งรูปภาพอัปเดตลงฐานข้อมูลจริง
  const handleSubmitUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setHasAttemptedSubmit(true);
    setUpdateError(null);

    if (!isImagesValid) return;

    setIsSubmitting(true);
    try {
      const periodLabel = PET_UPDATE_PERIODS.find((item) => item.value === period)?.label || period;
      const res = await api.petUpdates.create(id, {
        period,
        description: `อัปเดตความเป็นอยู่รอบ ${periodLabel}`,
        images: images.map(({ file }) => file),
      });

      if (res.success) {
        // แจ้งเตือนเจ้าของเดิมผ่านแชทเมื่อส่งรูปอัปเดตเรียบร้อย
        const ownerId = pet?.owner?.id || pet?.ownerId;
        if (ownerId && ownerId !== currentUser?.id) {
          await api.messages.sendMessage({
            receiverId: ownerId,
            petId: id,
            message: `📷 มีการส่งรูปภาพอัปเดตความเป็นอยู่ของน้อง '${petName}' รอบ ${periodLabel} เรียบร้อยแล้ว สามารถคลิกดูอัปเดตได้เลยครับ/ค่ะ`,
          }).catch(() => null);
        }

        setActionNotice(`ส่งรูปภาพอัปเดตความเป็นอยู่รอบ '${periodLabel}' เรียบร้อยแล้ว`);
        images.forEach(({ previewUrl }) => URL.revokeObjectURL(previewUrl));
        imagePreviewUrls.current.clear();
        setImages([]);
        setHasAttemptedSubmit(false);
        // รีเฟรชรายการอัปเดตจริงจากฐานข้อมูล
        const updatesRes = await api.petUpdates.getForPet(id);
        if (updatesRes.success && Array.isArray(updatesRes.data)) {
          setRealUpdates(updatesRes.data);
        }
        setTimeout(() => {
          setActionNotice(null);
        }, 4000);
      } else {
        const errorDetails = getApiErrorDetails(res);
        const errorCode = errorDetails.code;
        let msg = res.message || errorDetails.message || 'ไม่สามารถส่งรูปภาพอัปเดตได้';
        if (errorCode === 'PET_NOT_ADOPTED') {
          msg = 'สัตว์เลี้ยงต้องมีสถานะได้รับเลี้ยงแล้ว (Adopted) ถึงจะส่งรูปอัปเดตได้';
        } else if (errorCode === 'FORBIDDEN') {
          msg = 'เฉพาะผู้ที่ได้รับการคัดเลือกให้รับเลี้ยงสัตว์เลี้ยงตัวนี้เท่านั้นที่สามารถส่งรูปอัปเดตได้';
        } else if (errorCode === 'INVALID_IMAGES') {
          msg = 'ต้องอัปโหลดรูปภาพ 3 ถึง 5 รูป (ไฟล์ JPEG หรือ PNG เท่านั้น)';
        } else if (errorCode === 'UNAUTHORIZED') {
          msg = 'กรุณาเข้าสู่ระบบก่อนส่งรูปภาพอัปเดต';
        }
        setUpdateError(msg);
      }
    } catch {
      setUpdateError('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setIsSubmitting(false);
    }
  };

  const petName = pet?.name || 'โมจิ';

  // ค้นหารูปภาพของรอบที่ระบุจากฐานข้อมูล
  const getUpdatesForPeriod = (periodName: PetUpdatePeriod) => {
    return realUpdates.filter((u) => u.period === periodName);
  };

  const isOwner = Boolean(
    currentUser?.id && (currentUser.id === pet?.ownerId || currentUser.id === pet?.owner?.id)
  );

  return (
    <div className="min-h-screen bg-white flex flex-col font-sans text-foreground">
      {/* 1. Header Navbar */}
      <Navbar activePage="my-pets" />

      {/* 2. Main Content (Requirement 2: ในหน้าอัพเดต ให้แสดงเฉพาะมุมมองของคุณ - Adopter หรือ Owner) */}
      <main className="max-w-4xl mx-auto px-6 sm:px-10 py-8 w-full flex-1 space-y-6">
        
        {/* Navigation Breadcrumb */}
        <div className="flex items-center justify-between pb-2 border-b border-gray-200">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Link href="/pets" className="hover:text-primary transition-colors">
              ประกาศของฉัน
            </Link>
            <span>/</span>
            <Link href={`/pets/${id}`} className="hover:text-primary transition-colors">
              {petName}
            </Link>
            <span>/</span>
            <span className="text-gray-900 font-medium">อัปเดตความเป็นอยู่</span>
          </div>

          <Link
            href="/pets"
            className="text-xs text-blue-600 hover:underline"
          >
            ← กลับไปหน้ารายการ
          </Link>
        </div>

        {/* แถบแจ้งเตือน Toast */}
        {actionNotice && (
          <div className="p-3 rounded-lg text-sm bg-green-50 border border-green-200 text-green-800 flex items-center justify-between animate-in fade-in">
            <span className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              {actionNotice}
            </span>
            <button type="button" onClick={() => setActionNotice(null)}>
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ตรวจสอบมุมมอง: ถ้าเป็นเจ้าของประกาศ แสดงเฉพาะมุมมองผู้หาบ้าน ถ้าเป็นผู้รับเลี้ยง แสดงเฉพาะมุมมองผู้รับเลี้ยง */}
        {isOwner ? (
          /* ============================================================ */
          /* มุมมองผู้หาบ้าน: อัปเดตของสัตว์เลี้ยง (สำหรับเจ้าของเดิม) */
          /* ============================================================ */
          <div className="border border-gray-300 bg-white rounded-xl p-6 sm:p-8 space-y-6 shadow-sm">
            <div className="border-b border-gray-200 pb-4">
              <h1 className="text-xl font-bold text-gray-900 tracking-tight">
                มุมมองผู้หาบ้าน: อัปเดตของ{petName}
              </h1>
              <p className="text-xs sm:text-sm text-gray-500 mt-1">
                ติดตามพัฒนาการและรูปภาพความเป็นอยู่ของ {petName} ที่ส่งมาจากผู้รับเลี้ยง
              </p>
            </div>

            {loadingUpdates ? (
              <div className="py-16 flex flex-col items-center justify-center text-gray-400 text-sm gap-2">
                <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                <span>กำลังโหลดข้อมูลอัปเดต...</span>
              </div>
            ) : (
              <div className="space-y-6">
                {PET_UPDATE_PERIODS.map(({ value, label }) => {
                  const updatesForThisPeriod = getUpdatesForPeriod(value);
                  const hasUpdates = updatesForThisPeriod.length > 0;
                  const allImages = updatesForThisPeriod.flatMap((u) => u.images);

                  return (
                    <div key={value} className="border border-gray-200 rounded-lg p-5 space-y-3 bg-gray-50/40">
                      <div className="flex items-center justify-between">
                        <h3 className="text-base font-bold text-gray-900">
                          รอบ {label}
                        </h3>
                        {hasUpdates ? (
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800">
                            ได้รับอัปเดตแล้ว
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full text-xs text-gray-500 bg-gray-100">
                            ยังไม่มีอัปเดต
                          </span>
                        )}
                      </div>

                      {hasUpdates && allImages.length > 0 ? (
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            {allImages.map((imgUrl, imgIdx) => (
                              <div
                                key={imgIdx}
                                className="h-28 border border-gray-200 rounded-lg overflow-hidden bg-white shadow-2xs group relative"
                              >
                                <Image
                                  src={imgUrl}
                                  alt={`อัปเดต ${label} รูปที่ ${imgIdx + 1}`}
                                  fill
                                  sizes="(max-width: 640px) 50vw, 25vw"
                                  unoptimized
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                />
                              </div>
                            ))}
                          </div>
                          {updatesForThisPeriod[0]?.description && (
                            <p className="text-xs sm:text-sm text-gray-700 bg-white p-3 rounded-md border border-gray-200">
                              💬 &quot;{updatesForThisPeriod[0].description}&quot;
                            </p>
                          )}
                        </div>
                      ) : (
                        <div className="w-full h-16 border-2 border-dashed border-gray-200 rounded-lg flex items-center justify-center text-gray-400 text-xs font-medium bg-white">
                          ยังไม่มีการส่งรูปภาพอัปเดตในรอบนี้
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          /* ============================================================ */
          /* มุมมองผู้รับเลี้ยง: ส่งรูปอัปเดต (สำหรับผู้รับเลี้ยง) */
          /* ============================================================ */
          <div className="space-y-8">
            <div className="border border-gray-300 bg-white rounded-xl p-6 sm:p-8 space-y-6 shadow-sm">
              <div className="border-b border-gray-200 pb-4">
                <h1 className="text-xl font-bold text-gray-900 tracking-tight">
                  มุมมองผู้รับเลี้ยง: ส่งรูปอัปเดต – {petName}
                </h1>
                <p className="text-xs sm:text-sm text-gray-500 mt-1">
                  อัปโหลดรูปภาพความเป็นอยู่ของ {petName} (3-5 รูป) ตามเงื่อนไขและข้อตกลงในการรับเลี้ยง
                </p>
              </div>

              <form onSubmit={handleSubmitUpdate} className="space-y-5">
                {/* รอบอัปเดต */}
                <div className="space-y-1.5 relative max-w-xs" ref={periodDropdownRef}>
                  <label className="block text-xs sm:text-sm font-semibold text-gray-800">
                    รอบอัปเดต
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsPeriodOpen((prev) => !prev)}
                    className="w-full h-10 px-3 bg-white rounded-md text-sm text-left flex items-center justify-between border border-gray-400 hover:border-gray-500 transition-colors cursor-pointer"
                  >
                    <span className="text-gray-900">
                      {PET_UPDATE_PERIODS.find((item) => item.value === period)?.label}
                    </span>
                    <ChevronDown className="w-4 h-4 text-gray-500" />
                  </button>

                  {isPeriodOpen && (
                    <div className="absolute top-full left-0 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg py-1 z-30 animate-in fade-in zoom-in-95">
                      {PET_UPDATE_PERIODS.map(({ value, label }) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => {
                            setPeriod(value);
                            setIsPeriodOpen(false);
                          }}
                          className={`w-full text-left px-3.5 py-2 text-sm flex items-center justify-between hover:bg-gray-100 cursor-pointer ${
                            period === value ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-800'
                          }`}
                        >
                          <span>{label}</span>
                          {period === value && <Check className="w-4 h-4 text-blue-600" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* กล่องลากรูปมาวาง (3-5 รูป) */}
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/jpeg,image/png"
                  className="hidden"
                  onChange={(e) => handleImageUpload(e.target.files)}
                />

                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    handleImageUpload(e.dataTransfer.files);
                  }}
                  className="w-full h-44 border-2 border-dashed border-gray-400 rounded-lg flex flex-col items-center justify-center text-center p-4 cursor-pointer hover:border-gray-500 bg-gray-50/40 transition-colors"
                >
                  <UploadCloud className="w-8 h-8 text-gray-400 mb-2" />
                  <p className="text-sm text-gray-600 font-medium">
                    ลากรูปมาวาง (3-5 รูป)
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    หรือคลิกเพื่อเลือกรูปภาพจากเครื่อง (เลือกได้สูงสุด 5 รูป)
                  </p>
                </div>

                {/* Preview slots (3-5 slots) */}
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                  {[0, 1, 2, 3, 4].map((slotIdx) => {
                    const img = images[slotIdx]?.previewUrl;
                    return (
                      <div
                        key={slotIdx}
                        className="h-24 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center text-gray-400 text-xs font-medium bg-gray-50 overflow-hidden relative"
                      >
                        {img ? (
                          <>
                            <Image
                              src={img}
                              alt=""
                              fill
                              sizes="(max-width: 640px) 33vw, 20vw"
                              unoptimized
                              className="w-full h-full object-cover"
                            />
                            <button
                              type="button"
                              onClick={() => removeImage(slotIdx)}
                              className="absolute top-1 right-1 w-5 h-5 bg-black/60 rounded-full text-white flex items-center justify-center text-xs hover:bg-black/80"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </>
                        ) : (
                          <span>รูปที่ {slotIdx + 1} {slotIdx < 3 ? '*' : ''}</span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Red Notice / เหตุผลที่ไม่สามารถส่งอัปเดตได้ */}
                {hasAttemptedSubmit && !isImagesValid && (
                  <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-medium space-y-1">
                    <p className="font-semibold">ไม่สามารถส่งอัปเดตได้เนื่องจาก:</p>
                    <p>• ต้องอัปโหลดรูปภาพอย่างน้อย 3 รูป (ปัจจุบันอัปโหลดแล้ว {images.length}/3 รูป)</p>
                  </div>
                )}

                {updateError && (
                  <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-semibold">
                    ไม่สามารถส่งอัปเดตได้: {updateError}
                  </div>
                )}

                {/* ปุ่ม ส่งอัปเดต */}
                <div className="pt-2 flex justify-end">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-8 h-10 bg-[#dbeafe] hover:bg-[#bfdbfe] text-[#1e40af] border border-[#bfdbfe] font-medium rounded-lg text-sm shadow-2xs transition-colors cursor-pointer active:scale-95 disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>กำลังส่ง...</span>
                      </span>
                    ) : (
                      <span>ส่งอัปเดต</span>
                    )}
                  </button>
                </div>
              </form>
            </div>

            {/* ประวัติการอัปเดตที่เคยส่งแล้ว */}
            {realUpdates.length > 0 && (
              <div className="border border-gray-300 bg-white rounded-xl p-6 sm:p-8 space-y-4 shadow-sm">
                <h2 className="text-base font-bold text-gray-900">
                  ประวัติการส่งรูปอัปเดตของคุณ
                </h2>
                <div className="space-y-4">
                  {realUpdates.map((item) => (
                    <div key={item.id} className="border border-gray-200 rounded-lg p-4 bg-gray-50/50 space-y-2">
                      <div className="flex items-center justify-between text-xs text-gray-600">
                        <span className="font-bold text-gray-900">
                          รอบ {PET_UPDATE_PERIODS.find((option) => option.value === item.period)?.label || item.period}
                        </span>
                        <span>{new Date(item.createdAt).toLocaleDateString('th-TH')}</span>
                      </div>
                      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                        {item.images.map((imgUrl, idx) => (
                          <div key={idx} className="relative h-20 rounded-md overflow-hidden border border-gray-200">
                            <Image
                              src={imgUrl}
                              alt=""
                              fill
                              sizes="(max-width: 640px) 33vw, 20vw"
                              unoptimized
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default function PetUpdatesPage({ params }: PetUpdatesPageProps) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-white flex flex-col font-sans">
          <Navbar activePage="my-pets" />
          <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
            กำลังโหลดข้อมูลอัปเดต...
          </div>
        </div>
      }
    >
      <PetUpdatesContent params={params} />
    </Suspense>
  );
}
