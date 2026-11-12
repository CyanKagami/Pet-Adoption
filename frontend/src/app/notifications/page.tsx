// src/app/notifications/page.tsx
'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import {
  MessageSquare,
  CheckCircle2,
  XCircle,
  X,
  Loader2,
  Bell,
  Lock,
} from 'lucide-react';
import Navbar from '@/components/Navbar';
import { api } from '@/lib/api';

interface NotificationItem {
  id: string;
  dbId?: string;
  isApplicantNotification?: boolean;
  applicantId: string | null;
  applicantName: string;
  applicantProfileImage?: string | null;
  ownerId?: string;
  ownerName?: string;
  petName: string;
  petId?: string;
  petBreed?: string;
  petImage?: string | null;
  petStatus: string;
  title: string;
  time: string;
  type: 'application' | 'update' | 'application_result';
  status?: 'pending' | 'accepted' | 'cancelled';
  rating: number | null;
  reviewsCount: number;
  joinDate: string | null;
  isVerified: boolean | null;
  housing: string | null;
  experience: string | null;
  income: string | null;
  householdMembers: number | null;
  reviews: { stars: number; comment: string }[];
  note?: string;
  updateDetails?: {
    description: string;
    images: string[];
    date: string;
  };
}

function NotificationsContent() {
  const searchParams = useSearchParams();
  const applicantParam = searchParams.get('applicant');

  const [currentUser, setCurrentUser] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionNotice, setActionNotice] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  // ดึงข้อมูลการแจ้งเตือนจริงจากฐานข้อมูลเฉพาะของเจ้าของบัญชี (Requirement 2: Only own only can read)
  useEffect(() => {
    const loadRealNotifications = async () => {
      try {
        setLoading(true);
        const authRes = await api.auth.me().catch(() => null) as {
          success?: unknown;
          user?: unknown;
        } | null;
        const isAuthenticated =
          authRes?.success === true &&
          typeof authRes.user === 'object' &&
          authRes.user !== null;
        if (isAuthenticated) {
          setCurrentUser(true);
          const res = await api.notifications.getAll();
          if (res.success && Array.isArray(res.data)) {
            setNotifications(res.data);
          } else {
            setNotifications([]);
          }
        } else {
          setCurrentUser(false);
          setNotifications([]);
        }
      } catch (err) {
        console.error('Failed to load notifications:', err);
        setNotifications([]);
      } finally {
        setLoading(false);
      }
    };

    loadRealNotifications();
  }, []);

  const selectedNotif =
    notifications.find((n) => n.id === selectedId) ||
    (applicantParam ? notifications.find((n) => n.applicantId === applicantParam) : undefined) ||
    notifications[0] ||
    null;

  const showToast = (type: 'success' | 'error' | 'info', message: string) => {
    setActionNotice({ type, message });
    setTimeout(() => {
      setActionNotice(null);
    }, 4000);
  };

  // ตกลงให้รับเลี้ยง (-> pending) พร้อมแจ้งเตือนผู้รับเลี้ยง
  const handleAcceptPending = async () => {
    if (!selectedNotif) return;
    setIsUpdatingStatus(true);
    try {
      if (selectedNotif.petId) {
        await api.pets.update(selectedNotif.petId, { status: 'pending' });
      }
      if (selectedNotif.dbId && (selectedNotif.type === 'application' || selectedNotif.type === 'application_result')) {
        await api.applications.updateStatus(selectedNotif.dbId, 'accepted');
      }

      setNotifications((prev) =>
        prev.map((n) =>
          n.id === selectedNotif.id
            ? { ...n, petStatus: 'pending', status: 'accepted' }
            : n.petName === selectedNotif.petName
            ? { ...n, petStatus: 'pending' }
            : n
        )
      );

      showToast(
        'success',
        `ตกลงให้ '${selectedNotif.applicantName}' รับเลี้ยง '${selectedNotif.petName}' เรียบร้อยแล้ว (สถานะเปลี่ยนเป็น pending) และส่งข้อความแจ้งเตือนผู้รับเลี้ยงแล้ว`
      );
    } catch {
      showToast('error', 'เกิดข้อผิดพลาดในการอัปเดตสถานะ');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  // ยืนยันสถานะ adopted จากหน้าแจ้งเตือน
  const handleConfirmAdoptedFromNotification = async () => {
    if (!selectedNotif || !selectedNotif.petId) return;
    setIsUpdatingStatus(true);
    try {
      await api.pets.update(selectedNotif.petId, { status: 'adopted' });

      setNotifications((prev) =>
        prev.map((n) =>
          n.id === selectedNotif.id || n.petId === selectedNotif.petId
            ? { ...n, petStatus: 'adopted' }
            : n
        )
      );

      showToast(
        'success',
        `เปลี่ยนสถานะ '${selectedNotif.petName}' เป็น adopted เรียบร้อยแล้ว และส่งข้อความแจ้งเตือนผู้รับเลี้ยงแล้ว`
      );
    } catch {
      showToast('error', 'เกิดข้อผิดพลาดในการยืนยัน');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  // Requirement: เมื่อคลิกยกเลิก/ปฏิเสธ ให้เปลี่ยนไปแสดงเฉพาะสถานะยกเลิก (Show only cancel status)
  const handleReject = async () => {
    if (!selectedNotif) return;
    try {
      if (selectedNotif.dbId && selectedNotif.type === 'application') {
        await api.applications.updateStatus(selectedNotif.dbId, 'cancelled');
      }

      setNotifications((prev) =>
        prev.map((n) =>
          n.id === selectedNotif.id
            ? { ...n, status: 'cancelled' }
            : n
        )
      );

      showToast('info', `ปฏิเสธคำขอรับเลี้ยงของ '${selectedNotif.applicantName}' เรียบร้อยแล้ว`);
    } catch {
      showToast('error', 'เกิดข้อผิดพลาดในการปฏิเสธ');
    }
  };

  // Requirement 2: Notification page, Only own only can read
  if (!currentUser && !loading) {
    return (
      <div className="min-h-screen bg-white flex flex-col font-sans text-foreground">
        <Navbar activePage="notifications" />
        <main className="max-w-md mx-auto px-4 py-24 text-center space-y-4">
          <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto border border-blue-200">
            <Lock className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">เข้าสู่ระบบเพื่อดูการแจ้งเตือน</h1>
          <p className="text-sm text-gray-600">
            เฉพาะเจ้าของประกาศเท่านั้นที่สามารถเข้าถึงและอ่านการแจ้งเตือนได้ กรุณาเข้าสู่ระบบก่อนเข้าถึงข้อมูล
          </p>
          <div className="pt-2">
            <Link
              href="/login?redirect=/notifications"
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
      <Navbar activePage="notifications" />

      {/* 2. Main Notification Content (Wireframe 07-7-Notification-profile 1) */}
      <main className="max-w-6xl mx-auto px-4 sm:px-8 py-6 w-full flex-1 flex flex-col space-y-4">
        
        {/* Toast Alert */}
        {actionNotice && (
          <div
            className={`p-3 rounded-lg text-sm flex items-center justify-between animate-in fade-in duration-150 ${
              actionNotice.type === 'success'
                ? 'bg-green-50 border border-green-200 text-green-800'
                : actionNotice.type === 'error'
                ? 'bg-red-50 border border-red-200 text-red-800'
                : 'bg-blue-50 border border-blue-200 text-blue-800'
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

        {loading ? (
          <div className="border border-gray-300 rounded-lg p-24 flex flex-col items-center justify-center text-muted-foreground gap-3 bg-white">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm">กำลังโหลดการแจ้งเตือนจากฐานข้อมูล...</p>
          </div>
        ) : notifications.length === 0 ? (
          /* Empty State เมื่อไม่มีข้อมูลใน Database (เช่น หลังรัน npm run delData) */
          <div className="border border-dashed border-gray-300 bg-white rounded-lg p-16 text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto border border-blue-200">
              <Bell className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h2 className="text-base font-bold text-gray-900">ยังไม่มีการแจ้งเตือนในระบบ</h2>
              <p className="text-xs sm:text-sm text-gray-500 max-w-sm mx-auto">
                เมื่อมีผู้สนใจยื่นแบบประเมินความพร้อมรับเลี้ยง หรือมีการส่งรูปอัปเดตสัตว์เลี้ยง จะแสดงผลในหน้านี้
              </p>
            </div>
          </div>
        ) : selectedNotif ? (
          <div className="border border-gray-400 bg-white rounded-lg flex-1 flex flex-col md:flex-row min-h-[580px] overflow-hidden shadow-2xs">
            
            {/* คอลัมน์ซ้าย: รายการแจ้งเตือน (Left Column) */}
            <section className="w-full md:w-80 border-b md:border-b-0 md:border-r border-gray-400 flex flex-col bg-white">
              <div className="p-4 border-b border-gray-300">
                <h2 className="text-base font-bold text-gray-900 tracking-tight">
                  แจ้งเตือน ({notifications.length})
                </h2>
              </div>

              <div className="p-3 space-y-2.5 flex-1 overflow-y-auto">
                {notifications.map((notif) => {
                  const isSelected = notif.id === selectedNotif.id;

                  return (
                    <button
                      key={notif.id}
                      type="button"
                      onClick={() => setSelectedId(notif.id)}
                      className={`w-full text-left p-3.5 rounded-lg border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-[#dbeafe] border-[#bfdbfe] text-[#1e40af] shadow-2xs'
                          : 'bg-white border-gray-300 hover:border-gray-400 hover:bg-gray-50/50 text-gray-900'
                      }`}
                    >
                      <div className="font-bold text-sm">
                        {notif.title}
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <span className={`text-xs ${isSelected ? 'text-blue-800' : 'text-gray-500'}`}>
                          {notif.time}
                        </span>
                        {notif.status === 'cancelled' && (
                          <span className="text-[10px] font-semibold text-red-700 bg-red-100 border border-red-300 px-1.5 py-0.5 rounded">
                            ปฏิเสธแล้ว
                          </span>
                        )}
                        {notif.status === 'accepted' && (
                          <span className="text-[10px] font-semibold text-green-800 bg-green-100 border border-green-300 px-1.5 py-0.5 rounded">
                            ตกลงรับเลี้ยงแล้ว
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* คอลัมน์ขวา: รายละเอียดการแจ้งเตือน (Right Column) */}
            <section className="flex-1 flex flex-col bg-white p-6 sm:p-8 justify-between space-y-6">
              {selectedNotif.isApplicantNotification ? (
                /* ========================================================= */
                /* มุมมองของผู้รับเลี้ยง/ผู้ยื่นขอ (Applicant Notification View) */
                /* ========================================================= */
                <div className="space-y-6">
                  <div className="border-b border-gray-200 pb-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-100 text-blue-800 border border-blue-200">
                        การแจ้งเตือนคำขอรับเลี้ยง
                      </span>
                      <span className="text-xs text-gray-500">{selectedNotif.time}</span>
                    </div>
                    <h1 className="text-xl font-bold text-gray-900 tracking-tight mt-2">
                      {selectedNotif.title}
                    </h1>
                  </div>

                  {/* แบนเนอร์ผลการพิจารณา */}
                  {selectedNotif.status === 'accepted' ? (
                    <div className="p-4 rounded-xl bg-green-50 border border-green-200 text-green-900 flex items-start gap-3 animate-in fade-in">
                      <CheckCircle2 className="w-6 h-6 text-green-600 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <div className="font-bold text-sm text-green-900">
                          {selectedNotif.petStatus === 'adopted'
                            ? '🎉 การรับเลี้ยงเสร็จสมบูรณ์เรียบร้อยแล้ว!'
                            : '🎉 ยินดีด้วย! คุณได้รับการคัดเลือกให้เป็นผู้รับเลี้ยง'}
                        </div>
                        <p className="text-xs text-green-800 leading-relaxed">
                          {selectedNotif.note ||
                            `เจ้าของได้คัดเลือกคุณให้เป็นผู้รับเลี้ยงน้อง "${selectedNotif.petName}" เรียบร้อยแล้ว กรุณากดปุ่ม "แชท" เพื่อพูดคุยเตรียมนัดรับน้อง`}
                        </p>
                      </div>
                    </div>
                  ) : selectedNotif.status === 'cancelled' ? (
                    <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-900 flex items-start gap-3 animate-in fade-in">
                      <XCircle className="w-6 h-6 text-red-600 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <div className="font-bold text-sm text-red-900">
                          คำขอรับเลี้ยงไม่ผ่านการคัดเลือก
                        </div>
                        <p className="text-xs text-red-800 leading-relaxed">
                          {selectedNotif.note ||
                            `ขออภัย คำขอรับเลี้ยงน้อง "${selectedNotif.petName}" ไม่ผ่านการคัดเลือกในครั้งนี้`}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 flex items-start gap-3 animate-in fade-in">
                      <Bell className="w-6 h-6 text-blue-600 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <div className="font-bold text-sm text-blue-900">
                          คำขอรับเลี้ยงอยู่ระหว่างการพิจารณา
                        </div>
                        <p className="text-xs text-blue-800 leading-relaxed">
                          {selectedNotif.note ||
                            `ใบสมัครของคุณส่งถึงเจ้าของแล้ว เจ้าของกำลังตรวจสอบแบบประเมินความพร้อม`}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* กล่อง 2 ฝั่ง: สัตว์เลี้ยงที่ขอรับเลี้ยง & ข้อมูลผู้ลงประกาศ */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* สัตว์เลี้ยง */}
                    <div className="border border-gray-300 rounded-xl p-4 bg-gray-50/50 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                          สัตว์เลี้ยง
                        </span>
                        <span
                          className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                            selectedNotif.petStatus === 'available'
                              ? 'bg-green-100 text-green-800 border border-green-200'
                              : selectedNotif.petStatus === 'pending'
                              ? 'bg-amber-100 text-amber-800 border border-amber-200'
                              : 'bg-gray-200 text-gray-700 border border-gray-300'
                          }`}
                        >
                          {selectedNotif.petStatus === 'available'
                            ? 'เปิดรับเลี้ยง'
                            : selectedNotif.petStatus === 'pending'
                            ? 'รอส่งมอบ'
                            : 'ได้บ้านแล้ว'}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="relative w-16 h-16 rounded-lg bg-gray-200 overflow-hidden border border-gray-300 shrink-0 flex items-center justify-center">
                          {selectedNotif.petImage ? (
                            <Image
                              src={selectedNotif.petImage}
                              alt={selectedNotif.petName}
                              fill
                              sizes="64px"
                              unoptimized
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <span className="text-gray-400 text-xs">รูป</span>
                          )}
                        </div>
                        <div className="space-y-0.5">
                          <h4 className="font-bold text-base text-gray-900">{selectedNotif.petName}</h4>
                          <p className="text-xs text-gray-500">{selectedNotif.petBreed || 'สัตว์เลี้ยงหาบ้าน'}</p>
                          {selectedNotif.petId && (
                            <Link
                              href={`/pets/${selectedNotif.petId}`}
                              className="text-xs text-blue-600 hover:underline inline-block font-medium pt-1"
                            >
                              ดูหน้ารายละเอียดสัตว์เลี้ยง →
                            </Link>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* ผู้ลงประกาศ (เจ้าของเดิม) */}
                    <div className="border border-gray-300 rounded-xl p-4 bg-gray-50/50 space-y-3">
                      <span className="text-xs font-bold text-gray-500 uppercase tracking-wider block">
                        ผู้ลงประกาศหาบ้าน
                      </span>
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-sm border border-blue-200 shrink-0">
                          {selectedNotif.applicantName?.charAt(0) || 'U'}
                        </div>
                        <div className="space-y-0.5">
                          <h4 className="font-bold text-sm text-gray-900 flex items-center gap-1">
                            {selectedNotif.applicantName}
                            {selectedNotif.isVerified === true && (
                              <span className="text-green-600 text-xs">✓</span>
                            )}
                          </h4>
                          <p className={`text-xs font-semibold ${selectedNotif.rating !== null ? 'text-amber-500' : 'text-gray-500'}`}>
                            {selectedNotif.rating !== null ? `★ ${selectedNotif.rating}` : 'ยังไม่มีคะแนน'}
                            {' '}({selectedNotif.reviewsCount} รีวิว)
                          </p>
                          <p className="text-xs text-gray-500">
                            {selectedNotif.joinDate || 'ไม่ทราบวันที่สมัคร'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* ========================================================= */
                /* มุมมองของผู้ลงประกาศตรวจสอบผู้สนใจ (Owner Application View) */
                /* ========================================================= */
                <div className="space-y-6">
                  {/* หัวข้อ: โปรไฟล์ผู้สนใจรับเลี้ยง */}
                  <h1 className="text-lg font-bold text-gray-900 tracking-tight">
                    {selectedNotif.type === 'update' ? 'ข้อมูลผู้รับเลี้ยง' : 'โปรไฟล์ผู้สนใจรับเลี้ยง'}
                    {' – '}{selectedNotif.applicantName}
                  </h1>

                  {/* กล่องโปรไฟล์ผู้ใช้ */}
                  <div className="flex items-start gap-4">
                    <div className="relative w-24 h-24 sm:w-28 sm:h-28 border border-gray-300 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400 text-sm font-medium shrink-0 overflow-hidden">
                      {selectedNotif.applicantProfileImage ? (
                        <Image
                          src={selectedNotif.applicantProfileImage}
                          alt=""
                          fill
                          sizes="(max-width: 640px) 96px, 112px"
                          unoptimized
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span>รูป</span>
                      )}
                    </div>

                    <div className="space-y-1.5 pt-1">
                      <div className="flex items-center gap-2">
                        <h2 className="text-xl font-bold text-gray-900">
                          {selectedNotif.applicantName}
                        </h2>
                        {selectedNotif.status === 'cancelled' && (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-800 border border-red-200">
                            สถานะ: ปฏิเสธแล้ว
                          </span>
                        )}
                        {selectedNotif.status === 'accepted' && (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-800 border border-green-200">
                            สถานะ: ตอบรับแล้ว
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 text-xs sm:text-sm text-gray-700">
                        {selectedNotif.rating !== null ? (
                          <span className="flex items-center text-amber-500 font-semibold">
                            ★ {selectedNotif.rating}
                          </span>
                        ) : (
                          <span className="text-gray-500">ยังไม่มีคะแนน</span>
                        )}
                        <span>
                          ({selectedNotif.reviewsCount} รีวิว) • {selectedNotif.joinDate || 'ไม่ทราบวันที่สมัคร'}
                        </span>
                      </div>
                      <div className={`flex items-center gap-1 text-xs sm:text-sm font-medium pt-0.5 ${
                        selectedNotif.isVerified === true ? 'text-emerald-700' : 'text-gray-500'
                      }`}>
                        <span>
                          {selectedNotif.isVerified === true
                            ? 'ยืนยันตัวตน: ✓'
                            : selectedNotif.isVerified === false
                              ? 'ยังไม่ยืนยันตัวตน'
                              : 'ไม่ทราบสถานะการยืนยัน'}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 pt-0.5">
                        สัตว์เลี้ยงที่สนใจ: <strong className="text-gray-800">{selectedNotif.petName}</strong>{' '}
                        (สถานะ: {selectedNotif.petStatus})
                      </div>
                    </div>
                  </div>

                  {/* 2 กล่องซ้ายขวา: ข้อมูลจากฟอร์มประเมิน & รีวิวจากผู้หาบ้านคนอื่น */}
                  <div className={`grid grid-cols-1 gap-4 pt-2 ${
                    selectedNotif.type === 'application' ? 'sm:grid-cols-2' : ''
                  }`}>
                    {/* กล่อง 1: ข้อมูลจากฟอร์มประเมิน */}
                    {selectedNotif.type === 'application' && (
                      <div className="border border-gray-400 rounded-lg p-5 bg-white space-y-2.5">
                        <h3 className="font-bold text-sm text-gray-900">
                          ข้อมูลจากฟอร์มประเมิน
                        </h3>
                        <ul className="text-xs sm:text-sm text-gray-800 space-y-2">
                          <li className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-gray-500 shrink-0" />
                            <span>ที่อยู่อาศัย: {selectedNotif.housing || 'ไม่ระบุ'}</span>
                          </li>
                          <li className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-gray-500 shrink-0" />
                            <span>ประสบการณ์: {selectedNotif.experience || 'ไม่ระบุ'}</span>
                          </li>
                          <li className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-gray-500 shrink-0" />
                            <span>รายได้: {selectedNotif.income || 'ไม่ระบุ'}</span>
                          </li>
                          <li className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-gray-500 shrink-0" />
                            <span>สมาชิกในบ้าน: {selectedNotif.householdMembers ?? 'ไม่ระบุ'}</span>
                          </li>
                        </ul>
                      </div>
                    )}

                    {/* กล่อง 2: รีวิวจากผู้หาบ้านคนอื่น */}
                    <div className="border border-gray-400 rounded-lg p-5 bg-white space-y-2.5">
                      <h3 className="font-bold text-sm text-gray-900">
                        {selectedNotif.type === 'update'
                          ? 'รีวิวจากผู้รับเลี้ยง'
                          : 'รีวิวจากผู้หาบ้านคนอื่น'}
                      </h3>
                      <div className="text-xs sm:text-sm text-gray-800 space-y-2.5">
                        {selectedNotif.reviews.length > 0 ? (
                          selectedNotif.reviews.map((rev, idx) => (
                            <div key={idx} className="flex items-baseline gap-2">
                              <span className="text-amber-500 font-bold shrink-0 text-xs">
                                {'★'.repeat(rev.stars)}{'☆'.repeat(5 - rev.stars)}
                              </span>
                              <span className="italic text-gray-800">&apos;{rev.comment}&apos;</span>
                            </div>
                          ))
                        ) : (
                          <p className="text-gray-500">ยังไม่มีรีวิว</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* กรณีเป็นการแจ้งเตือนแบบอัปเดตความเป็นอยู่ */}
                  {selectedNotif.updateDetails && (
                    <div className="border border-blue-200 bg-blue-50/50 rounded-lg p-4 text-xs text-blue-900 space-y-1">
                      <p className="font-bold">รายละเอียดการอัปเดต ({selectedNotif.updateDetails.date}):</p>
                      <p>{selectedNotif.updateDetails.description}</p>
                    </div>
                  )}
                </div>
              )}

              {/* แถบปุ่มด้านล่าง (Bottom Action Buttons / Status Area) */}
              <div className="pt-6 border-t border-gray-200">
                {selectedNotif.type === 'update' ? (
                  <p className="text-sm text-gray-600">
                    เป็นการแจ้งเตือนอัปเดตความเป็นอยู่ ไม่มีการดำเนินการเกี่ยวกับใบสมัคร
                  </p>
                ) : selectedNotif.isApplicantNotification ? (
                  /* ปุ่มสำหรับผู้รับการแจ้งเตือน (Applicant Action Buttons) */
                  <div className="flex flex-wrap items-center justify-between sm:justify-end gap-3">
                    {/* ปุ่ม แชทกับเจ้าของ */}
                    <Link
                      href={`/chat?user=${selectedNotif.ownerId || selectedNotif.applicantId}&userName=${encodeURIComponent(
                        selectedNotif.ownerName || selectedNotif.applicantName
                      )}&petName=${encodeURIComponent(selectedNotif.petName)}&petId=${selectedNotif.petId || ''}&petStatus=${
                        selectedNotif.petStatus || ''
                      }`}
                      className="inline-flex items-center justify-center gap-1.5 px-6 h-10 border border-gray-400 rounded-lg text-sm font-medium text-gray-800 bg-white hover:bg-gray-50 transition-colors cursor-pointer shadow-2xs active:scale-95"
                    >
                      <MessageSquare className="w-4 h-4 text-gray-600" />
                      <span>แชทกับเจ้าของ</span>
                    </Link>

                    {/* ปุ่ม ดูประกาศสัตว์เลี้ยง */}
                    {selectedNotif.petId && (
                      <Link
                        href={`/pets/${selectedNotif.petId}`}
                        className="inline-flex items-center justify-center px-6 h-10 border border-gray-400 rounded-lg text-sm font-medium text-gray-800 bg-white hover:bg-gray-50 transition-colors cursor-pointer shadow-2xs active:scale-95"
                      >
                        <span>ดูประกาศ</span>
                      </Link>
                    )}

                    {/* หากสถานะเป็น adopted แล้ว: ให้สามารถส่งรูปอัปเดตและเขียนรีวิวได้ */}
                    {selectedNotif.petStatus === 'adopted' && (
                      <>
                        <Link
                          href={`/pets/${selectedNotif.petId}/updates`}
                          className="inline-flex items-center justify-center px-6 h-10 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg text-sm transition-colors cursor-pointer shadow-2xs active:scale-95"
                        >
                          <span>ส่งรูปอัปเดต</span>
                        </Link>
                        <Link
                          href={`/reviews?targetUserId=${selectedNotif.ownerId || ''}&targetUserName=${encodeURIComponent(
                            selectedNotif.ownerName || 'เจ้าของ'
                          )}&petName=${encodeURIComponent(selectedNotif.petName)}&role=owner`}
                          className="inline-flex items-center justify-center px-6 h-10 bg-orange-600 hover:bg-orange-700 text-white font-medium rounded-lg text-sm transition-colors cursor-pointer shadow-2xs active:scale-95"
                        >
                          <span>เขียนรีวิวเจ้าของ</span>
                        </Link>
                      </>
                    )}
                  </div>
                ) : (
                  /* ปุ่มสำหรับเจ้าของประกาศ (Owner Action Buttons) */
                  <>
                    {selectedNotif.status === 'cancelled' ? (
                      <div className="w-full p-4 rounded-xl bg-red-50 border border-red-200 flex items-center justify-between text-red-900 animate-in fade-in">
                        <div className="flex items-center gap-3">
                          <XCircle className="w-6 h-6 text-red-600 shrink-0" />
                          <div>
                            <div className="font-bold text-sm text-red-900">
                              สถานะ: ปฏิเสธคำขอรับเลี้ยงแล้ว (Cancelled)
                            </div>
                            <p className="text-xs text-red-700 mt-0.5">
                              คำขอรับเลี้ยงของ {selectedNotif.applicantName} สำหรับ {selectedNotif.petName} ถูกปฏิเสธแล้ว
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : selectedNotif.status === 'accepted' ? (
                      <div className="w-full p-4 rounded-xl bg-green-50 border border-green-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-green-900 animate-in fade-in">
                        <div className="flex items-center gap-3">
                          <CheckCircle2 className="w-6 h-6 text-green-600 shrink-0" />
                          <div>
                            <div className="font-bold text-sm text-green-900">
                              สถานะ: ตกลงให้รับเลี้ยงแล้ว ({selectedNotif.petStatus === 'adopted' ? 'Adopted' : 'Pending'})
                            </div>
                            <p className="text-xs text-green-700 mt-0.5">
                              {selectedNotif.petStatus === 'adopted'
                                ? `การรับเลี้ยงน้อง ${selectedNotif.petName} เสร็จสิ้นสมบูรณ์แล้ว`
                                : `เปลี่ยนสถานะของ ${selectedNotif.petName} เป็น pending เรียบร้อยแล้ว`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/chat?user=${selectedNotif.applicantId}&userName=${encodeURIComponent(
                              selectedNotif.applicantName
                            )}&petName=${encodeURIComponent(selectedNotif.petName)}&petId=${selectedNotif.petId || ''}`}
                            className="inline-flex items-center justify-center gap-1.5 px-4 h-9 bg-white border border-gray-300 rounded-lg text-xs font-medium text-gray-800 hover:bg-gray-50 shadow-2xs"
                          >
                            <MessageSquare className="w-3.5 h-3.5 text-gray-600" />
                            <span>แชท</span>
                          </Link>
                          {selectedNotif.petStatus !== 'adopted' && (
                            <button
                              type="button"
                              disabled={isUpdatingStatus}
                              onClick={handleConfirmAdoptedFromNotification}
                              className="inline-flex items-center justify-center px-4 h-9 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-medium shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
                            >
                              {isUpdatingStatus ? 'กำลังยืนยัน...' : 'ยืนยัน: Adopted'}
                            </button>
                          )}
                        </div>
                      </div>
                    ) : (
                      /* แถบปุ่มปกติ: แชท, ปฏิเสธ, ตกลงให้รับเลี้ยง */
                      <div className="flex flex-wrap items-center justify-between sm:justify-end gap-3">
                        <Link
                          href={`/chat?user=${selectedNotif.applicantId}&userName=${encodeURIComponent(
                            selectedNotif.applicantName
                          )}&petName=${encodeURIComponent(selectedNotif.petName)}&petId=${selectedNotif.petId || ''}&petStatus=${
                            selectedNotif.petStatus || ''
                          }`}
                          className="inline-flex items-center justify-center gap-1.5 px-6 h-10 border border-gray-400 rounded-lg text-sm font-medium text-gray-800 bg-white hover:bg-gray-50 transition-colors cursor-pointer shadow-2xs active:scale-95"
                        >
                          <MessageSquare className="w-4 h-4 text-gray-600" />
                          <span>แชท</span>
                        </Link>

                        <button
                          type="button"
                          onClick={handleReject}
                          className="inline-flex items-center justify-center px-6 h-10 border border-gray-400 rounded-lg text-sm font-medium text-gray-800 bg-white hover:bg-red-50 hover:text-red-700 hover:border-red-300 transition-colors cursor-pointer shadow-2xs active:scale-95"
                        >
                          <span>ปฏิเสธ</span>
                        </button>

                        <button
                          type="button"
                          disabled={isUpdatingStatus}
                          onClick={handleAcceptPending}
                          className="inline-flex items-center justify-center px-6 h-10 bg-[#dbeafe] hover:bg-[#bfdbfe] text-[#1e40af] border border-[#bfdbfe] font-medium rounded-lg text-sm transition-colors cursor-pointer shadow-2xs active:scale-95 disabled:opacity-50"
                        >
                          {isUpdatingStatus ? (
                            <span className="flex items-center gap-2">
                              <Loader2 className="w-4 h-4 animate-spin" />
                              <span>กำลังบันทึก...</span>
                            </span>
                          ) : (
                            <span>ตกลงให้รับเลี้ยง (→ pending)</span>
                          )}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </section>

          </div>
        ) : null}
      </main>
    </div>
  );
}

export default function NotificationsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-white flex flex-col font-sans">
          <Navbar activePage="notifications" />
          <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
            กำลังโหลดการแจ้งเตือน...
          </div>
        </div>
      }
    >
      <NotificationsContent />
    </Suspense>
  );
}
