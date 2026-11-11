// src/lib/api.ts
import { Pet, ApplicationInput, PetFilterParams } from '@/types/pet';

export const api = {
  // 1. จัดการข้อมูลสัตว์เลี้ยง
  pets: {
    getAll: async (params?: PetFilterParams & { myPosts?: boolean; adoptedByMe?: boolean }): Promise<{ success: boolean; data: Pet[]; total: number; totalPages: number; message?: string }> => {
      const query = new URLSearchParams();
      if (params) {
        if (params.type && params.type !== 'all') query.set('type', params.type);
        if (params.breed && params.breed !== 'all') query.set('breed', params.breed);
        if (params.location && params.location !== 'all') query.set('location', params.location);
        if (params.status && params.status !== 'all') query.set('status', params.status);
        if (params.page) query.set('page', params.page.toString());
        if (params.limit) query.set('limit', params.limit.toString());
        if ((params as any).myPosts) query.set('myPosts', 'true');
        if ((params as any).adoptedByMe) query.set('adoptedByMe', 'true');
      }
      const queryString = query.toString();
      const res = await fetch(`/api/pets${queryString ? `?${queryString}` : ''}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        return { success: false, data: [], total: 0, totalPages: 0, message: errData.message };
      }
      return res.json();
    },

    getById: async (id: string): Promise<{ success: boolean; data: any; message?: string }> => {
      const res = await fetch(`/api/pets/${id}`);
      if (!res.ok) throw new Error('Failed to fetch pet details');
      return res.json();
    },

    create: async (payload: Partial<Pet>): Promise<{ success: boolean; data?: Pet; message?: string }> => {
      const res = await fetch('/api/pets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return res.json();
    },

    update: async (id: string, payload: any): Promise<{ success: boolean; data?: any; message?: string }> => {
      const res = await fetch(`/api/pets/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return res.json();
    },

    delete: async (id: string): Promise<{ success: boolean; message?: string }> => {
      const res = await fetch(`/api/pets/${id}`, {
        method: 'DELETE',
      });
      return res.json();
    },
  },

  // 2. จัดการใบสมัครรับเลี้ยง
  applications: {
    getAll: async (params?: { petId?: string }) => {
      const query = new URLSearchParams();
      if (params?.petId) query.set('petId', params.petId);
      const res = await fetch(`/api/applications${query.toString() ? `?${query.toString()}` : ''}`);
      return res.json();
    },
    updateStatus: async (id: string, status: string) => {
      const res = await fetch('/api/applications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      return res.json();
    },
    submit: async (payload: ApplicationInput) => {
      const res = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { success: false, message: data.message || 'เกิดข้อผิดพลาดในการส่งใบสมัคร', ...data };
      }
      return data;
    },
  },

  // 3. จัดการระบบล็อกอิน / สมัครสมาชิก
  auth: {
    login: async (payload: { email: string; password: string }) => {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login', ...payload }),
      });
      return res.json();
    },
    register: async (payload: {
      email: string;
      password: string;
      fullName: string;
      phoneNumber?: string;
      profileImage?: string;
    }) => {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'register', ...payload }),
      });
      return res.json();
    },
    me: async () => {
      const res = await fetch('/api/auth/me');
      return res.json();
    },
    logout: async () => {
      const res = await fetch('/api/auth/logout', {
        method: 'POST',
      });
      return res.json();
    },
  },

  // 4. จัดการข้อความแชท (Real Database - Strict Owner Privacy)
  messages: {
    getThreads: async () => {
      const res = await fetch('/api/messages');
      return res.json();
    },
    getHistory: async (otherUserId: string, petId?: string) => {
      const query = new URLSearchParams({ otherUserId });
      if (petId) query.set('petId', petId);
      const res = await fetch(`/api/messages?${query.toString()}`);
      return res.json();
    },
    sendMessage: async (payload: { receiverId: string; petId?: string; message: string }) => {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return res.json();
    },
  },

  // 5. จัดการ Wishlist (Real Database)
  wishlist: {
    getAll: async () => {
      const res = await fetch('/api/wishlist');
      return res.json();
    },
    add: async (petId: string) => {
      const res = await fetch('/api/wishlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ petId }),
      });
      return res.json();
    },
    remove: async (petId: string) => {
      const res = await fetch(`/api/wishlist?petId=${petId}`, {
        method: 'DELETE',
      });
      return res.json();
    },
  },

  // 6. จัดการรีวิว (Real Database)
  reviews: {
    getAll: async (targetUserId?: string) => {
      const query = targetUserId ? `?targetUserId=${targetUserId}` : '';
      const res = await fetch(`/api/reviews${query}`);
      return res.json();
    },
    create: async (payload: { targetUserId: string; rating: number; comment: string }) => {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return res.json();
    },
  },

  // 7. จัดการอัปเดตความเป็นอยู่สัตว์เลี้ยง (Real Database)
  petUpdates: {
    getForPet: async (petId: string) => {
      const res = await fetch(`/api/pets/${petId}/updates`);
      return res.json();
    },
    create: async (petId: string, payload: { period: string; description?: string; images: string[] }) => {
      const res = await fetch(`/api/pets/${petId}/updates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return res.json();
    },
  },

  // 8. จัดการการแจ้งเตือน (Real Database)
  notifications: {
    getAll: async () => {
      const res = await fetch('/api/notifications');
      return res.json();
    },
  },
};
