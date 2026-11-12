// src/app/reviews/page.tsx
'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, Loader2 } from 'lucide-react';
import Navbar from '@/components/Navbar';
import { api } from '@/lib/api';

interface DBReview {
  id: string;
  rating: number;
  comment: string;
  createdAt: string;
  reviewer?: {
    id: string;
    fullName: string;
  };
  targetUser?: {
    id: string;
    fullName: string;
  };
}

function ReviewContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const petName = searchParams.get('petName') || 'มะลิ';
  const targetUserName = searchParams.get('targetUserName') || searchParams.get('adopter') || 'คุณใจดี';
  const targetUserIdParam = searchParams.get('targetUserId') || searchParams.get('userId') || '';
  const role = searchParams.get('role');
  const roleText = role === 'owner' ? 'เจ้าของเดิม' : 'ผู้รับเลี้ยง';

  const [rating, setRating] = useState<number>(0);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [comment, setComment] = useState('');
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [reviewError, setReviewError] = useState('');

  // ดึงรายการรีวิวที่มีอยู่จริงจากฐานข้อมูล
  const [existingReviews, setExistingReviews] = useState<DBReview[]>([]);
  const [loadingReviews, setLoadingReviews] = useState(true);

  const fetchRealReviews = useCallback(async (): Promise<DBReview[]> => {
    try {
      const res = await api.reviews.getAll(targetUserIdParam || undefined);
      if (res.success && Array.isArray(res.data) && res.data.length > 0) {
        return res.data;
      }

      const allRes = await api.reviews.getAll();
      return allRes.success && Array.isArray(allRes.data) ? allRes.data : [];
    } catch (err) {
      console.error('Failed to load reviews:', err);
      return [];
    }
  }, [targetUserIdParam]);

  useEffect(() => {
    let isActive = true;
    void fetchRealReviews().then((reviews) => {
      if (isActive) {
        setExistingReviews(reviews);
        setLoadingReviews(false);
      }
    });

    return () => {
      isActive = false;
    };
  }, [fetchRealReviews]);

  const isValid = rating > 0 && comment.trim().length > 0;

  // ส่งรีวิวลงฐานข้อมูลจริงผ่าน API
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setHasAttemptedSubmit(true);
    setReviewError('');

    if (!isValid) return;

    setIsSubmitting(true);
    try {
      const res = await api.reviews.create({
        targetUserId: targetUserIdParam || targetUserName,
        rating,
        comment: comment.trim(),
      });

      if (res.success) {
        setSubmitSuccess(true);
        // รีเฟรชรายการรีวิวจริง
        setLoadingReviews(true);
        void fetchRealReviews().then((reviews) => {
          setExistingReviews(reviews);
          setLoadingReviews(false);
        });
        setTimeout(() => {
          router.push('/pets');
        }, 1800);
      } else {
        const response = res as { message?: unknown; error?: unknown };
        const error = response.error;
        const errorDetails = typeof error === 'object' && error !== null
          ? error as { code?: unknown; message?: unknown }
          : undefined;
        const errorCode = typeof errorDetails?.code === 'string' ? errorDetails.code : undefined;
        let msg =
          (typeof response.message === 'string' && response.message) ||
          (typeof errorDetails?.message === 'string' && errorDetails.message) ||
          'ไม่สามารถบันทึกรีวิวได้';
        if (errorCode === 'INVALID_TARGET_USER') {
          msg = 'ไม่สามารถเขียนรีวิวให้ตนเองได้';
        } else if (errorCode === 'UNAUTHORIZED') {
          msg = 'กรุณาเข้าสู่ระบบก่อนเขียนรีวิว';
        } else if (errorCode === 'USER_NOT_FOUND') {
          msg = 'ไม่พบข้อมูลผู้ใช้ที่ต้องการรีวิวในระบบ';
        }
        setReviewError(msg);
      }
    } catch {
      setReviewError('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col font-sans text-foreground">
      {/* 1. Header Navbar */}
      <Navbar activePage="my-pets" />

      {/* 2. Main Review Container (Wireframe 11-11-Review 1) */}
      <main className="max-w-2xl mx-auto px-6 py-10 w-full flex-1 space-y-6">
        
        {submitSuccess && (
          <div className="p-4 rounded-xl bg-green-50 border border-green-200 text-green-900 flex items-center gap-3 animate-in fade-in">
            <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
            <div>
              <p className="font-bold text-sm">ส่งรีวิวเรียบร้อยแล้ว!</p>
              <p className="text-xs text-green-700">รีวิวของคุณถูกบันทึกลงฐานข้อมูลและแสดงบนโปรไฟล์ของ {targetUserName} แล้ว</p>
            </div>
          </div>
        )}

        {/* กล่องบน: เขียนรีวิว */}
        <div className="border border-gray-400 bg-white rounded-lg p-6 sm:p-8 space-y-5 shadow-2xs">
          <div>
            <h1 className="text-xl font-bold text-gray-900 tracking-tight">
              เขียนรีวิว
            </h1>
            <p className="text-sm text-gray-700 mt-1">
              ผู้ถูกรีวิว: <strong>{targetUserName}</strong> ({roleText}) • สัตว์: <strong>{petName}</strong>
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* ให้คะแนน * */}
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-gray-800">
                ให้คะแนน *
              </label>
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4, 5].map((starValue) => {
                  const isFilled = (hoverRating || rating) >= starValue;
                  return (
                    <button
                      key={starValue}
                      type="button"
                      onMouseEnter={() => setHoverRating(starValue)}
                      onMouseLeave={() => setHoverRating(0)}
                      onClick={() => setRating(starValue)}
                      className="text-3xl text-gray-300 hover:text-amber-400 transition-colors cursor-pointer"
                    >
                      {isFilled ? '★' : '☆'}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ความคิดเห็น * */}
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-gray-800">
                ความคิดเห็น *
              </label>
              <textarea
                rows={5}
                placeholder="เล่าประสบการณ์..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className="w-full p-3 border border-gray-400 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-hidden focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* สาเหตุที่ส่งรีวิวไม่ได้ */}
            {hasAttemptedSubmit && !isValid && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs space-y-1">
                <p className="font-semibold">ไม่สามารถส่งรีวิวได้เนื่องจาก:</p>
                <ul className="list-disc pl-5 space-y-0.5">
                  {rating === 0 && <li>ยังไม่ได้เลือกคะแนนดาว (กรุณาให้คะแนน 1-5 ดาว)</li>}
                  {!comment.trim() && <li>ยังไม่ได้เขียนความคิดเห็นสำหรับการรีวิว</li>}
                </ul>
              </div>
            )}

            {reviewError && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-semibold">
                ไม่สามารถส่งรีวิวได้: {reviewError}
              </div>
            )}

            {/* Buttons: ยกเลิก / ส่งรีวิว */}
            <div className="pt-2 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => router.push('/pets')}
                className="px-6 h-10 border border-gray-400 bg-white hover:bg-gray-50 text-gray-700 font-medium rounded-lg text-sm transition-colors cursor-pointer shadow-2xs"
              >
                ยกเลิก
              </button>

              <button
                type="submit"
                disabled={isSubmitting}
                className="px-8 h-10 bg-[#dbeafe] hover:bg-[#bfdbfe] text-[#1e40af] border border-[#bfdbfe] font-medium rounded-lg text-sm transition-colors cursor-pointer shadow-2xs active:scale-95 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>กำลังส่ง...</span>
                  </span>
                ) : (
                  <span>ส่งรีวิว</span>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* กล่องล่าง: ตัวอย่างการแสดงผลบนโปรไฟล์ (ดึงข้อมูลรีวิวจริงจากฐานข้อมูล) */}
        <div className="border border-gray-400 bg-white rounded-lg p-6 space-y-3 shadow-2xs">
          <h2 className="text-sm font-bold text-gray-900">
            ตัวอย่างการแสดงผลบนโปรไฟล์
          </h2>

          {loadingReviews ? (
            <div className="py-4 flex items-center justify-center text-gray-400 text-xs gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
              <span>กำลังโหลดรีวิวจากฐานข้อมูล...</span>
            </div>
          ) : existingReviews.length === 0 ? (
            <div className="py-4 text-center text-gray-400 text-xs">
              ยังไม่มีรีวิวในระบบ (จะแสดงผลเมื่อมีรีวิวถูกบันทึก)
            </div>
          ) : (
            <div className="space-y-2.5">
              {existingReviews.slice(0, 3).map((rev) => (
                <div key={rev.id} className="text-xs sm:text-sm text-gray-800 flex items-center gap-2">
                  <span className="text-amber-500 font-bold tracking-wider">
                    {'★'.repeat(rev.rating)}{'☆'.repeat(5 - rev.rating)}
                  </span>
                  <span>
                    <strong>{rev.reviewer?.fullName || 'ผู้ใช้งาน'}</strong>
                    {rev.targetUser ? ` → ${rev.targetUser.fullName}` : ''} – &apos;{rev.comment}&apos;
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

      </main>
    </div>
  );
}

export default function ReviewPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-white flex flex-col font-sans">
          <Navbar activePage="my-pets" />
          <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
            กำลังโหลด...
          </div>
        </div>
      }
    >
      <ReviewContent />
    </Suspense>
  );
}