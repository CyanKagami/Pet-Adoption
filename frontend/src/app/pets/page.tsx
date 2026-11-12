// src/app/pets/page.tsx
'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { Plus, Loader2, X, AlertCircle, MessageSquare, Lock, CheckCircle } from 'lucide-react';
import Navbar from '@/components/Navbar';
import { api } from '@/lib/api';
import { PET_TYPES, type Pet, type PetApplication, type PetType, type PetOwner } from '@/types/pet';
import { Button } from '@/components/ui/button';

type AuthenticatedUser = Pick<PetOwner, 'id'>;

type ManagedApplication = Omit<PetApplication, 'status'> & { status: string };

interface PetWithApplications extends Omit<Pet, 'applications'> {
  applications?: ManagedApplication[];
}

function MyPostsContent() {
  const [currentUser, setCurrentUser] = useState<AuthenticatedUser | null>(null);
  const [pets, setPets] = useState<PetWithApplications[]>([]);
  const [adoptedPets, setAdoptedPets] = useState<PetWithApplications[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal States
  const [confirmAdoptPet, setConfirmAdoptPet] = useState<PetWithApplications | null>(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  const [viewApplicantsPet, setViewApplicantsPet] = useState<PetWithApplications | null>(null);
  const [deletePetTarget, setDeletePetTarget] = useState<PetWithApplications | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Edit Pet Modal State
  const [editPetTarget, setEditPetTarget] = useState<PetWithApplications | null>(null);
  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState<PetType>('Dog');
  const [editBreed, setEditBreed] = useState('');
  const [editAgeMonths, setEditAgeMonths] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editStatus, setEditStatus] = useState<Pet['status']>('available');
  const [editConditions, setEditConditions] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Notice Message Toast
  const [actionNotice, setActionNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchMyPets = useCallback(async () => {
    try {
      const authRes = await api.auth.me().catch(() => null);
      if (authRes?.success && authRes.user) {
        setCurrentUser(authRes.user);

        // ดึงประกาศของตนเอง (Requirement 4: In your post page the own can read only)
        const res = await api.pets.getAll({ myPosts: true, limit: 50 });
        if (res.success && Array.isArray(res.data)) {
          setPets(res.data);
        } else {
          setPets([]);
        }

        // ดึงสัตว์ที่ตนเองรับเลี้ยง (Requirement 4: สัตว์ที่รับเลี้ยง)
        const adoptedRes = await api.pets.getAll({ adoptedByMe: true, limit: 50 });
        if (adoptedRes.success && Array.isArray(adoptedRes.data)) {
          setAdoptedPets(adoptedRes.data);
        } else {
          setAdoptedPets([]);
        }
      } else {
        setCurrentUser(null);
        setPets([]);
        setAdoptedPets([]);
      }
    } catch (err) {
      console.error('Error fetching pets:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadMyPets = async () => {
      try {
        const authRes = await api.auth.me().catch(() => null);
        if (authRes?.success && authRes.user) {
          const petsRes = await api.pets.getAll({ myPosts: true, limit: 50 });
          const adoptedRes = await api.pets.getAll({ adoptedByMe: true, limit: 50 });
          if (cancelled) return;
          setCurrentUser(authRes.user);
          setPets(petsRes.success && Array.isArray(petsRes.data) ? petsRes.data : []);
          setAdoptedPets(
            adoptedRes.success && Array.isArray(adoptedRes.data) ? adoptedRes.data : []
          );
        } else if (!cancelled) {
          setCurrentUser(null);
          setPets([]);
          setAdoptedPets([]);
        }
      } catch (err) {
        if (!cancelled) console.error('Error fetching pets:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadMyPets();
    return () => {
      cancelled = true;
    };
  }, []);

  const showNotification = (type: 'success' | 'error', message: string) => {
    setActionNotice({ type, message });
    setTimeout(() => {
      setActionNotice(null);
    }, 3000);
  };

  // 1. เปลี่ยนสถานะเป็น adopted (ยืนยัน: adopted) พร้อมแจ้งเตือนผู้รับเลี้ยง
  const handleConfirmAdopted = async () => {
    if (!confirmAdoptPet) return;
    setIsUpdatingStatus(true);
    try {
      const res = await api.pets.update(confirmAdoptPet.id, { status: 'adopted' });
      if (res.success) {
        const approvedApp =
          (confirmAdoptPet.applications || []).find(
            (application) => application.status === 'APPROVED' || application.status === 'approved' || application.status === 'accepted'
          ) || (confirmAdoptPet.applications && confirmAdoptPet.applications[0]);

        const recipientId = approvedApp?.applicant?.id || approvedApp?.applicantId;
        if (recipientId) {
          await api.messages.sendMessage({
            receiverId: recipientId,
            petId: confirmAdoptPet.id,
            message: `🎉 ยืนยันการรับเลี้ยงน้อง '${confirmAdoptPet.name}' เสร็จสมบูรณ์แล้ว! ขอบคุณที่มอบบ้านใหม่ที่อบอุ่นและดูแลน้องเป็นอย่างดีครับ/ค่ะ! คุณสามารถเริ่มส่งรูปภาพอัปเดตความเป็นอยู่และเขียนรีวิวผู้ลงประกาศได้ที่หน้า 'สัตว์ที่รับเลี้ยง' ได้เลยครับ`,
          }).catch(() => null);
        }

        setPets((prev) =>
          prev.map((p) => (p.id === confirmAdoptPet.id ? { ...p, status: 'adopted' } : p))
        );
        showNotification(
          'success',
          `อัปเดตสถานะของ '${confirmAdoptPet.name}' เป็น adopted และส่งข้อความแจ้งเตือนผู้รับเลี้ยงเรียบร้อยแล้ว`
        );
        setConfirmAdoptPet(null);
        fetchMyPets();
      } else {
        showNotification('error', res.message || 'ไม่สามารถอัปเดตสถานะได้');
      }
    } catch {
      showNotification('error', 'เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  // 2. ยกเลิกสถานะ pending กลับเป็น available (ยกเลิก → available)
  const handleRevertToAvailable = async (pet: PetWithApplications) => {
    try {
      const res = await api.pets.update(pet.id, { status: 'available' });
      if (res.success) {
        const approvedApp = (pet.applications || []).find(
          (application) => application.status === 'APPROVED' || application.status === 'approved' || application.status === 'accepted'
        );
        if (approvedApp) {
          await api.applications.updateStatus(approvedApp.id, 'pending').catch(() => null);
        }

        setPets((prev) =>
          prev.map((p) => (p.id === pet.id ? { ...p, status: 'available' } : p))
        );
        showNotification('success', `เปลี่ยนสถานะ '${pet.name}' กลับเป็น available แล้ว`);
        fetchMyPets();
      } else {
        showNotification('error', res.message || 'ไม่สามารถเปลี่ยนสถานะได้');
      }
    } catch {
      showNotification('error', 'เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
    }
  };

  // 3. เปลี่ยนสถานะเป็น pending เมื่อเลือกผู้สนใจ พร้อมแจ้งเตือนผู้รับเลี้ยงทันที
  const handleSelectApplicant = async (
    petId: string,
    applicationId?: string,
    applicantId?: string,
    applicantName = 'ผู้สนใจ'
  ) => {
    try {
      if (applicationId) {
        await api.applications.updateStatus(applicationId, 'accepted');
      }
      const res = await api.pets.update(petId, { status: 'pending' });

      if (applicantId) {
        await api.messages.sendMessage({
          receiverId: applicantId,
          petId,
          message: `🎉 ยินดีด้วยครับ/ค่ะ! คุณได้รับการคัดเลือกให้เป็นผู้รับเลี้ยงน้อง '${viewApplicantsPet?.name || 'สัตว์เลี้ยง'}' เรียบร้อยแล้ว กรุณาพูดคุยเพื่อนัดหมายวันและเวลารับน้อง หรือสอบถามรายละเอียดเพิ่มเติมได้เลยครับ/ค่ะ`,
        }).catch(() => null);
      }

      if (res.success) {
        setPets((prev) =>
          prev.map((p) => (p.id === petId ? { ...p, status: 'pending' } : p))
        );
        showNotification(
          'success',
          `เลือก '${applicantName}' สำหรับการรับเลี้ยง (สถานะเป็น pending) และส่งข้อความแจ้งเตือนผู้รับเลี้ยงเรียบร้อยแล้ว`
        );
        setViewApplicantsPet(null);
        fetchMyPets();
      }
    } catch {
      showNotification('error', 'ไม่สามารถบันทึกได้');
    }
  };

  // 4. ลบประกาศ
  const handleConfirmDelete = async () => {
    if (!deletePetTarget) return;
    setIsDeleting(true);
    try {
      const res = await api.pets.delete(deletePetTarget.id);
      if (res.success) {
        setPets((prev) => prev.filter((p) => p.id !== deletePetTarget.id));
        showNotification('success', `ลบประกาศ '${deletePetTarget.name}' เรียบร้อยแล้ว`);
        setDeletePetTarget(null);
      } else {
        showNotification('error', res.message || 'ไม่สามารถลบประกาศได้');
      }
    } catch {
      showNotification('error', 'เกิดข้อผิดพลาดในการลบ');
    } finally {
      setIsDeleting(false);
    }
  };

  // 5. บันทึกการแก้ไขประกาศ
  const handleSaveEdit = async () => {
    if (!editPetTarget) return;
    setIsSavingEdit(true);
    try {
      const res = await api.pets.update(editPetTarget.id, {
        name: editName.trim() || editPetTarget.name,
        type: editType || editPetTarget.type,
        breed: editBreed.trim() || null,
        ageMonths: editAgeMonths ? parseInt(editAgeMonths, 10) : null,
        location: editLocation.trim() || editPetTarget.location,
        status: editStatus,
        adoptionConditions: editConditions.trim() || null,
      });

      if (res.success) {
        setPets((prev) =>
          prev.map((p) =>
            p.id === editPetTarget.id
              ? {
                  ...p,
                  name: editName.trim() || p.name,
                  type: editType || p.type,
                  breed: editBreed.trim() || p.breed,
                  ageMonths: editAgeMonths ? parseInt(editAgeMonths, 10) : p.ageMonths,
                  location: editLocation.trim() || p.location,
                  status: editStatus,
                  adoptionConditions: editConditions.trim() || p.adoptionConditions,
                }
              : p
          )
        );
        showNotification('success', 'แก้ไขข้อมูลสัตว์เลี้ยงเรียบร้อยแล้ว');
        setEditPetTarget(null);
      } else {
        showNotification('error', res.message || 'ไม่สามารถบันทึกการแก้ไขได้');
      }
    } catch {
      showNotification('error', 'เกิดข้อผิดพลาดในการแก้ไข');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const openEditModal = (pet: PetWithApplications) => {
    setEditPetTarget(pet);
    setEditName(pet.name);
    setEditType(pet.type);
    setEditBreed(pet.breed || '');
    setEditAgeMonths(pet.ageMonths ? pet.ageMonths.toString() : '');
    setEditLocation(pet.location || '');
    setEditStatus(pet.status);
    setEditConditions(pet.adoptionConditions || '');
  };

  // คำนวณข้อความคอลัมน์ "ผู้สนใจ"
  const renderInterestedText = (pet: PetWithApplications) => {
    if (pet.status === 'adopted') {
      return '—';
    }

    const apps = pet.applications || [];
    const count = apps.length;

    if (pet.status === 'pending') {
      const approvedApp = apps.find(
        (application) => application.status === 'APPROVED' || application.status === 'approved' || application.status === 'accepted'
      ) || apps[0];
      const primaryApplicant = approvedApp?.applicant?.fullName || 'คุณใจดี';
      return `1 คน (${primaryApplicant})`;
    }

    if (count > 0) {
      return `${count} คน`;
    }

    return '—';
  };

  // แสดงผู้รับเลี้ยงสำหรับกล่องยืนยันหรือเขียนรีวิว
  const getAdopterForConfirmation = (pet: PetWithApplications) => {
    const apps = pet.applications || [];
    const approved = apps.find(
      (application) => application.status === 'APPROVED' || application.status === 'approved' || application.status === 'accepted'
    );
    return approved?.applicant || apps[0]?.applicant || null;
  };

  const getAdopterNameForConfirmation = (pet: PetWithApplications) => {
    const adopter = getAdopterForConfirmation(pet);
    return adopter?.fullName || 'คุณใจดี';
  };

  // Requirement 4: In your post page the own can read only (กรณียังไม่ล็อกอิน ต้องแจ้งเตือนให้เข้าสู่ระบบ)
  if (!currentUser && !loading) {
    return (
      <div className="min-h-screen bg-white flex flex-col font-sans text-foreground">
        <Navbar activePage="my-pets" />
        <main className="max-w-md mx-auto px-4 py-24 text-center space-y-4">
          <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto border border-blue-200">
            <Lock className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">เข้าสู่ระบบเพื่อดูประกาศของคุณ</h1>
          <p className="text-sm text-gray-600">
            เฉพาะเจ้าของประกาศและผู้รับเลี้ยงเท่านั้นที่สามารถเข้าถึงข้อมูลหน้านี้ได้ กรุณาเข้าสู่ระบบก่อน
          </p>
          <div className="pt-2">
            <Link
              href="/login?redirect=/pets"
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
      <Navbar activePage="my-pets" />

      {/* 2. Main Content ตาม Wireframe 08-8-My-posts 1 */}
      <main className="max-w-6xl mx-auto px-6 sm:px-10 py-8 w-full flex-1 space-y-6">
        
        {/* แถบหัวข้อหน้า และปุ่ม '+ ลงประกาศหาบ้าน' ทางขวา */}
        <div className="flex items-center justify-between pb-2">
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
            ประกาศของฉัน
          </h1>

          <Link
            href="/pets/create"
            className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>ลงประกาศหาบ้าน</span>
          </Link>
        </div>

        {/* ข้อความแจ้งเตือน Toast */}
        {actionNotice && (
          <div
            className={`p-3 rounded-lg text-sm flex items-center justify-between animate-in fade-in duration-150 ${
              actionNotice.type === 'success'
                ? 'bg-green-50 border border-green-200 text-green-800'
                : 'bg-red-50 border border-red-200 text-red-800'
            }`}
          >
            <span>{actionNotice.message}</span>
            <button
              type="button"
              onClick={() => setActionNotice(null)}
              className="text-gray-400 hover:text-gray-600 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ตารางรายการสัตว์เลี้ยงตาม Wireframe 08-8-My-posts 1 */}
        {loading ? (
          <div className="py-24 flex flex-col items-center justify-center text-muted-foreground gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm">กำลังโหลดข้อมูลประกาศของฉัน...</p>
          </div>
        ) : pets.length === 0 ? (
          <div className="border border-gray-200 rounded-xl p-12 text-center space-y-4">
            <p className="text-gray-500 text-base">ยังไม่มีประกาศสัตว์เลี้ยงในระบบ</p>
            <Link
              href="/pets/create"
              className="inline-flex items-center gap-1.5 bg-[#dbeafe] text-[#1e40af] border border-[#bfdbfe] font-medium px-5 py-2.5 rounded-lg text-sm"
            >
              <Plus className="w-4 h-4" />
              <span>สร้างประกาศแรกของคุณ</span>
            </Link>
          </div>
        ) : (
          <div className="border border-gray-300 rounded-lg overflow-hidden bg-white shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="border-b border-gray-300 bg-white text-gray-800 font-bold">
                    <th className="py-3.5 px-4 w-[24%]">สัตว์</th>
                    <th className="py-3.5 px-4 w-[16%]">สถานะ</th>
                    <th className="py-3.5 px-4 w-[24%]">ผู้สนใจ</th>
                    <th className="py-3.5 px-4 w-[36%] min-w-[260px]">การจัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {pets.map((pet) => {
                    const interestedDisplay = renderInterestedText(pet);

                    return (
                      <tr key={pet.id} className="hover:bg-gray-50/50 transition-colors">
                        {/* 1. สัตว์ */}
                        <td className="py-4 px-4 font-medium text-gray-900">
                          <Link
                            href={`/pets/${pet.id}`}
                            className="hover:underline hover:text-primary transition-colors inline-block"
                          >
                            {pet.name}
                          </Link>
                        </td>

                        {/* 2. สถานะ */}
                        <td className="py-4 px-4">
                          {pet.status === 'available' ? (
                            <span className="inline-block px-3.5 py-0.5 rounded-full text-xs font-semibold bg-[#dcfce7] text-[#166534] border border-[#86efac]">
                              available
                            </span>
                          ) : pet.status === 'pending' ? (
                            <span className="inline-block px-3.5 py-0.5 rounded-full text-xs font-semibold bg-[#fef3c7] text-[#92400e] border border-[#fde047]">
                              pending
                            </span>
                          ) : (
                            <span className="inline-block px-3.5 py-0.5 rounded-full text-xs font-semibold bg-[#e5e7eb] text-gray-700 border border-gray-300">
                              adopted
                            </span>
                          )}
                        </td>

                        {/* 3. ผู้สนใจ */}
                        <td className="py-4 px-4 text-gray-700">
                          {interestedDisplay}
                        </td>

                        {/* 4. การจัดการ: ดูผู้สนใจ:แก้ไข:ลบ to 3:1:1 and ดูอัพเดต:รีวิว is 3:1 */}
                        <td className="py-4 px-4">
                          {pet.status === 'available' && (
                            <div className="flex items-center gap-1.5 w-full max-w-[280px]">
                              {/* ปุ่ม ดูผู้สนใจ (3 ส่วน) */}
                              <button
                                type="button"
                                onClick={() => setViewApplicantsPet(pet)}
                                className="flex-[3] min-w-0 inline-flex items-center justify-center px-2 py-1.5 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-colors cursor-pointer active:scale-95 truncate text-center"
                              >
                                ดูผู้สนใจ
                              </button>

                              {/* ปุ่ม แก้ไข (1 ส่วน) */}
                              <button
                                type="button"
                                onClick={() => openEditModal(pet)}
                                className="flex-1 min-w-0 inline-flex items-center justify-center px-2 py-1.5 text-xs font-medium rounded-lg bg-gray-700 hover:bg-gray-800 text-white shadow-xs transition-colors cursor-pointer active:scale-95 truncate text-center"
                              >
                                แก้ไข
                              </button>

                              {/* ปุ่ม ลบ (1 ส่วน) */}
                              <button
                                type="button"
                                onClick={() => setDeletePetTarget(pet)}
                                className="flex-1 min-w-0 inline-flex items-center justify-center px-2 py-1.5 text-xs font-medium rounded-lg bg-red-600 hover:bg-red-700 text-white shadow-xs transition-colors cursor-pointer active:scale-95 truncate text-center"
                              >
                                ลบ
                              </button>
                            </div>
                          )}

                          {pet.status === 'pending' && (
                            <div className="flex items-center gap-1.5 w-full max-w-[280px]">
                              {/* ปุ่ม ยืนยัน: adopted */}
                              <button
                                type="button"
                                onClick={() => setConfirmAdoptPet(pet)}
                                className="flex-1 min-w-0 inline-flex items-center justify-center px-2 py-1.5 text-xs font-medium rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-colors cursor-pointer active:scale-95 truncate text-center"
                              >
                                ยืนยัน: adopted
                              </button>

                              {/* ปุ่ม ยกเลิก → available */}
                              <button
                                type="button"
                                onClick={() => handleRevertToAvailable(pet)}
                                className="flex-1 min-w-0 inline-flex items-center justify-center px-2 py-1.5 text-xs font-medium rounded-lg bg-amber-600 hover:bg-amber-700 text-white shadow-xs transition-colors cursor-pointer active:scale-95 truncate text-center"
                              >
                                ยกเลิก → available
                              </button>
                            </div>
                          )}

                          {pet.status === 'adopted' && (
                            <div className="flex items-center gap-1.5 w-full max-w-[280px]">
                              {/* ปุ่ม ดูอัพเดต (3 ส่วน) */}
                              <Link
                                href={`/pets/${pet.id}/updates`}
                                className="flex-[3] min-w-0 inline-flex items-center justify-center px-2 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition-colors cursor-pointer active:scale-95 truncate text-center"
                              >
                                ดูอัพเดต
                              </Link>

                              {/* ปุ่ม รีวิว (1 ส่วน) */}
                              <Link
                                href={`/reviews?targetUserId=${getAdopterForConfirmation(pet)?.id || ''}&targetUserName=${encodeURIComponent(
                                  getAdopterNameForConfirmation(pet)
                                )}&petName=${encodeURIComponent(pet.name)}&role=adopter`}
                                className="flex-1 min-w-0 inline-flex items-center justify-center px-2 py-1.5 text-xs font-medium rounded-lg bg-orange-600 hover:bg-orange-700 text-white shadow-xs transition-colors cursor-pointer active:scale-95 truncate text-center"
                                title="รีวิวผู้รับเลี้ยง"
                              >
                                รีวิว
                              </Link>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* ส่วนที่ 2: สัตว์ที่รับเลี้ยง (Requirement 4) */}
        {/* ตาราง: สัตว์ | รับมาจาก | การจัดการ (อัพเดต, รีวิวเจ้าของ) */}
        {/* ============================================================ */}
        <div className="space-y-4 pt-8">
          <div className="border-b border-gray-200 pb-2">
            <h2 className="text-2xl font-bold text-gray-900 tracking-tight">
              สัตว์ที่รับเลี้ยง
            </h2>
            <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
              รายการสัตว์เลี้ยงที่คุณได้รับเลี้ยงไปแล้ว คุณสามารถส่งรูปภาพอัปเดตความเป็นอยู่ และเขียนรีวิวเจ้าของเดิมได้ที่นี่
            </p>
          </div>

          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-muted-foreground gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <p className="text-sm">กำลังโหลดข้อมูลสัตว์ที่รับเลี้ยง...</p>
            </div>
          ) : adoptedPets.length === 0 ? (
            <div className="border border-dashed border-gray-300 rounded-xl p-8 text-center text-gray-500 bg-gray-50/50 text-sm">
              <p>ยังไม่มีสัตว์เลี้ยงที่คุณรับเลี้ยงในระบบ</p>
              <p className="text-xs text-gray-400 mt-1">
                เมื่อใบสมัครของคุณได้รับการอนุมัติและเปลี่ยนสถานะเป็น adopted สัตว์เลี้ยงจะปรากฏในตารางนี้
              </p>
            </div>
          ) : (
            <div className="border border-gray-300 rounded-lg overflow-hidden bg-white shadow-2xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-gray-300 bg-gray-50/70 text-gray-800 font-bold">
                      <th className="py-3.5 px-4 w-[35%]">สัตว์</th>
                      <th className="py-3.5 px-4 w-[35%]">รับมาจาก</th>
                      <th className="py-3.5 px-4 w-[30%] min-w-[260px]">การจัดการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {adoptedPets.map((pet) => {
                      const ownerName = pet.owner?.fullName || 'ศูนย์ช่วยเหลือสัตว์ PetHome';
                      return (
                        <tr key={pet.id} className="hover:bg-gray-50/50 transition-colors">
                          {/* 1. สัตว์ */}
                          <td className="py-4 px-4 font-medium text-gray-900">
                            <Link
                              href={`/pets/${pet.id}`}
                              className="hover:underline hover:text-blue-600 font-bold transition-colors inline-block"
                            >
                              {pet.name}
                            </Link>
                            <span className="text-xs text-gray-500 block">
                              {pet.type} • {pet.breed || 'ไม่ระบุสายพันธุ์'}
                            </span>
                          </td>

                          {/* 2. รับมาจาก */}
                          <td className="py-4 px-4 text-gray-800">
                            {ownerName}
                          </td>

                          {/* 3. การจัดการ: ดูอัพเดต:รีวิว is 3:1 */}
                          <td className="py-4 px-4">
                            <div className="flex items-center gap-1.5 w-full max-w-[280px]">
                              {/* ปุ่ม ดูอัพเดต (3 ส่วน) */}
                              <Link
                                href={`/pets/${pet.id}/updates`}
                                className="flex-[3] min-w-0 inline-flex items-center justify-center px-2 py-1.5 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-colors cursor-pointer active:scale-95 truncate text-center"
                              >
                                ดูอัพเดต
                              </Link>

                              {/* ปุ่ม รีวิว (1 ส่วน) */}
                              <Link
                                href={`/reviews?targetUserId=${pet.owner?.id || pet.ownerId}&targetUserName=${encodeURIComponent(ownerName)}&petName=${encodeURIComponent(pet.name)}&role=owner`}
                                className="flex-1 min-w-0 inline-flex items-center justify-center px-2 py-1.5 text-xs font-medium rounded-lg bg-orange-600 hover:bg-orange-700 text-white shadow-xs transition-colors cursor-pointer active:scale-95 truncate text-center"
                                title="รีวิวเจ้าของ"
                              >
                                รีวิว
                              </Link>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* 3. กล่องยืนยัน: เปลี่ยนเป็น adopted ตรงกลางหน้าจอพร้อม Blur พื้นหลัง */}
        {confirmAdoptPet && (
          <div
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-md animate-in fade-in duration-200"
            onClick={() => setConfirmAdoptPet(null)}
          >
            <div
              className="bg-white w-full max-w-lg rounded-2xl border border-gray-300 shadow-2xl p-6 sm:p-8 space-y-4 animate-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-gray-200 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-full bg-emerald-50 flex items-center justify-center border border-emerald-200">
                    <CheckCircle className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-gray-900">
                      กล่องยืนยัน: เปลี่ยนสถานะเป็น adopted
                    </h2>
                    <p className="text-xs text-gray-500">
                      {confirmAdoptPet.name} ({confirmAdoptPet.breed || confirmAdoptPet.type})
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setConfirmAdoptPet(null)}
                  className="p-1 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 cursor-pointer transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-2 text-sm text-gray-800 bg-gray-50 p-4 rounded-xl border border-gray-200">
                <p className="font-semibold text-gray-900">
                  ยืนยันว่า &apos;{confirmAdoptPet.name}&apos; ถูกรับเลี้ยงโดย{getAdopterNameForConfirmation(confirmAdoptPet)}แล้ว?
                </p>
                <p className="text-xs text-gray-600 leading-relaxed">
                  สถานะ adopted จะซ่อนประกาศจากการค้นหา และเปิดสิทธิ์รีวิว/ส่งรูปอัปเดต
                </p>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setConfirmAdoptPet(null)}
                  className="px-6 h-9 border-gray-300 bg-white hover:bg-gray-50 text-gray-700 font-medium rounded-lg text-sm cursor-pointer shadow-2xs"
                >
                  ยกเลิก
                </Button>
                <Button
                  type="button"
                  disabled={isUpdatingStatus}
                  onClick={handleConfirmAdopted}
                  className="px-6 h-9 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg text-sm cursor-pointer shadow-xs transition-colors"
                >
                  {isUpdatingStatus ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>กำลังยืนยัน...</span>
                    </span>
                  ) : (
                    'ยืนยัน'
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: ดูรายชื่อผู้สนใจ (Applicants Modal) */}
        {viewApplicantsPet && (
          <div
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-md animate-in fade-in duration-200"
            onClick={() => setViewApplicantsPet(null)}
          >
            <div
              className="bg-white w-full max-w-2xl rounded-xl border border-gray-300 shadow-xl overflow-hidden p-6 space-y-4 animate-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center border-b border-gray-200 pb-3">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">
                    รายชื่อผู้สนใจรับเลี้ยง {viewApplicantsPet.name}
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    ตรวจสอบความพร้อมและเลือกผู้รับเลี้ยงที่เหมาะสม
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setViewApplicantsPet(null)}
                  className="p-1 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="max-h-[60vh] overflow-y-auto space-y-3">
                {(!viewApplicantsPet.applications || viewApplicantsPet.applications.length === 0) ? (
                  <p className="text-sm text-gray-500 text-center py-8">
                    ยังไม่มีผู้ส่งแบบประเมินความพร้อมสำหรับสัตว์เลี้ยงนี้
                  </p>
                ) : (
                  viewApplicantsPet.applications.map((app, idx) => {
                    const isSelected = app.status === 'APPROVED' || app.status === 'approved' || app.status === 'accepted';
                    return (
                      <div
                        key={app.id || idx}
                        className={`border rounded-lg p-4 space-y-2 transition-colors ${
                          isSelected
                            ? 'border-emerald-300 bg-emerald-50/40'
                            : 'border-gray-200 hover:border-gray-300 bg-[#fafafa]'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-gray-900 text-sm">
                              {app.applicant?.fullName || 'ผู้สนใจ'}
                            </span>
                            {isSelected && (
                              <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-full">
                                ✓ ได้รับคัดเลือกแล้ว (Pending)
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-gray-500">
                            {new Date(app.createdAt).toLocaleDateString('th-TH')}
                          </span>
                        </div>

                        <div className="text-xs text-gray-700 space-y-1">
                          <p><strong>ที่อยู่อาศัย:</strong> {app.housingType}</p>
                          <p><strong>ช่วงรายได้:</strong> {app.incomeRange || 'ไม่ระบุ'}</p>
                          <p><strong>ประสบการณ์:</strong> {app.petExperience || 'ไม่มี'}</p>
                          {app.additionalNote && (
                            <p className="whitespace-pre-line text-gray-600 bg-white p-2 rounded-md border border-gray-100 mt-1">
                              {app.additionalNote}
                            </p>
                          )}
                        </div>

                        <div className="pt-2 flex justify-end gap-2">
                          <Link
                            href={`/chat?user=${app.applicant?.id || app.applicantId}&userName=${encodeURIComponent(app.applicant?.fullName || 'ผู้สนใจ')}&petName=${encodeURIComponent(viewApplicantsPet.name)}&petId=${viewApplicantsPet.id}&petStatus=${viewApplicantsPet.status}`}
                            className="inline-flex items-center justify-center gap-1.5 h-8 px-3 text-xs border border-gray-300 rounded-md bg-white hover:bg-gray-50 text-gray-700 font-medium cursor-pointer shadow-2xs active:scale-95 transition-colors"
                          >
                            <MessageSquare className="w-3.5 h-3.5 text-gray-500" />
                            <span>แชทสอบถาม</span>
                          </Link>
                          <Button
                            type="button"
                            onClick={() =>
                              handleSelectApplicant(
                                viewApplicantsPet.id,
                                app.id,
                                app.applicant?.id || app.applicantId,
                                app.applicant?.fullName || 'ผู้สนใจ'
                              )
                            }
                            className={`h-8 px-3 text-xs font-medium rounded-md cursor-pointer transition-colors shadow-xs ${
                              isSelected
                                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                : 'bg-blue-600 hover:bg-blue-700 text-white'
                            }`}
                          >
                            {isSelected ? 'เลือกแล้ว (แจ้งเตือนซ้ำ)' : 'เลือกผู้รับเลี้ยงนี้ (เป็น pending)'}
                          </Button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="flex justify-end pt-2 border-t border-gray-200">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setViewApplicantsPet(null)}
                  className="px-4 h-9 text-sm cursor-pointer"
                >
                  ปิด
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: ยืนยันการลบ (Delete Confirmation Modal) */}
        {deletePetTarget && (
          <div
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-md animate-in fade-in duration-200"
            onClick={() => setDeletePetTarget(null)}
          >
            <div
              className="bg-white w-full max-w-md rounded-xl border border-gray-300 shadow-xl p-6 space-y-4 animate-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 text-red-600">
                <AlertCircle className="w-6 h-6 shrink-0" />
                <h3 className="text-lg font-bold text-gray-900">ยืนยันการลบประกาศ</h3>
              </div>

              <p className="text-sm text-gray-700">
                คุณแน่ใจหรือไม่ว่าต้องการลบประกาศหาบ้านของ <strong>&apos;{deletePetTarget.name}&apos;</strong>? การกระทำนี้ไม่สามารถย้อนกลับได้
              </p>

              <div className="flex justify-end gap-3 pt-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDeletePetTarget(null)}
                  className="px-5 h-9 text-sm cursor-pointer"
                >
                  ยกเลิก
                </Button>
                <Button
                  type="button"
                  disabled={isDeleting}
                  onClick={handleConfirmDelete}
                  className="px-5 h-9 bg-red-600 hover:bg-red-700 text-white text-sm cursor-pointer"
                >
                  {isDeleting ? 'กำลังลบ...' : 'ลบประกาศ'}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: แก้ไขประกาศสัตว์เลี้ยงที่ออกแบบสวยงาม (Designed Edit Pet Modal) */}
        {editPetTarget && (
          <div
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-md animate-in fade-in duration-200"
            onClick={() => setEditPetTarget(null)}
          >
            <div
              className="bg-white w-full max-w-lg rounded-2xl border border-gray-300 shadow-2xl p-6 space-y-4 animate-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center border-b border-gray-200 pb-3">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">
                    แก้ไขประกาศ: {editPetTarget.name}
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    ปรับปรุงข้อมูลและสถานะของสัตว์เลี้ยง
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditPetTarget(null)}
                  className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3.5 text-sm max-h-[65vh] overflow-y-auto pr-1">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="font-semibold text-gray-800 text-xs">ชื่อสัตว์เลี้ยง</label>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full h-9 px-3 border border-gray-300 rounded-md text-sm focus:outline-hidden focus:ring-1 focus:ring-primary"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-gray-800 text-xs">ชนิดสัตว์</label>
                    <select
                      value={editType}
                      onChange={(e) => {
                        const selected = PET_TYPES.find(({ value }) => value === e.target.value);
                        if (selected) setEditType(selected.value);
                      }}
                      className="w-full h-9 px-2.5 border border-gray-300 rounded-md text-sm bg-white focus:outline-hidden focus:ring-1 focus:ring-primary"
                    >
                      {PET_TYPES.map(({ value, label }) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="font-semibold text-gray-800 text-xs">สายพันธุ์</label>
                    <input
                      type="text"
                      value={editBreed}
                      onChange={(e) => setEditBreed(e.target.value)}
                      className="w-full h-9 px-3 border border-gray-300 rounded-md text-sm focus:outline-hidden focus:ring-1 focus:ring-primary"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-gray-800 text-xs">อายุ (เดือน)</label>
                    <input
                      type="number"
                      placeholder="เช่น 14"
                      value={editAgeMonths}
                      onChange={(e) => setEditAgeMonths(e.target.value)}
                      className="w-full h-9 px-3 border border-gray-300 rounded-md text-sm focus:outline-hidden focus:ring-1 focus:ring-primary"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-gray-800 text-xs">สถานะประกาศ</label>
                  <select
                    value={editStatus}
                    onChange={(e) => {
                      const status = e.target.value;
                      if (status === 'available' || status === 'pending' || status === 'adopted') {
                        setEditStatus(status);
                      }
                    }}
                    className="w-full h-9 px-2.5 border border-gray-300 rounded-md text-sm bg-white focus:outline-hidden focus:ring-1 focus:ring-primary font-medium"
                  >
                    <option value="available">available (เปิดรับเลี้ยง)</option>
                    <option value="pending">pending (รอการตัดสินใจ)</option>
                    <option value="adopted">adopted (ได้บ้านแล้ว)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-gray-800 text-xs">ที่พักพิง / พื้นที่</label>
                  <input
                    type="text"
                    value={editLocation}
                    onChange={(e) => setEditLocation(e.target.value)}
                    className="w-full h-9 px-3 border border-gray-300 rounded-md text-sm focus:outline-hidden focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-gray-800 text-xs">เงื่อนไขการรับเลี้ยง</label>
                  <textarea
                    rows={3}
                    value={editConditions}
                    onChange={(e) => setEditConditions(e.target.value)}
                    placeholder="เช่น มีพื้นที่วิ่งเล่น เลี้ยงระบบปิด"
                    className="w-full p-2.5 border border-gray-300 rounded-md text-sm focus:outline-hidden focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-gray-200">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditPetTarget(null)}
                  className="px-4 h-9 text-sm cursor-pointer"
                >
                  ยกเลิก
                </Button>
                <Button
                  type="button"
                  disabled={isSavingEdit}
                  onClick={handleSaveEdit}
                  className="px-5 h-9 bg-primary text-primary-foreground text-sm cursor-pointer"
                >
                  {isSavingEdit ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function MyPetsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-white flex flex-col font-sans">
          <Navbar activePage="my-pets" />
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm">กำลังโหลดข้อมูล...</p>
          </div>
        </div>
      }
    >
      <MyPostsContent />
    </Suspense>
  );
}
