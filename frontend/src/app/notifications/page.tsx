// src/app/notifications/page.tsx
'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
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
  applicantId: string;
  applicantName: string;
  applicantProfileImage?: string | null;
  petName: string;
  petId?: string;
  petStatus: string;
  title: string;
  time: string;
  type: 'application' | 'update';
  status?: 'pending' | 'accepted' | 'cancelled';
  rating: number;
  reviewsCount: number;
  joinDate: string;
  isVerified: boolean;
  housing: string;
  experience: string;
  income: string;
  householdMembers: number;
  reviews: { stars: number; comment: string }[];
  updateDetails?: {
    description: string;
    images: string[];
    date: string;
  };
}

function NotificationsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const applicantParam = searchParams.get('applicant');

  const [currentUser, setCurrentUser] = useState<any>(null);
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
        const authRes = await api.auth.me().catch(() => null);
        if (authRes?.success && authRes.user) {
          setCurrentUser(authRes.user);
          const res = await api.notifications.getAll();
          if (res.success && Array.isArray(res.data)) {
            setNotifications(res.data);
            if (res.data.length > 0) {
              setSelectedId(res.data[0].id);
            }
          } else {
            setNotifications([]);
          }
        } else {
          setCurrentUser(null);
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

  useEffect(() => {
    if (applicantParam && notifications.length > 0) {
      const found = notifications.find((n) => n.applicantId === applicantParam);
      if (found) {
        setSelectedId(found.id);
      }
    }
  }, [applicantParam, notifications]);

  const selectedNotif = notifications.find((n) => n.id === selectedId) || notifications[0] || null;

  const showToast = (type: 'success' | 'error' | 'info', message: string) => {
    setActionNotice({ type, message });
    setTimeout(() => {
      setActionNotice(null);
    }, 4000);
  };

  // ตกลงให้รับเลี้ยง (-> pending)
  const handleAcceptPending = async () => {
    if (!selectedNotif) return;
    setIsUpdatingStatus(true);
    try {
      if (selectedNotif.petId) {
        await api.pets.update(selectedNotif.petId, { status: 'pending' });
      }
      if (selectedNotif.dbId && selectedNotif.type === 'application') {
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
        `ตกลงให้ '${selectedNotif.applicantName}' รับเลี้ยง '${selectedNotif.petName}' เรียบร้อยแล้ว (สถานะเปลี่ยนเป็น pending)`
      );
    } catch {
      showToast('error', 'เกิดข้อผิดพลาดในการอัปเดตสถานะ');
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

            {/* คอลัมน์ขวา: รายละเอียดโปรไฟล์ผู้สนใจรับเลี้ยง (Right Column) */}
            <section className="flex-1 flex flex-col bg-white p-6 sm:p-8 justify-between space-y-6">
              <div className="space-y-6">
                
                {/* หัวข้อ: โปรไฟล์ผู้สนใจรับเลี้ยง – คุณสมชาย */}
                <h1 className="text-lg font-bold text-gray-900 tracking-tight">
                  โปรไฟล์ผู้สนใจรับเลี้ยง – {selectedNotif.applicantName}
                </h1>

                {/* กล่องโปรไฟล์ผู้ใช้ */}
                <div className="flex items-start gap-4">
                  {/* กรอบรูปสี่เหลี่ยมตาม Wireframe */}
                  <div className="w-24 h-24 sm:w-28 sm:h-28 border border-gray-300 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400 text-sm font-medium shrink-0 overflow-hidden">
                    {selectedNotif.applicantProfileImage ? (
                      <img src={selectedNotif.applicantProfileImage} alt="" className="w-full h-full object-cover" />
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
                      <span className="flex items-center text-amber-500 font-semibold">
                        ★ {selectedNotif.rating}
                      </span>
                      <span>({selectedNotif.reviewsCount} รีวิว) • {selectedNotif.joinDate}</span>
                    </div>
                    <div className="flex items-center gap-1 text-xs sm:text-sm text-emerald-700 font-medium pt-0.5">
                      <span>ยืนยันตัวตน: ✓</span>
                    </div>
                    <div className="text-xs text-gray-500 pt-0.5">
                      สัตว์เลี้ยงที่สนใจ: <strong className="text-gray-800">{selectedNotif.petName}</strong> (สถานะ: {selectedNotif.petStatus})
                    </div>
                  </div>
                </div>

                {/* 2 กล่องซ้ายขวา: ข้อมูลจากฟอร์มประเมิน & รีวิวจากผู้หาบ้านคนอื่น */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  
                  {/* กล่อง 1: ข้อมูลจากฟอร์มประเมิน */}
                  <div className="border border-gray-400 rounded-lg p-5 bg-white space-y-2.5">
                    <h3 className="font-bold text-sm text-gray-900">
                      ข้อมูลจากฟอร์มประเมิน
                    </h3>
                    <ul className="text-xs sm:text-sm text-gray-800 space-y-2">
                      <li className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-500 shrink-0" />
                        <span>ที่อยู่อาศัย: {selectedNotif.housing}</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-500 shrink-0" />
                        <span>ประสบการณ์: {selectedNotif.experience}</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-500 shrink-0" />
                        <span>รายได้: {selectedNotif.income}</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-500 shrink-0" />
                        <span>สมาชิกในบ้าน: {selectedNotif.householdMembers}</span>
                      </li>
                    </ul>
                  </div>

                  {/* กล่อง 2: รีวิวจากผู้หาบ้านคนอื่น */}
                  <div className="border border-gray-400 rounded-lg p-5 bg-white space-y-2.5">
                    <h3 className="font-bold text-sm text-gray-900">
                      รีวิวจากผู้หาบ้านคนอื่น
                    </h3>
                    <div className="text-xs sm:text-sm text-gray-800 space-y-2.5">
                      {selectedNotif.reviews.map((rev, idx) => (
                        <div key={idx} className="flex items-baseline gap-2">
                          <span className="text-amber-500 font-bold shrink-0 text-xs">
                            {'★'.repeat(rev.stars)}{'☆'.repeat(5 - rev.stars)}
                          </span>
                          <span className="italic text-gray-800">&apos;{rev.comment}&apos;</span>
                        </div>
                      ))}
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

              {/* แถบปุ่มด้านล่าง (Bottom Action Buttons / Status Area) */}
              <div className="pt-6 border-t border-gray-200">
                {/* Requirement 1: เมื่อคลิกยกเลิก/ปฏิเสธ ให้เปลี่ยนไปแสดงเฉพาะสถานะยกเลิก (Show ONLY cancel status) */}
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
                  <div className="w-full p-4 rounded-xl bg-green-50 border border-green-200 flex items-center justify-between text-green-900 animate-in fade-in">
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="w-6 h-6 text-green-600 shrink-0" />
                      <div>
                        <div className="font-bold text-sm text-green-900">
                          สถานะ: ตกลงให้รับเลี้ยงแล้ว (Pending)
                        </div>
                        <p className="text-xs text-green-700 mt-0.5">
                          เปลี่ยนสถานะของ {selectedNotif.petName} เป็น pending เรียบร้อยแล้ว
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Link
                        href={`/chat?user=${selectedNotif.applicantId}&userName=${encodeURIComponent(selectedNotif.applicantName)}&petName=${encodeURIComponent(selectedNotif.petName)}&petId=${selectedNotif.petId || ''}`}
                        className="inline-flex items-center justify-center gap-1.5 px-4 h-9 bg-white border border-gray-300 rounded-lg text-xs font-medium text-gray-800 hover:bg-gray-50"
                      >
                        <MessageSquare className="w-3.5 h-3.5 text-gray-600" />
                        <span>แชท</span>
                      </Link>
                    </div>
                  </div>
                ) : (
                  /* แถบปุ่มปกติ: แชท, ปฏิเสธ, ตกลงให้รับเลี้ยง */
                  <div className="flex flex-wrap items-center justify-between sm:justify-end gap-3">
                    {/* ปุ่ม แชท: เชื่อมต่อไปยัง /chat พร้อมระบุข้อมูลผู้ใช้และสัตว์เลี้ยง */}
                    <Link
                      href={`/chat?user=${selectedNotif.applicantId}&userName=${encodeURIComponent(selectedNotif.applicantName)}&petName=${encodeURIComponent(selectedNotif.petName)}&petId=${selectedNotif.petId || ''}&petStatus=${selectedNotif.petStatus || ''}`}
                      className="inline-flex items-center justify-center gap-1.5 px-6 h-10 border border-gray-400 rounded-lg text-sm font-medium text-gray-800 bg-white hover:bg-gray-50 transition-colors cursor-pointer shadow-2xs active:scale-95"
                    >
                      <MessageSquare className="w-4 h-4 text-gray-600" />
                      <span>แชท</span>
                    </Link>

                    {/* ปุ่ม ปฏิเสธ: เมื่อคลิกจะเปลี่ยนสถานะเป็น cancelled และแสดงเฉพาะสถานะ cancelled */}
                    <button
                      type="button"
                      onClick={handleReject}
                      className="inline-flex items-center justify-center px-6 h-10 border border-gray-400 rounded-lg text-sm font-medium text-gray-800 bg-white hover:bg-red-50 hover:text-red-700 hover:border-red-300 transition-colors cursor-pointer shadow-2xs active:scale-95"
                    >
                      <span>ปฏิเสธ</span>
                    </button>

                    {/* ปุ่ม ตกลงให้รับเลี้ยง (-> pending) */}
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
