// src/app/chat/page.tsx
'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { Send, MessageSquare, Loader2, Lock } from 'lucide-react';
import Navbar from '@/components/Navbar';
import { api } from '@/lib/api';
import type { PetOwner } from '@/types/pet';

type AuthenticatedUser = Pick<PetOwner, 'id' | 'fullName'>;

interface Message {
  id: string;
  senderId: string;
  receiverId: string;
  petId?: string | null;
  message?: string;
  content?: string;
  isRead?: boolean;
  createdAt: string;
  sender?: { id: string; fullName: string };
}

interface ChatThread {
  id: string;
  userId: string;
  userName: string;
  userEmail?: string;
  userAvatar?: string | null;
  petId?: string;
  petName: string;
  petStatus: string;
  petImage?: string | null;
  lastMessage: string;
  time: string;
  isNew?: boolean;
  unread?: boolean;
}

function ChatContent() {
  const searchParams = useSearchParams();
  const userParam = searchParams.get('user') || searchParams.get('thread');
  const userNameParam = searchParams.get('userName');
  const petNameParam = searchParams.get('petName');
  const petIdParam = searchParams.get('petId');
  const petStatusParam = searchParams.get('petStatus');

  const [currentUser, setCurrentUser] = useState<AuthenticatedUser | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesThreadId, setMessagesThreadId] = useState<string | null>(null);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 1. Requirement 1: Only the owner of the chat can read it (ตรวจสอบสิทธิ์การล็อกอิน)
  useEffect(() => {
    const checkAuthAndLoad = async () => {
      try {
        setIsAuthLoading(true);
        const authRes = await api.auth.me();
        if (authRes.success && authRes.user) {
          setCurrentUser(authRes.user);
        } else {
          setCurrentUser(null);
        }
      } catch {
        setCurrentUser(null);
      } finally {
        setIsAuthLoading(false);
      }
    };
    checkAuthAndLoad();
  }, []);

  // 2. Requirement 2: โหลดข้อมูลห้องแชทจริงจาก Database (ไม่มี Mock Data)
  useEffect(() => {
    if (!currentUser) return;

    let cancelled = false;
    let requestInFlight = false;
    let hasLoadedThreads = false;

    const loadRealThreads = async () => {
      if (cancelled || requestInFlight || document.visibilityState === 'hidden') return;
      requestInFlight = true;
      try {
        const res = await api.messages.getThreads();
        if (!res.success || !Array.isArray(res.data)) {
          throw new Error(res.message || 'Failed to load chat threads');
        }
        let loadedThreads: ChatThread[] = res.data;
        let routeThreadId: string | null = null;

        // Requirement 4: เมื่อกดแชทจากหน้าอื่น หากไม่เคยคุยกัน ประวัติจะว่างเปล่าและสร้างห้องใหม่
        if (userParam) {
          const targetPetId = petIdParam || undefined;
          const found = loadedThreads.find(
            (thread) =>
              (thread.userId === userParam
                || (userNameParam && thread.userName.toLowerCase() === userNameParam.toLowerCase()))
              && thread.petId === targetPetId
          );

          if (found) {
            routeThreadId = found.id;
            loadedThreads = loadedThreads.map((thread) => (
              thread.id === found.id
                ? {
                    ...thread,
                    ...(petNameParam ? { petName: petNameParam } : {}),
                    ...(petIdParam ? { petId: petIdParam } : {}),
                    ...(petStatusParam ? { petStatus: petStatusParam } : {}),
                  }
                : thread
            ));
          } else {
            // ไม่เคยคุยกันมาก่อน (Never talked with him before) -> สร้างห้องสนทนาใหม่ที่มีประวัติว่าง (empty)
            const threadId = `${userParam}:${targetPetId || 'general'}`;
            const newThread: ChatThread = {
              id: threadId,
              userId: userParam,
              userName: userNameParam || 'ผู้ติดต่อ',
              petName: petNameParam || 'สัตว์เลี้ยง',
              petId: targetPetId,
              petStatus: petStatusParam || 'available',
              lastMessage: 'เริ่มการสนทนาใหม่',
              time: 'เมื่อสักครู่',
              isNew: true,
            };
            loadedThreads = [newThread, ...loadedThreads];
            routeThreadId = threadId;
          }
        } else if (loadedThreads.length > 0) {
          routeThreadId = loadedThreads[0].id;
        }

        if (!cancelled) {
          setThreads(loadedThreads);
          if (!hasLoadedThreads && routeThreadId) {
            setActiveThreadId(routeThreadId);
          } else if (!userParam && loadedThreads.length > 0) {
            setActiveThreadId((current) => current || loadedThreads[0].id);
          }
          hasLoadedThreads = true;
        }
      } catch (err) {
        if (!cancelled) console.error('Failed to load chat threads:', err);
      } finally {
        requestInFlight = false;
      }
    };

    loadRealThreads();
    const pollInterval = window.setInterval(loadRealThreads, 5000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') loadRealThreads();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(pollInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [currentUser, userParam, userNameParam, petNameParam, petIdParam, petStatusParam]);

  const activeThread = threads.find((t) => t.id === activeThreadId) || threads[0] || null;
  const activeThreadUserId = activeThread?.userId;
  const activeThreadPetId = activeThread?.petId;
  const activeThreadKey = activeThread?.id;
  const displayedMessages = messagesThreadId !== activeThreadKey ? [] : messages;
  const showingMessagesLoading = isLoadingMessages && messagesThreadId !== activeThreadKey;

  // 3. โหลดข้อความแชทจริงของห้องที่เลือก (Strict Privacy: เฉพาะคู่สนทนาเท่านั้น)
  useEffect(() => {
    let cancelled = false;

    if (!currentUser || !activeThreadUserId || !activeThreadKey) {
      return () => {
        cancelled = true;
      };
    }

    let requestInFlight = false;
    let initialLoad = true;

    const fetchMessages = async () => {
      if (cancelled || requestInFlight || document.visibilityState === 'hidden') return;
      requestInFlight = true;
      if (initialLoad) setIsLoadingMessages(true);

      try {
        const res = await api.messages.getHistory(activeThreadUserId, activeThreadPetId);
        if (!res.success || !Array.isArray(res.data)) {
          throw new Error(res.message || 'Failed to load chat history');
        }
        if (!cancelled) {
          setMessages((currentMessages) => (
            currentMessages.length === res.data.length
              && currentMessages.every((message, index) => message.id === res.data[index].id)
              ? currentMessages
              : res.data
          ));
          setMessagesThreadId(activeThreadKey);
        }

        if (res.data.some(
          (message: Message) => message.receiverId === currentUser.id && !message.isRead
        )) {
          const readRes = await api.messages.markRead(activeThreadUserId, activeThreadPetId);
          if (!readRes.success) {
            throw new Error(readRes.message || 'Failed to mark chat messages as read');
          }
          if (!cancelled) {
            setMessages((currentMessages) => currentMessages.map((message) => (
              message.receiverId === currentUser.id ? { ...message, isRead: true } : message
            )));
            setThreads((currentThreads) => currentThreads.map((thread) => (
              thread.id === activeThreadKey ? { ...thread, unread: false } : thread
            )));
          }
        }
      } catch (error) {
        if (!cancelled) console.error('Failed to load chat messages:', error);
      } finally {
        requestInFlight = false;
        if (!cancelled && initialLoad) {
          initialLoad = false;
          setIsLoadingMessages(false);
        }
      }
    };

    fetchMessages();
    const pollInterval = window.setInterval(fetchMessages, 5000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') fetchMessages();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(pollInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [currentUser, activeThreadKey, activeThreadUserId, activeThreadPetId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 4. ส่งข้อความใหม่ลงฐานข้อมูลจริง
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputText.trim();
    if (!trimmed || !activeThread || isSending) return;

    setIsSending(true);
    try {
      const res = await api.messages.sendMessage({
        receiverId: activeThread.userId,
        petId: activeThread.petId,
        message: trimmed,
      });

      if (res.success && res.data) {
        setMessages((prev) => (
          prev.some((message) => message.id === res.data.id)
            ? prev
            : [...prev, res.data]
        ));
        setMessagesThreadId(activeThread.id);

        // อัปเดตรายการห้องแชท
        setThreads((prev) =>
          prev.map((t) => {
            if (t.id === activeThread.id) {
              return {
                ...t,
                lastMessage: trimmed,
                time: 'เมื่อสักครู่',
                isNew: false,
                unread: false,
              };
            }
            return t;
          })
        );

        setInputText('');
      } else {
        alert(res.message || 'ไม่สามารถส่งข้อความได้');
      }
    } catch {
      alert('เกิดข้อผิดพลาดในการส่งข้อความ');
    } finally {
      setIsSending(false);
    }
  };

  // หากยังตรวจสอบสิทธิ์อยู่
  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-white flex flex-col font-sans">
        <Navbar activePage="chat" />
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm">กำลังตรวจสอบสิทธิ์การเข้าถึงแชท...</p>
        </div>
      </div>
    );
  }

  // Requirement 1: เฉพาะเจ้าของแชทเท่านั้นที่สามารถอ่านได้ หากยังไม่ล็อกอิน ให้แสดงข้อความแจ้งเตือนและปุ่มล็อกอิน
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-white flex flex-col font-sans">
        <Navbar activePage="chat" />
        <div className="flex-1 max-w-md mx-auto px-4 py-24 text-center space-y-4">
          <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto border border-blue-200">
            <Lock className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">เข้าสู่ระบบเพื่อดูแชท</h1>
          <p className="text-sm text-gray-600">
            เฉพาะเจ้าของแชทและคู่สนทนาเท่านั้นที่สามารถอ่านและส่งข้อความได้ กรุณาเข้าสู่ระบบก่อนเข้าถึงข้อมูล
          </p>
          <div className="pt-2">
            <Link
              href="/login?redirect=/chat"
              className="inline-flex items-center justify-center px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors shadow-xs"
            >
              เข้าสู่ระบบ (Login)
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-dvh overflow-hidden bg-white flex flex-col font-sans text-foreground">
      {/* 1. Header Navbar */}
      <Navbar activePage="chat" />

      {/* 2. Main Chat Container (Wireframe 06-6-Chat 1 - Real DB Data) */}
      <main className="max-w-6xl mx-auto px-4 sm:px-8 py-4 sm:py-6 w-full flex-1 min-h-0 flex flex-col">
        <div className="border border-gray-400 bg-white rounded-lg flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden shadow-2xs">
          
          {/* คอลัมน์ซ้าย: การสนทนา (Conversations List) */}
          <section className="w-full h-[35%] min-h-0 shrink-0 md:h-auto md:w-80 border-b md:border-b-0 md:border-r border-gray-400 flex flex-col bg-white">
            <div className="p-4 border-b border-gray-300 flex items-center justify-between">
              <h2 className="text-base font-bold text-gray-900 tracking-tight">
                การสนทนา ({threads.length})
              </h2>
            </div>

            <div className="p-3 space-y-2.5 flex-1 min-h-0 overflow-y-auto">
              {threads.length === 0 ? (
                <div className="p-6 text-center text-gray-400 text-xs">
                  ยังไม่มีประวัติการสนทนาในระบบ
                </div>
              ) : (
                threads.map((thread) => {
                  const isActive = thread.id === activeThread?.id;
                  return (
                    <button
                      key={thread.id}
                      type="button"
                      onClick={() => setActiveThreadId(thread.id)}
                      className={`w-full text-left p-3.5 rounded-lg border transition-all cursor-pointer ${
                        isActive
                          ? 'border-gray-900 bg-gray-50 shadow-2xs'
                          : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50/50'
                      }`}
                    >
                      <div className="font-bold text-sm text-gray-900 truncate">
                        {thread.userName} • {thread.petName}
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-1">
                        <div className="text-xs text-gray-600 truncate">
                          {thread.isNew ? (
                            <span className="text-blue-600 italic">เริ่มการสนทนาใหม่</span>
                          ) : (
                            <span>&apos;{thread.lastMessage}&apos; • {thread.time}</span>
                          )}
                        </div>
                        {thread.unread && (
                          <span className="shrink-0 rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                            ใหม่
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </section>

          {/* คอลัมน์ขวา: หน้าต่างแชท (Chat View) */}
          <section className="flex-1 min-h-0 flex flex-col bg-white">
            {activeThread ? (
              <>
                {/* Top Bar: เกี่ยวกับสัตว์เลี้ยง */}
                <header className="p-4 border-b border-gray-300 flex items-center justify-between gap-4 bg-white shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="relative w-9 h-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm overflow-hidden border border-blue-200 shrink-0">
                      {activeThread.petImage ? (
                        <Image
                          src={activeThread.petImage}
                          alt={activeThread.petName}
                          fill
                          sizes="36px"
                          unoptimized
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span>{activeThread.petName ? activeThread.petName.charAt(0) : 'P'}</span>
                      )}
                    </div>

                    <div className="text-sm">
                      <span className="text-gray-800">
                        เกี่ยวกับ: <strong>{activeThread.petName}</strong> ({activeThread.petStatus || 'available'})
                      </span>
                    </div>
                  </div>

                  {/* Action Buttons: [ดูประกาศ] [ดูโปรไฟล์] [ดูอัปเดต] [รีวิว] */}
                  <div className="flex items-center gap-2">
                    {activeThread.petId ? (
                      <Link
                        href={`/pets/${activeThread.petId}`}
                        className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-800 border border-gray-300 transition-colors cursor-pointer"
                      >
                        ดูประกาศ
                      </Link>
                    ) : (
                      <Link
                        href="/pets"
                        className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-800 border border-gray-300 transition-colors cursor-pointer"
                      >
                        ดูประกาศ
                      </Link>
                    )}

                    {activeThread.petId && activeThread.petStatus === 'adopted' && (
                      <Link
                        href={`/pets/${activeThread.petId}/updates`}
                        className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition-colors cursor-pointer"
                      >
                        ดูอัปเดต
                      </Link>
                    )}

                    <Link
                      href={`/reviews?targetUserId=${activeThread.userId}&targetUserName=${encodeURIComponent(
                        activeThread.userName
                      )}&petName=${encodeURIComponent(activeThread.petName)}`}
                      className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 transition-colors cursor-pointer"
                    >
                      รีวิว
                    </Link>

                    <Link
                      href={`/profile/${activeThread.userId}`}
                      className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors cursor-pointer shadow-xs"
                    >
                      ดูโปรไฟล์
                    </Link>
                  </div>
                </header>

                {/* กล่องข้อความแชท (Message History) */}
                <div className="flex-1 min-h-0 p-4 sm:p-6 overflow-y-auto space-y-4 bg-white flex flex-col justify-start">
                  {showingMessagesLoading ? (
                    <div className="flex-1 flex items-center justify-center text-gray-400 text-xs gap-2 my-auto">
                      <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                      <span>กำลังโหลดข้อความ...</span>
                    </div>
                  ) : displayedMessages.length === 0 ? (
                    /* Requirement 4: หากไม่เคยคุยกัน ประวัติจะว่าง (empty) และสามารถพิมพ์ข้อความหาเขาได้ */
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-8 space-y-3 my-auto animate-in fade-in">
                      <div className="w-14 h-14 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-200">
                        <MessageSquare className="w-7 h-7" />
                      </div>
                      <div className="space-y-1">
                        <p className="font-bold text-base text-gray-900">
                          ยังไม่มีประวัติการสนทนากับ {activeThread.userName}
                        </p>
                        <p className="text-xs sm:text-sm text-gray-500 max-w-sm">
                          นี่เป็นการเริ่มต้นสนทนาครั้งแรก คุณสามารถพิมพ์ข้อความในช่องด้านล่างเพื่อส่งหา {activeThread.userName} เกี่ยวกับน้อง {activeThread.petName} ได้ทันที
                        </p>
                      </div>
                    </div>
                  ) : (
                    displayedMessages.map((msg) => {
                      const isMe = msg.senderId === currentUser.id;
                      const text = msg.message || msg.content || '';
                      const timeStr = new Date(msg.createdAt).toLocaleTimeString('th-TH', {
                        hour: '2-digit',
                        minute: '2-digit',
                      });

                      return (
                        <div
                          key={msg.id}
                          className={`w-full flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                        >
                          <div
                            className={`max-w-[75%] sm:max-w-[65%] border rounded-lg p-3.5 text-sm shadow-2xs ${
                              isMe
                                ? 'bg-blue-50 border-blue-200 text-gray-900 ml-auto'
                                : 'bg-white border-gray-400 text-gray-900 mr-auto'
                            }`}
                          >
                            <p className="leading-relaxed whitespace-pre-wrap">{text}</p>
                          </div>
                          <span className={`text-[11px] text-gray-400 mt-1 px-1 ${isMe ? 'text-right' : 'text-left'}`}>
                            {timeStr}
                          </span>
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* แถบพิมพ์ข้อความด้านล่าง (Input Bar) */}
                <footer className="p-4 border-t border-gray-300 bg-white shrink-0">
                  <form onSubmit={handleSendMessage} className="flex items-center gap-3">
                    <input
                      type="text"
                      placeholder="พิมพ์ข้อความ..."
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      disabled={isSending}
                      className="flex-1 h-11 px-4 bg-white rounded-lg border border-gray-400 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-hidden focus:ring-1 focus:ring-primary disabled:opacity-50"
                    />
                    <button
                      type="submit"
                      disabled={isSending || !inputText.trim()}
                      className="h-11 px-6 bg-[#dbeafe] hover:bg-[#bfdbfe] text-[#1e40af] border border-[#bfdbfe] font-medium rounded-lg text-sm transition-colors cursor-pointer shadow-2xs shrink-0 flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
                    >
                      {isSending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <span>ส่ง</span>
                          <Send className="w-3.5 h-3.5" />
                        </>
                      )}
                    </button>
                  </form>
                </footer>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
                เลือกห้องสนทนาจากรายการทางซ้ายมือ
              </div>
            )}
          </section>

        </div>
      </main>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-white flex flex-col font-sans">
          <Navbar activePage="chat" />
          <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
            กำลังโหลดแชท...
          </div>
        </div>
      }
    >
      <ChatContent />
    </Suspense>
  );
}
