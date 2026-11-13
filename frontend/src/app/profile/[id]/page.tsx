'use client';

import { Suspense, use, useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { BadgeCheck, CalendarDays, Loader2, MapPin, PawPrint, Star } from 'lucide-react';
import Navbar from '@/components/Navbar';
import { api, type PublicUserProfile } from '@/lib/api';

interface ProfilePageProps {
  params: Promise<{ id: string }>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('th-TH', {
    year: 'numeric',
    month: 'long',
  }).format(new Date(value));
}

function PublicProfileContent({ params }: ProfilePageProps) {
  const { id } = use(params);
  const [result, setResult] = useState<{
    id: string;
    profile?: PublicUserProfile;
    error?: string;
  } | null>(null);

  useEffect(() => {
    let active = true;

    api.users.getPublicProfile(id)
      .then((response) => {
        if (!active) return;
        if (response.success && response.data) {
          setResult({ id, profile: response.data });
        } else {
          setResult({ id, error: response.message || 'ไม่พบโปรไฟล์ผู้ใช้นี้' });
        }
      })
      .catch(() => {
        if (active) setResult({ id, error: 'ไม่สามารถโหลดโปรไฟล์ได้ กรุณาลองใหม่อีกครั้ง' });
      });

    return () => {
      active = false;
    };
  }, [id]);

  const loading = !result || result.id !== id;
  const profile = result?.id === id ? result.profile : undefined;
  const error = result?.id === id ? result.error : undefined;

  return (
    <div className="min-h-screen bg-slate-50 text-foreground">
      <Navbar />
      <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        {loading ? (
          <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            กำลังโหลดโปรไฟล์...
          </div>
        ) : error || !profile ? (
          <div className="rounded-2xl border border-red-200 bg-white p-8 text-center text-sm text-red-700">
            {error || 'ไม่พบโปรไฟล์ผู้ใช้นี้'}
          </div>
        ) : (
          <div className="space-y-8">
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
              <div className="flex flex-col items-center gap-5 text-center sm:flex-row sm:text-left">
                <div className="relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full bg-blue-50 text-3xl font-bold text-blue-700">
                  {profile.profileImage ? (
                    <Image
                      src={profile.profileImage}
                      alt={`รูปโปรไฟล์ของ ${profile.fullName}`}
                      fill
                      sizes="96px"
                      unoptimized
                      className="object-cover"
                    />
                  ) : (
                    profile.fullName.charAt(0).toUpperCase()
                  )}
                </div>
                <div className="min-w-0">
                  <h1 className="flex flex-wrap items-center justify-center gap-2 text-2xl font-bold text-slate-900 sm:justify-start">
                    {profile.fullName}
                    {profile.isVerified && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700">
                        <BadgeCheck className="h-4 w-4" />
                        ยืนยันตัวตนแล้ว
                      </span>
                    )}
                  </h1>
                  <p className="mt-2 flex items-center justify-center gap-1.5 text-sm text-muted-foreground sm:justify-start">
                    <CalendarDays className="h-4 w-4" />
                    สมาชิกตั้งแต่ {formatDate(profile.createdAt)}
                  </p>
                  <div className="mt-4 flex flex-wrap justify-center gap-3 text-sm sm:justify-start">
                    <span className="rounded-full bg-blue-50 px-3 py-1.5 font-medium text-blue-800">
                      <PawPrint className="mr-1.5 inline h-4 w-4" />
                      รับเลี้ยงแล้ว {profile.adoptedPets.length} ตัว
                    </span>
                    <span className="rounded-full bg-amber-50 px-3 py-1.5 font-medium text-amber-800">
                      <Star className="mr-1 inline h-4 w-4 fill-current" />
                      {profile.averageRating === null ? 'ยังไม่มีคะแนน' : `${profile.averageRating} / 5`}
                      <span className="ml-1">({profile.totalReviews} รีวิว)</span>
                    </span>
                  </div>
                </div>
              </div>
            </section>

            <section>
              <div className="mb-4 flex items-end justify-between">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">สัตว์เลี้ยงที่รับเลี้ยง</h2>
                  <p className="mt-1 text-sm text-muted-foreground">รายการสัตว์เลี้ยงที่รับเลี้ยงสำเร็จแล้ว</p>
                </div>
                <span className="text-sm text-muted-foreground">{profile.adoptedPets.length} รายการ</span>
              </div>
              {profile.adoptedPets.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-sm text-muted-foreground">
                  ยังไม่มีข้อมูลสัตว์เลี้ยงที่รับเลี้ยง
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {profile.adoptedPets.map((pet) => (
                    <Link
                      key={pet.id}
                      href={`/pets/${pet.id}`}
                      className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                    >
                      <div className="relative aspect-[4/3] bg-slate-100">
                        {pet.image ? (
                          <Image
                            src={pet.image}
                            alt={pet.name}
                            fill
                            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                            unoptimized
                            className="object-cover"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-slate-400">
                            <PawPrint className="h-10 w-10" />
                          </div>
                        )}
                        <span className="absolute left-3 top-3 rounded-full bg-green-600 px-2.5 py-1 text-xs font-semibold text-white">
                          ได้บ้านแล้ว
                        </span>
                      </div>
                      <div className="space-y-2 p-4">
                        <h3 className="text-lg font-semibold text-slate-900">{pet.name}</h3>
                        <p className="text-sm text-muted-foreground">
                          {pet.type}{pet.breed ? ` · ${pet.breed}` : ''}
                        </p>
                        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                          <MapPin className="h-4 w-4 shrink-0" />
                          {pet.location}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </section>

            <section>
              <div className="mb-4 flex items-end justify-between">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">รีวิว</h2>
                  <p className="mt-1 text-sm text-muted-foreground">ความคิดเห็นจากผู้ใช้งานคนอื่น</p>
                </div>
                <span className="text-sm text-muted-foreground">{profile.totalReviews} รีวิว</span>
              </div>
              {profile.reviews.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-sm text-muted-foreground">
                  ยังไม่มีรีวิวสำหรับผู้ใช้นี้
                </div>
              ) : (
                <div className="space-y-3">
                  {profile.reviews.map((review) => (
                    <article key={review.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-sm font-semibold text-slate-600">
                            {review.reviewer.profileImage ? (
                              <Image
                                src={review.reviewer.profileImage}
                                alt=""
                                fill
                                sizes="40px"
                                unoptimized
                                className="object-cover"
                              />
                            ) : (
                              review.reviewer.fullName.charAt(0).toUpperCase()
                            )}
                          </div>
                          <div>
                            <p className="font-semibold text-slate-900">{review.reviewer.fullName}</p>
                            <p className="text-xs text-muted-foreground">{formatDate(review.createdAt)}</p>
                          </div>
                        </div>
                        <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-amber-600">
                          <Star className="h-4 w-4 fill-current" />
                          {review.rating} / 5
                        </span>
                      </div>
                      {review.comment && (
                        <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-700">{review.comment}</p>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

export default function PublicProfilePage(props: ProfilePageProps) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50">
          <Navbar />
          <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            กำลังโหลดโปรไฟล์...
          </div>
        </div>
      }
    >
      <PublicProfileContent {...props} />
    </Suspense>
  );
}
