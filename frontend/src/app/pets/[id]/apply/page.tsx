// src/app/pets/[id]/apply/page.tsx
'use client';

import { useState, useEffect, useRef, use, Suspense } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, ArrowLeft, CheckCircle2, AlertCircle, ChevronDown, Check } from 'lucide-react';
import Navbar from '@/components/Navbar';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';

interface ApplyPageProps {
  params: Promise<{ id: string }>;
}

const HOUSING_OPTIONS = [
  'เลือก *',
  'บ้านเดี่ยว (มีรั้ว)',
  'บ้านเดี่ยว (ไม่มีรั้ว)',
  'ทาวน์โฮม / ตึกแถว',
  'คอนโดมิเนียม (Pet-Friendly)',
  'หอพัก / อพาร์ตเมนต์',
  'อื่นๆ',
];

const INCOME_RANGE_OPTIONS = [
  'เลือกช่วงรายได้ *',
  'ต่ำกว่า 20,000 บาท/เดือน',
  '20,000 - 35,000 บาท/เดือน',
  '35,000 - 50,000 บาท/เดือน',
  '50,000 - 70,000 บาท/เดือน',
  'มากกว่า 70,000 บาท/เดือน',
];

function ApplyFormContent({ params }: ApplyPageProps) {
  const { id } = use(params);
  const router = useRouter();

  // Authentication & Pet State
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [pet, setPet] = useState<any>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [isLoadingPet, setIsLoadingPet] = useState(true);

  // Form Fields State
  const [housingType, setHousingType] = useState('');
  const [petExperience, setPetExperience] = useState('');
  const [incomeRange, setIncomeRange] = useState('');
  const [householdMembers, setHouseholdMembers] = useState('');
  const [adoptionReason, setAdoptionReason] = useState('');
  const [agreeTerms, setAgreeTerms] = useState(false);

  // Custom Dropdown Open States
  const [isHousingOpen, setIsHousingOpen] = useState(false);
  const [isIncomeOpen, setIsIncomeOpen] = useState(false);
  const housingRef = useRef<HTMLDivElement>(null);
  const incomeRef = useRef<HTMLDivElement>(null);

  // Field Touched State
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // Validation & Submission State
  const [hasSubmittedAttempt, setHasSubmittedAttempt] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [generalError, setGeneralError] = useState('');

  const handleBlur = (field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (housingRef.current && !housingRef.current.contains(event.target as Node)) {
        setIsHousingOpen(false);
      }
      if (incomeRef.current && !incomeRef.current.contains(event.target as Node)) {
        setIsIncomeOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 1. ตรวจสอบว่าผู้ใช้ล็อกอินหรือยัง ถ้ายังให้ Redirect ไปที่ /login?redirect=...
  useEffect(() => {
    const verifyAuth = async () => {
      try {
        const res = await api.auth.me();
        if (res.success && res.user) {
          setCurrentUser(res.user);
        } else {
          router.replace(`/login?redirect=/pets/${id}/apply`);
          return;
        }
      } catch {
        router.replace(`/login?redirect=/pets/${id}/apply`);
        return;
      } finally {
        setIsAuthChecking(false);
      }
    };

    verifyAuth();
  }, [id, router]);

  // 2. ดึงข้อมูลสัตว์เลี้ยง
  useEffect(() => {
    const fetchPet = async () => {
      try {
        setIsLoadingPet(true);
        const res = await api.pets.getById(id);
        if (res.success && res.data) {
          setPet(res.data);
        }
      } catch (err) {
        console.error('Failed to load pet:', err);
      } finally {
        setIsLoadingPet(false);
      }
    };

    fetchPet();
  }, [id]);

  // ตรวจสอบความถูกต้องของแต่ละฟิลด์
  const isHousingValid = Boolean(housingType && housingType !== '' && housingType !== 'เลือก *');
  const isExperienceValid = Boolean(petExperience.trim());
  const isIncomeValid = Boolean(
    incomeRange && incomeRange !== '' && incomeRange !== 'เลือกช่วงรายได้ *' && incomeRange !== 'เลือก *'
  );
  const isHouseholdValid = Boolean(householdMembers.trim());
  const isReasonValid = Boolean(adoptionReason.trim());
  const isTermsValid = agreeTerms === true;

  const isFormValid =
    isHousingValid &&
    isExperienceValid &&
    isIncomeValid &&
    isHouseholdValid &&
    isReasonValid &&
    isTermsValid;

  // เงื่อนไขการแสดง Error แต่ละฟิลด์
  const showHousingError = (hasSubmittedAttempt || touched.housingType) && !isHousingValid;
  const showExperienceError = (hasSubmittedAttempt || touched.petExperience) && !isExperienceValid;
  const showIncomeError = (hasSubmittedAttempt || touched.incomeRange) && !isIncomeValid;
  const showHouseholdError = (hasSubmittedAttempt || touched.householdMembers) && !isHouseholdValid;
  const showReasonError = (hasSubmittedAttempt || touched.adoptionReason) && !isReasonValid;
  const showTermsError = hasSubmittedAttempt && !isTermsValid;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setHasSubmittedAttempt(true);
    setGeneralError('');

    if (!isFormValid) {
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await api.applications.submit({
        petId: id,
        applicantName: currentUser?.fullName || 'ผู้รับเลี้ยง',
        housingType,
        incomeRange,
        petExperience,
        householdMembers,
        adoptionReason,
        agreeTerms,
      });

      if (res.success) {
        // บันทึกความสนใจรับเลี้ยงลง localStorage เพื่อให้แสดงผลในหน้าแจ้งเตือน (Notifications) ทันที
        try {
          const newAppItem = {
            id: res.data?.id || `app-${Date.now()}`,
            applicantId: currentUser?.id || `user-${Date.now()}`,
            applicantName: currentUser?.fullName || 'ผู้สมัครใหม่',
            petId: id,
            petName: pet?.name || 'สัตว์เลี้ยง',
            petStatus: pet?.status || 'available',
            housing: housingType,
            experience: petExperience,
            income: incomeRange,
            householdMembers: householdMembers ? parseInt(householdMembers, 10) || 1 : 1,
            time: 'เมื่อสักครู่',
            status: 'pending',
          };
          const saved = JSON.parse(localStorage.getItem('pethome_new_applications') || '[]');
          localStorage.setItem('pethome_new_applications', JSON.stringify([newAppItem, ...saved]));
        } catch (e) {
          console.error('Error saving local notification:', e);
        }

        setSubmitSuccess(true);
        setTimeout(() => {
          router.push(`/pets/${id}`);
        }, 2200);
      } else {
        const errorCode = (res as any)?.error?.code;
        let msg = res.message || (res as any)?.error?.message || 'ไม่สามารถส่งแบบประเมินความพร้อมรับเลี้ยงได้';
        if (errorCode === 'APPLICATION_ALREADY_SUBMITTED') {
          msg = 'คุณได้ส่งใบสมัครขอรับเลี้ยงสัตว์เลี้ยงตัวนี้ไปแล้ว ไม่สามารถส่งซ้ำได้';
        } else if (errorCode === 'FORBIDDEN' || (res as any)?.error?.message?.includes('own pet')) {
          msg = 'คุณไม่สามารถยื่นขอรับเลี้ยงสัตว์เลี้ยงของตนเองได้';
        } else if (errorCode === 'UNAUTHORIZED') {
          msg = 'กรุณาเข้าสู่ระบบก่อนส่งแบบประเมิน';
        }
        setGeneralError(msg);
      }
    } catch {
      setGeneralError('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
    } finally {
      setIsSubmitting(false);
    }
  };

  // กำลังตรวจสอบสถานะการเข้าสู่ระบบ
  if (isAuthChecking || isLoadingPet) {
    return (
      <div className="min-h-screen bg-white flex flex-col font-sans">
        <Navbar activePage="search" />
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm">กำลังโหลดข้อมูลฟอร์มประเมินความพร้อมรับเลี้ยง...</p>
        </div>
      </div>
    );
  }

  // หากไม่พบสัตว์เลี้ยง
  if (!pet) {
    return (
      <div className="min-h-screen bg-white flex flex-col font-sans">
        <Navbar activePage="search" />
        <div className="flex-1 max-w-xl mx-auto px-4 py-20 text-center space-y-4">
          <AlertCircle className="w-12 h-12 text-destructive mx-auto" />
          <h2 className="text-2xl font-bold text-foreground">ไม่พบข้อมูลสัตว์เลี้ยง</h2>
          <p className="text-sm text-muted-foreground">ไม่พบสัตว์เลี้ยงที่ต้องการส่งแบบประเมินความพร้อมรับเลี้ยง</p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>กลับสู่หน้าหลัก</span>
          </Link>
        </div>
      </div>
    );
  }

  // Requirement 3: คุณไม่สามารถรับเลี้ยงสัตว์ของตัวเองได้ (You can't adopt your own pet)
  if (currentUser && pet && (currentUser.id === pet.ownerId || currentUser.id === pet.owner?.id)) {
    return (
      <div className="min-h-screen bg-white flex flex-col font-sans">
        <Navbar activePage="search" />
        <div className="flex-1 max-w-xl mx-auto px-4 py-20 text-center space-y-4">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto text-red-600">
            <AlertCircle className="w-10 h-10" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">ไม่สามารถรับเลี้ยงสัตว์ของตัวเองได้</h2>
          <p className="text-sm text-gray-600">
            คุณเป็นเจ้าของประกาศของน้อง <strong className="text-gray-900">{pet.name}</strong> จึงไม่สามารถยื่นแบบประเมินความพร้อมรับเลี้ยงสัตว์ของตัวเองได้
          </p>
          <div className="pt-4 flex justify-center gap-3">
            <Link
              href={`/pets/${id}`}
              className="inline-flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-800 px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>กลับไปหน้ารายละเอียด</span>
            </Link>
            <Link
              href="/pets"
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors shadow-2xs"
            >
              <span>ดูประกาศของคุณ</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // หน้าจอสำเร็จเมื่อส่งข้อมูลแล้ว
  if (submitSuccess) {
    return (
      <div className="min-h-screen bg-white flex flex-col font-sans">
        <Navbar activePage="search" />
        <div className="flex-1 max-w-2xl mx-auto px-4 py-24 text-center space-y-5">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto text-green-600">
            <CheckCircle2 className="w-10 h-10" />
          </div>
          <h2 className="text-2xl font-bold text-foreground">ส่งความสนใจรับเลี้ยงเรียบร้อยแล้ว!</h2>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            แบบประเมินความพร้อมสำหรับ <strong className="text-foreground">{pet.name}</strong> ถูกส่งไปยังผู้โพสต์ประกาศแล้ว
            เจ้าของสัตว์เลี้ยงจะได้รับการแจ้งเตือนและติดต่อกลับผ่านระบบ
          </p>
          <div className="pt-4 flex flex-wrap justify-center gap-3">
            <Link
              href={`/chat?user=${pet.owner?.id || pet.ownerId}&userName=${encodeURIComponent(
                pet.owner?.fullName || 'เจ้าของประกาศ'
              )}&petName=${encodeURIComponent(pet.name)}&petId=${pet.id}`}
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors shadow-2xs"
            >
              <span>แชทกับเจ้าของ</span>
            </Link>
            <Link
              href="/notifications"
              className="inline-flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-800 px-5 py-2.5 rounded-lg text-sm font-medium transition-colors border border-gray-300"
            >
              <span>ดูการแจ้งเตือน</span>
            </Link>
            <Link
              href={`/pets/${id}`}
              className="inline-flex items-center gap-2 bg-white hover:bg-gray-50 text-gray-700 px-5 py-2.5 rounded-lg text-sm font-medium border border-gray-300 transition-colors"
            >
              <span>กลับสู่หน้ารายละเอียดสัตว์เลี้ยง</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex flex-col font-sans text-foreground">
      {/* 1. Header Navbar ตาม Mockup */}
      <Navbar activePage="search" />

      {/* 2. Main Form Content ตาม Wireframe 04-4-Interest-form 1 */}
      <main className="max-w-5xl mx-auto px-6 sm:px-12 py-10 w-full flex-1">
        {/* หัวข้อฟอร์ม: ฟอร์มประเมินความพร้อมรับเลี้ยง – {ชื่อสัตว์} */}
        <h1 className="text-2xl font-bold text-gray-900 mb-8">
          ฟอร์มประเมินความพร้อมรับเลี้ยง – {pet.name}
        </h1>

        {generalError && (
          <div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm flex items-center gap-2">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{generalError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="space-y-6">
          {/* ฟิลด์ 1: ประเภทที่อยู่อาศัย * (คลิกเพื่อแสดงตัวเลือก แล้วคลิกเลือก) */}
          <div className="space-y-1.5" ref={housingRef}>
            <label className="block text-sm font-bold text-gray-800">
              ประเภทที่อยู่อาศัย *
            </label>
            <div className="flex items-center gap-3">
              <div className="relative w-full max-w-xl">
                <button
                  type="button"
                  onClick={() => {
                    setIsHousingOpen((prev) => !prev);
                    setIsIncomeOpen(false);
                  }}
                  className={`w-full h-10 px-3 bg-white rounded-md text-sm text-left flex items-center justify-between border transition-all cursor-pointer ${
                    showHousingError
                      ? 'border-red-400 focus:border-red-500'
                      : 'border-gray-300 hover:border-gray-400'
                  }`}
                >
                  <span className={housingType && housingType !== 'เลือก *' ? 'text-gray-900' : 'text-gray-500'}>
                    {housingType && housingType !== 'เลือก *' ? housingType : 'เลือก *'}
                  </span>
                  <ChevronDown
                    className={`w-4 h-4 text-gray-400 transition-transform duration-150 ${
                      isHousingOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {/* Dropdown Menu ตัวเลือกประเภทที่อยู่อาศัย */}
                {isHousingOpen && (
                  <div className="absolute top-full left-0 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg py-1.5 z-40 max-h-60 overflow-y-auto animate-in fade-in zoom-in-95 duration-100">
                    {HOUSING_OPTIONS.map((option) => {
                      const isSelected = housingType === option || (!housingType && option === 'เลือก *');
                      return (
                        <button
                          key={option}
                          type="button"
                          onClick={() => {
                            if (option === 'เลือก *') {
                              setHousingType('');
                            } else {
                              setHousingType(option);
                            }
                            setIsHousingOpen(false);
                            handleBlur('housingType');
                          }}
                          className={`w-full text-left px-3.5 py-2 text-sm flex items-center justify-between transition-colors cursor-pointer ${
                            isSelected
                              ? 'bg-blue-50 text-blue-700 font-medium'
                              : 'text-gray-800 hover:bg-gray-100'
                          }`}
                        >
                          <span>{option}</span>
                          {isSelected && <Check className="w-4 h-4 text-blue-600" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {showHousingError && (
                <span className="text-red-500 text-xs sm:text-sm font-normal shrink-0">
                  กรุณากรอกข้อมูลให้ครบ
                </span>
              )}
            </div>
          </div>

          {/* ฟิลด์ 2: ประสบการณ์เลี้ยงสัตว์ * */}
          <div className="space-y-1.5">
            <label htmlFor="petExperience" className="block text-sm font-bold text-gray-800">
              ประสบการณ์เลี้ยงสัตว์ *
            </label>
            <div className="flex items-center gap-3">
              <input
                id="petExperience"
                type="text"
                placeholder="เช่น เคยเลี้ยงสุนัข 3 ปี"
                value={petExperience}
                onChange={(e) => setPetExperience(e.target.value)}
                onBlur={() => handleBlur('petExperience')}
                className={`w-full max-w-xl h-10 px-3 bg-white rounded-md text-sm text-gray-900 border transition-colors focus:outline-hidden focus:ring-1 focus:ring-primary placeholder:text-gray-400 ${
                  showExperienceError
                    ? 'border-red-400 focus:border-red-500'
                    : 'border-gray-300 hover:border-gray-400'
                }`}
              />
              {showExperienceError && (
                <span className="text-red-500 text-xs sm:text-sm font-normal shrink-0">
                  กรุณากรอกข้อมูลให้ครบ
                </span>
              )}
            </div>
          </div>

          {/* ฟิลด์ 3: รายได้โดยประมาณ * (ปรับเป็น Select Range แบบคลิกเลือกช่วงรายได้) */}
          <div className="space-y-1.5" ref={incomeRef}>
            <label className="block text-sm font-bold text-gray-800">
              รายได้โดยประมาณ *
            </label>
            <div className="flex items-center gap-3">
              <div className="relative w-full max-w-xl">
                <button
                  type="button"
                  onClick={() => {
                    setIsIncomeOpen((prev) => !prev);
                    setIsHousingOpen(false);
                  }}
                  className={`w-full h-10 px-3 bg-white rounded-md text-sm text-left flex items-center justify-between border transition-all cursor-pointer ${
                    showIncomeError
                      ? 'border-red-400 focus:border-red-500'
                      : 'border-gray-300 hover:border-gray-400'
                  }`}
                >
                  <span className={incomeRange && incomeRange !== 'เลือกช่วงรายได้ *' ? 'text-gray-900' : 'text-gray-500'}>
                    {incomeRange && incomeRange !== 'เลือกช่วงรายได้ *' ? incomeRange : 'เลือกช่วงรายได้ *'}
                  </span>
                  <ChevronDown
                    className={`w-4 h-4 text-gray-400 transition-transform duration-150 ${
                      isIncomeOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {/* Dropdown Menu ตัวเลือกช่วงรายได้ */}
                {isIncomeOpen && (
                  <div className="absolute top-full left-0 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg py-1.5 z-40 max-h-60 overflow-y-auto animate-in fade-in zoom-in-95 duration-100">
                    {INCOME_RANGE_OPTIONS.map((option) => {
                      const isSelected = incomeRange === option || (!incomeRange && option === 'เลือกช่วงรายได้ *');
                      return (
                        <button
                          key={option}
                          type="button"
                          onClick={() => {
                            if (option === 'เลือกช่วงรายได้ *') {
                              setIncomeRange('');
                            } else {
                              setIncomeRange(option);
                            }
                            setIsIncomeOpen(false);
                            handleBlur('incomeRange');
                          }}
                          className={`w-full text-left px-3.5 py-2 text-sm flex items-center justify-between transition-colors cursor-pointer ${
                            isSelected
                              ? 'bg-blue-50 text-blue-700 font-medium'
                              : 'text-gray-800 hover:bg-gray-100'
                          }`}
                        >
                          <span>{option}</span>
                          {isSelected && <Check className="w-4 h-4 text-blue-600" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {showIncomeError && (
                <span className="text-red-500 text-xs sm:text-sm font-normal shrink-0">
                  กรุณากรอกข้อมูลให้ครบ
                </span>
              )}
            </div>
          </div>

          {/* ฟิลด์ 4: จำนวนสมาชิกในบ้าน / สัตว์เลี้ยงอื่น * */}
          <div className="space-y-1.5">
            <label htmlFor="householdMembers" className="block text-sm font-bold text-gray-800">
              จำนวนสมาชิกในบ้าน / สัตว์เลี้ยงอื่น *
            </label>
            <div className="flex items-center gap-3">
              <input
                id="householdMembers"
                type="number"
                min="1"
                step="1"
                placeholder="เช่น 3"
                value={householdMembers}
                onChange={(e) => setHouseholdMembers(e.target.value)}
                onBlur={() => handleBlur('householdMembers')}
                className={`w-full max-w-xl h-10 px-3 bg-white rounded-md text-sm text-gray-900 border transition-colors focus:outline-hidden focus:ring-1 focus:ring-primary placeholder:text-gray-400 ${
                  showHouseholdError
                    ? 'border-red-400 focus:border-red-500'
                    : 'border-gray-300 hover:border-gray-400'
                }`}
              />
              {showHouseholdError && (
                <span className="text-red-500 text-xs sm:text-sm font-normal shrink-0">
                  กรุณากรอกข้อมูลให้ครบ
                </span>
              )}
            </div>
          </div>

          {/* ฟิลด์ 5: เหตุผลที่อยากรับเลี้ยง * (Textarea เต็มความกว้างตาม Mockup) */}
          <div className="space-y-1.5">
            <label htmlFor="adoptionReason" className="block text-sm font-bold text-gray-800">
              เหตุผลที่อยากรับเลี้ยง *
            </label>
            <textarea
              id="adoptionReason"
              rows={5}
              placeholder=""
              value={adoptionReason}
              onChange={(e) => setAdoptionReason(e.target.value)}
              onBlur={() => handleBlur('adoptionReason')}
              className={`w-full p-3 bg-white rounded-md text-sm text-gray-900 border transition-colors focus:outline-hidden focus:ring-1 focus:ring-primary placeholder:text-gray-400 ${
                showReasonError
                  ? 'border-red-400 focus:border-red-500'
                  : 'border-gray-300 hover:border-gray-400'
              }`}
            />
            {showReasonError && (
              <p className="text-red-500 text-xs sm:text-sm font-normal mt-1">
                กรุณากรอกข้อมูลให้ครบ
              </p>
            )}
          </div>

          {/* ฟิลด์ 6: Checkbox ยอมรับเงื่อนไข */}
          <div className="pt-2">
            <label className="inline-flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={agreeTerms}
                onChange={(e) => setAgreeTerms(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer accent-primary"
              />
              <span className={`text-sm ${showTermsError ? 'text-red-500 font-medium' : 'text-gray-800'}`}>
                ยอมรับเงื่อนไขการรับเลี้ยง และการส่งรูปอัปเดต
              </span>
            </label>
          </div>

          {/* แถวล่างสุด: ข้อความแจ้งเตือนทางซ้าย และปุ่มกด 2 ปุ่มทางขวา */}
          <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            {/* ซ้าย: ข้อความแจ้งเตือนพร้อมเหตุผลอย่างชัดเจน */}
            <div className="w-full sm:w-auto text-left">
              {hasSubmittedAttempt && !isFormValid && (
                <div className="space-y-1">
                  <span className="text-red-500 text-sm font-semibold flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                    <span>ไม่สามารถส่งแบบประเมินได้: ข้อมูลยังไม่ครบถ้วน</span>
                  </span>
                  <p className="text-red-500/80 text-xs">
                    สาเหตุ: {[
                      !isHousingValid && 'ยังไม่ได้เลือกประเภทที่อยู่อาศัย',
                      !isExperienceValid && 'ยังไม่ได้เลือกประสบการณ์เลี้ยงสัตว์',
                      !isIncomeValid && 'ยังไม่ได้เลือกช่วงรายได้ต่อเดือน',
                      !isHouseholdValid && 'ยังไม่ได้ระบุจำนวนสมาชิกในบ้าน',
                      !isReasonValid && 'ยังไม่ได้ระบุเหตุผลในการรับเลี้ยง',
                      !isTermsValid && 'ยังไม่ได้กดยอมรับเงื่อนไขการรับเลี้ยง',
                    ].filter(Boolean).join(' • ')}
                  </p>
                </div>
              )}
            </div>

            {/* ขวา: ปุ่มยกเลิก และปุ่มส่งความสนใจ */}
            <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push(`/pets/${id}`)}
                className="min-w-[100px] h-10 px-6 border-gray-300 bg-white hover:bg-gray-50 text-gray-700 font-medium rounded-lg text-sm transition-colors shadow-2xs cursor-pointer"
              >
                ยกเลิก
              </Button>

              <Button
                type="submit"
                disabled={isSubmitting}
                className={`min-w-[120px] h-10 px-6 font-medium rounded-lg text-sm transition-all shadow-2xs ${
                  isFormValid
                    ? 'bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer'
                    : 'bg-[#e5e7eb] hover:bg-[#e5e7eb] text-[#9ca3af] cursor-not-allowed'
                }`}
              >
                {isSubmitting ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>กำลังส่ง...</span>
                  </span>
                ) : (
                  'ส่งความสนใจ'
                )}
              </Button>
            </div>
          </div>
        </form>
      </main>
    </div>
  );
}

export default function PetApplyPage(props: ApplyPageProps) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-white flex flex-col font-sans">
          <Navbar activePage="search" />
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm">กำลังโหลดฟอร์มแสดงความสนใจ...</p>
          </div>
        </div>
      }
    >
      <ApplyFormContent {...props} />
    </Suspense>
  );
}
