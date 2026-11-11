// src/app/pets/create/page.tsx
'use client';

import { useState, useRef, useEffect, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Loader2,
  Plus,
  X,
  Image as ImageIcon,
  CheckCircle2,
  ChevronDown,
  Check,
  Calendar,
  Paperclip,
  FileText,
} from 'lucide-react';
import Navbar from '@/components/Navbar';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';

function CreatePetContent() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const diseaseDocInputRef = useRef<HTMLInputElement>(null);
  const vaccineDocInputRef = useRef<HTMLInputElement>(null);
  const neuteredDocInputRef = useRef<HTMLInputElement>(null);

  // Authentication check
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);

  // Form Fields
  const [images, setImages] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [type, setType] = useState('');
  const [breed, setBreed] = useState('');
  const [gender, setGender] = useState<'Male' | 'Female' | 'Unknown'>('Unknown');
  const [age, setAge] = useState('');
  const [location, setLocation] = useState('');

  // Dropdown States for click-to-show selection (Requirement 3)
  const [isTypeOpen, setIsTypeOpen] = useState(false);
  const [isGenderOpen, setIsGenderOpen] = useState(false);
  const [isNeuteredOpen, setIsNeuteredOpen] = useState(false);

  const typeRef = useRef<HTMLDivElement>(null);
  const genderRef = useRef<HTMLDivElement>(null);
  const neuteredRef = useRef<HTMLDivElement>(null);

  // Health History with separate files per section (Requirement 2)
  const [disease, setDisease] = useState('');
  const [diseaseDocs, setDiseaseDocs] = useState<string[]>([]);

  const [vaccine, setVaccine] = useState('');
  const [vaccineDocs, setVaccineDocs] = useState<string[]>([]);

  const [neutered, setNeutered] = useState<'ทำแล้ว' | 'ยังไม่ทำ' | ''>('');
  const [neuteredDocs, setNeuteredDocs] = useState<string[]>([]);

  // Close dropdowns on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (typeRef.current && !typeRef.current.contains(event.target as Node)) {
        setIsTypeOpen(false);
      }
      if (genderRef.current && !genderRef.current.contains(event.target as Node)) {
        setIsGenderOpen(false);
      }
      if (neuteredRef.current && !neuteredRef.current.contains(event.target as Node)) {
        setIsNeuteredOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Adoption Conditions
  const [adoptionConditions, setAdoptionConditions] = useState('');

  // Validation & Submit State
  const [hasSubmittedAttempt, setHasSubmittedAttempt] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [generalError, setGeneralError] = useState('');

  // ตรวจสอบสถานะการล็อกอิน
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await api.auth.me();
        if (res.success && res.user) {
          setCurrentUser(res.user);
        } else {
          router.replace('/login?redirect=/pets/create');
          return;
        }
      } catch {
        router.replace('/login?redirect=/pets/create');
        return;
      } finally {
        setIsAuthChecking(false);
      }
    };
    checkAuth();
  }, [router]);

  // จัดการอัปโหลดรูปภาพสัตว์เลี้ยง
  const handleImageUpload = (files: FileList | null) => {
    if (!files) return;
    const newImages: string[] = [];
    const remainingSlots = 5 - images.length;
    const count = Math.min(files.length, remainingSlots);

    for (let i = 0; i < count; i++) {
      const file = files[i];
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
          if (e.target?.result) {
            setImages((prev) => {
              if (prev.length < 5) {
                return [...prev, e.target!.result as string];
              }
              return prev;
            });
          }
        };
        reader.readAsDataURL(file);
      }
    }
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleDocUpload = (
    files: FileList | null,
    setter: React.Dispatch<React.SetStateAction<string[]>>
  ) => {
    if (!files) return;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (ev.target?.result) {
          setter((prev) => [...prev, ev.target!.result as string]);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const removeDoc = (
    index: number,
    setter: React.Dispatch<React.SetStateAction<string[]>>
  ) => {
    setter((prev) => prev.filter((_, idx) => idx !== index));
  };

  // ตรวจสอบความถูกต้องของข้อมูล
  const isImagesValid = images.length > 0;
  const isTypeValid = Boolean(type && type !== '' && type !== 'เลือก ▾');
  const isBreedValid = Boolean(breed.trim());
  const isLocationValid = Boolean(location.trim());
  const isHealthValid = Boolean(neutered !== '' || vaccine.trim() || disease.trim());

  const isFormValid = isImagesValid && isTypeValid && isBreedValid && isLocationValid;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setHasSubmittedAttempt(true);
    setGeneralError('');

    if (!isFormValid) {
      return;
    }

    setIsSubmitting(true);

    try {
      // แปลงอายุ เช่น '2 ปี' หรือ '6 เดือน' เป็น ageMonths
      let parsedMonths: number | undefined;
      const lowerAge = age.trim();
      if (lowerAge.includes('ปี')) {
        const match = lowerAge.match(/(\d+)/);
        if (match) parsedMonths = parseInt(match[1], 10) * 12;
      } else if (lowerAge.includes('เดือน')) {
        const match = lowerAge.match(/(\d+)/);
        if (match) parsedMonths = parseInt(match[1], 10);
      } else if (!isNaN(Number(lowerAge)) && lowerAge !== '') {
        parsedMonths = parseInt(lowerAge, 10);
      }

      const res = await api.pets.create({
        name: name.trim() || 'สัตว์เลี้ยงหาบ้าน',
        type,
        breed: breed.trim(),
        gender: gender,
        ageMonths: parsedMonths,
        location: location.trim(),
        adoptionConditions: adoptionConditions.trim() || undefined,
        healthHistory: {
          disease: disease.trim() || 'ไม่มี',
          vaccinated: vaccine.trim() || 'ครบ',
          neutered: neutered === 'ทำแล้ว',
          healthDocs: [...diseaseDocs, ...vaccineDocs, ...neuteredDocs],
          diseaseDocs,
          vaccineDocs,
          neuteredDocs,
        },
        images: images as any,
      });

      if (res.success) {
        setSubmitSuccess(true);
        setTimeout(() => {
          router.push('/pets');
        }, 1800);
      } else {
        setGeneralError(res.message || 'ไม่สามารถสร้างประกาศได้');
      }
    } catch {
      setGeneralError('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isAuthChecking) {
    return (
      <div className="min-h-screen bg-white flex flex-col font-sans">
        <Navbar activePage="my-pets" />
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm">กำลังตรวจสอบสิทธิ์การใช้งาน...</p>
        </div>
      </div>
    );
  }

  if (submitSuccess) {
    return (
      <div className="min-h-screen bg-white flex flex-col font-sans">
        <Navbar activePage="my-pets" />
        <div className="flex-1 max-w-2xl mx-auto px-4 py-24 text-center space-y-4">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto text-green-600">
            <CheckCircle2 className="w-10 h-10" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">สร้างประกาศหาบ้านสำเร็จ!</h2>
          <p className="text-sm text-gray-600">
            ประกาศหาบ้านให้ <strong className="text-gray-900">{name || 'สัตว์เลี้ยง'}</strong> ถูกบันทึกเรียบร้อยแล้ว
            กำลังนำคุณไปยังหน้าประกาศของฉัน...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex flex-col font-sans text-foreground">
      {/* 1. Header Navbar */}
      <Navbar activePage="my-pets" />

      {/* 2. Main Content ตาม Wireframe 05-5-Create-post 1 */}
      <main className="max-w-7xl mx-auto px-6 sm:px-10 py-8 w-full flex-1">
        {/* หัวข้อหน้า */}
        <h1 className="text-2xl font-bold text-gray-900 mb-8">
          สร้างประกาศหาบ้านให้สัตว์เลี้ยง
        </h1>

        {generalError && (
          <div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
            {generalError}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          {/* แบ่ง 3 คอลัมน์ตาม Wireframe 05-5-Create-post 1 */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* คอลัมน์ซ้าย: กล่องอัปโหลดรูปภาพ (4 cols) */}
            <div className="lg:col-span-4 space-y-2">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*"
                onChange={(e) => handleImageUpload(e.target.files)}
                className="hidden"
              />

              {/* กล่องเส้นประ คลิก/ลากรูปมาวาง (สูงสุด 5 รูป) */}
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  handleImageUpload(e.dataTransfer.files);
                }}
                className={`w-full min-h-[300px] border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-colors bg-white ${
                  hasSubmittedAttempt && !isImagesValid
                    ? 'border-red-400 bg-red-50/20'
                    : 'border-gray-300 hover:border-gray-400'
                }`}
              >
                {images.length === 0 ? (
                  <div className="space-y-2 text-gray-500">
                    <p className="text-sm font-medium">คลิก/ลากรูปมาวาง (สูงสุด 5 รูป)</p>
                    <span className="text-3xl font-light block text-gray-400">+</span>
                  </div>
                ) : (
                  <div className="w-full space-y-3" onClick={(e) => e.stopPropagation()}>
                    <div className="grid grid-cols-3 gap-2">
                      {images.map((img, idx) => (
                        <div key={idx} className="relative h-20 rounded-md overflow-hidden border border-gray-200 group">
                          <img src={img} alt="" className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={() => removeImage(idx)}
                            className="absolute top-1 right-1 w-5 h-5 bg-black/60 rounded-full text-white flex items-center justify-center opacity-80 hover:opacity-100"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                      {images.length < 5 && (
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="h-20 border border-dashed border-gray-300 rounded-md flex flex-col items-center justify-center text-gray-400 hover:text-gray-600 hover:border-gray-400"
                        >
                          <Plus className="w-5 h-5" />
                          <span className="text-[11px]">เพิ่มรูป</span>
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-gray-400">อัปโหลดแล้ว {images.length}/5 รูป (คลิกเพิ่มได้อีก)</p>
                  </div>
                )}
              </div>

              {/* ข้อความแจ้งเตือนสีแดงด้านล่างกล่องรูปตาม Wireframe */}
              {hasSubmittedAttempt && !isImagesValid && (
                <p className="text-red-500 text-xs sm:text-sm font-normal">
                  ต้องมีอย่างน้อย 1 รูป
                </p>
              )}
            </div>

            {/* คอลัมน์กลาง: ข้อมูลสัตว์เลี้ยง (4 cols) */}
            <div className="lg:col-span-4 space-y-4">
              {/* ชื่อสัตว์ */}
              <div className="space-y-1.5">
                <label htmlFor="petName" className="block text-sm font-bold text-gray-800">
                  ชื่อสัตว์
                </label>
                <input
                  id="petName"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full h-10 px-3 bg-white rounded-md text-sm text-gray-900 border border-gray-300 hover:border-gray-400 focus:outline-hidden focus:ring-1 focus:ring-primary"
                />
              </div>

              {/* ชนิดสัตว์ * (คลิกเพื่อแสดงตัวเลือก แล้วคลิกเลือก - Requirement 3) */}
              <div className="space-y-1.5 relative" ref={typeRef}>
                <label className="block text-sm font-bold text-gray-800">
                  ชนิดสัตว์ *
                </label>
                <button
                  type="button"
                  onClick={() => setIsTypeOpen((prev) => !prev)}
                  className={`w-full h-10 px-3 bg-white rounded-md text-sm text-left flex items-center justify-between border transition-all cursor-pointer ${
                    hasSubmittedAttempt && !isTypeValid
                      ? 'border-red-400 focus:border-red-500'
                      : 'border-gray-300 hover:border-gray-400'
                  }`}
                >
                  <span className={type ? 'text-gray-900 font-medium' : 'text-gray-400'}>
                    {type ? type : 'คลิกเพื่อเลือกชนิดสัตว์ ▾'}
                  </span>
                  <ChevronDown
                    className={`w-4 h-4 text-gray-400 transition-transform duration-150 ${
                      isTypeOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {isTypeOpen && (
                  <div className="absolute top-full left-0 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg py-1.5 z-40 animate-in fade-in zoom-in-95 duration-100">
                    {['สุนัข', 'แมว', 'กระต่าย', 'นก', 'อื่นๆ'].map((opt) => {
                      const isSelected = type === opt;
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => {
                            setType(opt);
                            setIsTypeOpen(false);
                          }}
                          className={`w-full text-left px-3.5 py-2 text-sm flex items-center justify-between transition-colors cursor-pointer ${
                            isSelected
                              ? 'bg-blue-50 text-blue-700 font-medium'
                              : 'text-gray-800 hover:bg-gray-100'
                          }`}
                        >
                          <span>{opt}</span>
                          {isSelected && <Check className="w-4 h-4 text-blue-600" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* เพศ (คลิกเพื่อแสดงตัวเลือก แล้วคลิกเลือก) */}
              <div className="space-y-1.5 relative" ref={genderRef}>
                <label className="block text-sm font-bold text-gray-800">
                  เพศ
                </label>
                <button
                  type="button"
                  onClick={() => setIsGenderOpen((prev) => !prev)}
                  className="w-full h-10 px-3 bg-white rounded-md text-sm text-left flex items-center justify-between border border-gray-300 hover:border-gray-400 transition-all cursor-pointer"
                >
                  <span className="text-gray-900 font-medium">
                    {gender === 'Male' ? 'เพศผู้ (Male)' : gender === 'Female' ? 'เพศเมีย (Female)' : 'ไม่ระบุเพศ'}
                  </span>
                  <ChevronDown
                    className={`w-4 h-4 text-gray-400 transition-transform duration-150 ${
                      isGenderOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {isGenderOpen && (
                  <div className="absolute top-full left-0 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg py-1.5 z-40 animate-in fade-in zoom-in-95 duration-100">
                    {[
                      { label: 'เพศผู้ (Male)', value: 'Male' as const },
                      { label: 'เพศเมีย (Female)', value: 'Female' as const },
                      { label: 'ไม่ระบุเพศ', value: 'Unknown' as const },
                    ].map((opt) => {
                      const isSelected = gender === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => {
                            setGender(opt.value);
                            setIsGenderOpen(false);
                          }}
                          className={`w-full text-left px-3.5 py-2 text-sm flex items-center justify-between transition-colors cursor-pointer ${
                            isSelected
                              ? 'bg-blue-50 text-blue-700 font-medium'
                              : 'text-gray-800 hover:bg-gray-100'
                          }`}
                        >
                          <span>{opt.label}</span>
                          {isSelected && <Check className="w-4 h-4 text-blue-600" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* สายพันธุ์ * (ตาม Wireframe แสดงกรอบสีแดงพร้อมข้อความ กรุณากรอกสายพันธุ์) */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <label htmlFor="petBreed" className="block text-sm font-bold text-gray-800">
                    สายพันธุ์ *
                  </label>
                  {hasSubmittedAttempt && !isBreedValid && (
                    <span className="text-red-500 text-xs sm:text-sm font-normal">
                      กรุณากรอกสายพันธุ์
                    </span>
                  )}
                </div>
                <input
                  id="petBreed"
                  type="text"
                  value={breed}
                  onChange={(e) => setBreed(e.target.value)}
                  className={`w-full h-10 px-3 bg-white rounded-md text-sm text-gray-900 border transition-colors focus:outline-hidden focus:ring-1 focus:ring-primary ${
                    hasSubmittedAttempt && !isBreedValid
                      ? 'border-red-400'
                      : 'border-gray-300 hover:border-gray-400'
                  }`}
                />
              </div>

              {/* อายุ */}
              <div className="space-y-1.5">
                <label htmlFor="petAge" className="block text-sm font-bold text-gray-800">
                  อายุ
                </label>
                <input
                  id="petAge"
                  type="text"
                  placeholder="เช่น 2 ปี, 6 เดือน"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  className="w-full h-10 px-3 bg-white rounded-md text-sm text-gray-900 border border-gray-300 hover:border-gray-400 focus:outline-hidden focus:ring-1 focus:ring-primary placeholder:text-gray-400"
                />
              </div>

              {/* ที่พักพิงปัจจุบัน * */}
              <div className="space-y-1.5">
                <label htmlFor="petLocation" className="block text-sm font-bold text-gray-800">
                  ที่พักพิงปัจจุบัน *
                </label>
                <input
                  id="petLocation"
                  type="text"
                  placeholder="ศูนย์/บ้านพัก/พื้นที่"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className={`w-full h-10 px-3 bg-white rounded-md text-sm text-gray-900 border transition-colors focus:outline-hidden focus:ring-1 focus:ring-primary placeholder:text-gray-400 ${
                    hasSubmittedAttempt && !isLocationValid
                      ? 'border-red-400'
                      : 'border-gray-300 hover:border-gray-400'
                  }`}
                />
              </div>
            </div>

            {/* คอลัมน์ขวา: ประวัติสุขภาพ & เงื่อนไขการรับเลี้ยง (4 cols) */}
            <div className="lg:col-span-4 space-y-4">
              
              {/* การ์ดบน: ประวัติสุขภาพ * (Requirement 2: เพิ่มไฟล์ได้ในทุก section ใต้กล่องกรอก) */}
              <div className="border border-gray-300 rounded-lg p-4 bg-white space-y-4">
                <h3 className="text-sm font-bold text-gray-900 border-b border-gray-200 pb-2">
                  ประวัติสุขภาพ *
                </h3>

                {/* Section 1: โรคประจำตัว (Fill Box + แนบไฟล์ใต้กล่องกรอก) */}
                <div className="space-y-2 pb-3 border-b border-gray-100">
                  <label htmlFor="petDisease" className="block text-xs sm:text-sm font-semibold text-gray-800">
                    1. โรคประจำตัว:
                  </label>
                  <input
                    id="petDisease"
                    type="text"
                    placeholder="ระบุโรคประจำตัว (ถ้ามี หรือ 'ไม่มี')"
                    value={disease}
                    onChange={(e) => setDisease(e.target.value)}
                    className="w-full h-10 px-3 bg-white rounded-md text-sm text-gray-900 border border-gray-300 hover:border-gray-400 focus:outline-hidden focus:ring-1 focus:ring-primary placeholder:text-gray-400"
                  />

                  {/* แนบไฟล์ใต้กล่องกรอกโรคประจำตัว */}
                  <input
                    ref={diseaseDocInputRef}
                    type="file"
                    multiple
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={(e) => handleDocUpload(e.target.files, setDiseaseDocs)}
                  />
                  <button
                    type="button"
                    onClick={() => diseaseDocInputRef.current?.click()}
                    className="w-full py-1.5 px-3 border border-dashed border-gray-300 rounded-md text-xs font-medium text-gray-700 bg-gray-50/70 hover:bg-gray-100 hover:border-gray-400 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Paperclip className="w-3.5 h-3.5 text-gray-500" />
                    <span>+ แนบไฟล์ / รูปภาพเอกสารโรคประจำตัว</span>
                  </button>

                  {diseaseDocs.length > 0 && (
                    <div className="space-y-1 pt-1">
                      {diseaseDocs.map((doc, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between px-2.5 py-1 bg-green-50/70 border border-green-200 rounded text-xs text-green-900"
                        >
                          <span className="truncate flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5 text-green-600 shrink-0" />
                            เอกสารโรคประจำตัว #{idx + 1}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeDoc(idx, setDiseaseDocs)}
                            className="text-gray-400 hover:text-red-600 ml-2 cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Section 2: วัคซีน (Calendar Picker + แนบไฟล์ใต้กล่องกรอก) */}
                <div className="space-y-2 pb-3 border-b border-gray-100">
                  <label htmlFor="petVaccine" className="block text-xs sm:text-sm font-semibold text-gray-800 flex items-center justify-between">
                    <span>2. วัคซีน (เลือกวันที่จากปฏิทิน):</span>
                    <Calendar className="w-4 h-4 text-primary" />
                  </label>
                  <input
                    id="petVaccine"
                    type="date"
                    value={vaccine}
                    onChange={(e) => setVaccine(e.target.value)}
                    className="w-full h-10 px-3 bg-white rounded-md text-sm text-gray-900 border border-gray-300 hover:border-gray-400 focus:outline-hidden focus:ring-1 focus:ring-primary cursor-pointer"
                  />
                  {vaccine && (
                    <p className="text-[11px] text-gray-500">
                      วันที่เลือก: {vaccine}
                    </p>
                  )}

                  {/* แนบไฟล์ใต้กล่องกรอกวัคซีน */}
                  <input
                    ref={vaccineDocInputRef}
                    type="file"
                    multiple
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={(e) => handleDocUpload(e.target.files, setVaccineDocs)}
                  />
                  <button
                    type="button"
                    onClick={() => vaccineDocInputRef.current?.click()}
                    className="w-full py-1.5 px-3 border border-dashed border-gray-300 rounded-md text-xs font-medium text-gray-700 bg-gray-50/70 hover:bg-gray-100 hover:border-gray-400 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Paperclip className="w-3.5 h-3.5 text-gray-500" />
                    <span>+ แนบไฟล์ / รูปภาพสมุดวัคซีน</span>
                  </button>

                  {vaccineDocs.length > 0 && (
                    <div className="space-y-1 pt-1">
                      {vaccineDocs.map((doc, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between px-2.5 py-1 bg-green-50/70 border border-green-200 rounded text-xs text-green-900"
                        >
                          <span className="truncate flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5 text-green-600 shrink-0" />
                            รูปสมุดวัคซีน #{idx + 1}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeDoc(idx, setVaccineDocs)}
                            className="text-gray-400 hover:text-red-600 ml-2 cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Section 3: การทำหมัน (Click to show dropdown + แนบไฟล์ใต้กล่องกรอก) */}
                <div className="space-y-2">
                  <div className="space-y-1.5 relative" ref={neuteredRef}>
                    <label className="block text-xs sm:text-sm font-semibold text-gray-800">
                      3. การทำหมัน:
                    </label>
                    <button
                      type="button"
                      onClick={() => setIsNeuteredOpen((prev) => !prev)}
                      className="w-full h-10 px-3 bg-white rounded-md text-sm text-left flex items-center justify-between border border-gray-300 hover:border-gray-400 focus:outline-hidden focus:ring-1 focus:ring-primary cursor-pointer"
                    >
                      <span className={neutered ? 'text-gray-900 font-medium' : 'text-gray-400'}>
                        {neutered ? neutered : 'คลิกเพื่อเลือกสถานะทำหมัน ▾'}
                      </span>
                      <ChevronDown
                        className={`w-4 h-4 text-gray-400 transition-transform duration-150 ${
                          isNeuteredOpen ? 'rotate-180' : ''
                        }`}
                      />
                    </button>

                    {isNeuteredOpen && (
                      <div className="absolute top-full left-0 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg py-1.5 z-40 animate-in fade-in zoom-in-95 duration-100">
                        {['ทำแล้ว', 'ยังไม่ทำ'].map((opt) => {
                          const isSelected = neutered === opt;
                          return (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => {
                                setNeutered(opt as 'ทำแล้ว' | 'ยังไม่ทำ');
                                setIsNeuteredOpen(false);
                              }}
                              className={`w-full text-left px-3.5 py-2 text-sm flex items-center justify-between transition-colors cursor-pointer ${
                                isSelected
                                  ? 'bg-blue-50 text-blue-700 font-medium'
                                  : 'text-gray-800 hover:bg-gray-100'
                              }`}
                            >
                              <span>{opt}</span>
                              {isSelected && <Check className="w-4 h-4 text-blue-600" />}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* แนบไฟล์ใต้กล่องกรอกทำหมัน */}
                  <input
                    ref={neuteredDocInputRef}
                    type="file"
                    multiple
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={(e) => handleDocUpload(e.target.files, setNeuteredDocs)}
                  />
                  <button
                    type="button"
                    onClick={() => neuteredDocInputRef.current?.click()}
                    className="w-full py-1.5 px-3 border border-dashed border-gray-300 rounded-md text-xs font-medium text-gray-700 bg-gray-50/70 hover:bg-gray-100 hover:border-gray-400 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Paperclip className="w-3.5 h-3.5 text-gray-500" />
                    <span>+ แนบไฟล์ / รูปภาพใบรับรองการทำหมัน</span>
                  </button>

                  {neuteredDocs.length > 0 && (
                    <div className="space-y-1 pt-1">
                      {neuteredDocs.map((doc, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between px-2.5 py-1 bg-green-50/70 border border-green-200 rounded text-xs text-green-900"
                        >
                          <span className="truncate flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5 text-green-600 shrink-0" />
                            ใบรับรองทำหมัน #{idx + 1}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeDoc(idx, setNeuteredDocs)}
                            className="text-gray-400 hover:text-red-600 ml-2 cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* การ์ดล่าง: เงื่อนไขการรับเลี้ยง */}
              <div className="border border-gray-300 rounded-lg p-4 bg-white space-y-2">
                <h3 className="text-sm font-bold text-gray-900">
                  เงื่อนไขการรับเลี้ยง
                </h3>
                <textarea
                  rows={5}
                  placeholder="เช่น ต้องมีพื้นที่ ส่งรูปอัปเดต"
                  value={adoptionConditions}
                  onChange={(e) => setAdoptionConditions(e.target.value)}
                  className="w-full p-2.5 bg-white rounded-md text-sm text-gray-900 border border-gray-300 hover:border-gray-400 focus:outline-hidden focus:ring-1 focus:ring-primary placeholder:text-gray-400"
                />
              </div>
            </div>
          </div>

          {/* แถวล่างสุด: ข้อความสีแดงทางซ้าย และปุ่มกด 2 ปุ่มทางขวา */}
          <div className="pt-8 mt-6 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-4">
            {/* ซ้าย: แสดงข้อความแจ้งเตือนสีแดงตาม Wireframe */}
            <div className="w-full sm:w-auto text-left">
              {hasSubmittedAttempt && !isFormValid && (
                <span className="text-red-500 text-sm font-medium">
                  กรอกข้อมูลที่จำเป็นไม่ครบ: ไม่สามารถสร้างประกาศได้
                </span>
              )}
            </div>

            {/* ขวา: ปุ่มยกเลิก และปุ่มสร้างประกาศ (สีฟ้าอ่อนตาม Wireframe) */}
            <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push('/pets')}
                className="min-w-[100px] h-10 px-6 border-gray-300 bg-white hover:bg-gray-50 text-gray-700 font-medium rounded-lg text-sm transition-colors shadow-2xs cursor-pointer"
              >
                ยกเลิก
              </Button>

              <Button
                type="submit"
                disabled={isSubmitting}
                className="min-w-[120px] h-10 px-8 bg-[#dbeafe] hover:bg-[#bfdbfe] text-[#1e40af] border border-[#bfdbfe] font-medium rounded-lg text-sm shadow-2xs transition-colors cursor-pointer"
              >
                {isSubmitting ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>กำลังบันทึก...</span>
                  </span>
                ) : (
                  'สร้างประกาศ'
                )}
              </Button>
            </div>
          </div>
        </form>
      </main>
    </div>
  );
}

export default function CreatePetPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-white flex flex-col font-sans">
          <Navbar activePage="my-pets" />
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm">กำลังโหลด...</p>
          </div>
        </div>
      }
    >
      <CreatePetContent />
    </Suspense>
  );
}
