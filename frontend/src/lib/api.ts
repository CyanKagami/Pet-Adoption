// src/lib/api.ts
import {
  Pet,
  ApplicationInput,
  PetCreateInput,
  PetCreateResponse,
  PetFilterParams,
  PetApplication,
  PetHealthHistory,
  PetImage,
  PetOwner,
  PetType,
  PetUpdateInput,
  WishlistPet,
} from '@/types/pet';

interface ApiError {
  code?: string;
  message?: string;
  [key: string]: unknown;
}

export function cleanImageUrl(url: unknown): string | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (trimmed.startsWith('http://localhost:5000data:') || trimmed.startsWith('https://localhost:5000data:')) {
    return trimmed.replace(/^https?:\/\/localhost:5000/, '');
  }
  return trimmed;
}

type ApiPet = Omit<Partial<Pet>, 'images' | 'owner' | 'applications' | 'type' | 'status'> & {
  id: string;
  name: string;
  location: string;
  type?: unknown;
  status?: unknown;
  image?: string | null;
  images?: Array<PetImage | string>;
  owner_id?: string;
  age_months?: number | null;
  health_history?: PetHealthHistory | null;
  conditions?: string | null;
  created_at?: string;
  updated_at?: string;
  owner?: Partial<PetOwner> & { name?: string };
  applications?: PetApplication[];
};

function normalizePetType(value: unknown): PetType {
  const aliases: Record<string, PetType> = {
    dog: 'Dog',
    'สุนัข': 'Dog',
    cat: 'Cat',
    'แมว': 'Cat',
    rabbit: 'Rabbit',
    'กระต่าย': 'Rabbit',
    bird: 'Bird',
    'นก': 'Bird',
    other: 'Other',
    'อื่นๆ': 'Other',
  };
  const type = typeof value === 'string'
    ? aliases[value.trim().toLowerCase()]
    : undefined;
  if (type) return type;
  throw new Error(`Unsupported pet type: ${String(value)}`);
}

function normalizePetStatus(value: unknown): Pet['status'] {
  if (value === 'PENDING' || value === 'pending') return 'pending';
  if (value === 'ADOPTED' || value === 'adopted') return 'adopted';
  return 'available';
}

function normalizePet(pet: ApiPet): Pet {
  const rawImages = pet.images || (pet.image ? [pet.image] : []);
  const images: PetImage[] = rawImages.map((image, index) => {
    const rawUrl = typeof image === 'string' ? image : image.imageUrl;
    return {
      id: typeof image === 'string' ? `img-${index}` : image.id || `img-${index}`,
      petId: pet.id,
      imageUrl: cleanImageUrl(rawUrl) || '',
      isPrimary: typeof image === 'string' ? index === 0 : image.isPrimary ?? index === 0,
    };
  });
  const rawPrimary = (typeof rawImages[0] === 'string' ? rawImages[0] : rawImages[0]?.imageUrl)
    || pet.image
    || null;
  const createdAt = pet.createdAt || pet.created_at;
  const updatedAt = pet.updatedAt || pet.updated_at;
  let owner: PetOwner | undefined;
  if (!createdAt || !updatedAt) {
    throw new Error(`Pet ${pet.id} is missing timestamps`);
  }
  if (pet.owner) {
    const id = pet.owner.id || pet.ownerId || pet.owner_id;
    const fullName = pet.owner.fullName || pet.owner.name;
    if (!id || !fullName) {
      throw new Error(`Pet ${pet.id} has incomplete owner data`);
    }
    owner = {
      ...pet.owner,
      id,
      fullName,
      isVerified: pet.owner.isVerified ?? false,
    };
  }

  return {
    ...pet,
    ownerId: pet.ownerId || pet.owner_id,
    type: normalizePetType(pet.type),
    ageMonths: pet.ageMonths ?? null,
    gender: pet.gender ?? null,
    description: pet.description ?? null,
    healthHistory: pet.healthHistory ?? pet.health_history ?? null,
    adoptionConditions: pet.adoptionConditions ?? pet.conditions ?? null,
    createdAt,
    updatedAt,
    image: cleanImageUrl(rawPrimary),
    images,
    status: normalizePetStatus(pet.status),
    owner,
  };
}

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
        if (params.myPosts) query.set('myPosts', 'true');
        if (params.adoptedByMe) query.set('adoptedByMe', 'true');
      }
      const queryString = query.toString();
      const res = await fetch(`/api/pets${queryString ? `?${queryString}` : ''}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        return { success: false, data: [], total: 0, totalPages: 0, message: errData.message };
      }
      const json = await res.json();
      if (json.success) {
        const rawPets = Array.isArray(json.data) ? json.data : (json.data?.pets || []);
        const total = json.total ?? json.data?.total ?? rawPets.length;
        const limit = json.limit ?? json.data?.limit ?? (params?.limit || 9);
        const totalPages = json.totalPages ?? (total > 0 ? Math.ceil(total / limit) : 1);

        const normalizedPets: Pet[] = rawPets.map(normalizePet);

        return {
          success: true,
          data: normalizedPets,
          total,
          totalPages,
        };
      }
      return json;
    },

    getById: async (id: string): Promise<{ success: boolean; data: Pet; message?: string }> => {
      const res = await fetch(`/api/pets/${id}`);
      if (!res.ok) throw new Error('Failed to fetch pet details');
      const json = await res.json();
      if (json.success && json.data) return { success: true, data: normalizePet(json.data) };
      return json;
    },

    create: async (payload: PetCreateInput): Promise<PetCreateResponse> => {
      const formData = new FormData();
      formData.set('name', payload.name);
      formData.set('type', payload.type);
      formData.set('location', payload.location);
      if (payload.breed !== undefined) formData.set('breed', payload.breed);
      if (payload.gender !== undefined) formData.set('gender', payload.gender);
      if (payload.ageMonths !== undefined) formData.set('ageMonths', String(payload.ageMonths));
      if (payload.description !== undefined) formData.set('description', payload.description);
      if (payload.adoptionConditions !== undefined) {
        formData.set('adoptionConditions', payload.adoptionConditions);
      }
      if (payload.healthHistory !== undefined) {
        formData.set('health_history', JSON.stringify(payload.healthHistory));
      }
      payload.images?.forEach((image) => formData.append('images', image, image.name));

      const res = await fetch('/api/pets', {
        method: 'POST',
        body: formData,
      });
      return res.json().catch(() => ({
        success: false,
        message:
          res.status === 413
            ? 'ขนาดข้อมูลหรือไฟล์รูปภาพใหญ่เกินขีดจำกัดที่เซิร์ฟเวอร์กำหนด (Request Entity Too Large)'
            : `เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์ (HTTP ${res.status})`,
      }));
    },

    update: async (id: string, payload: PetUpdateInput): Promise<{ success: boolean; data?: Pet; message?: string; error?: ApiError }> => {
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
    markRead: async (otherUserId: string, petId?: string) => {
      const res = await fetch('/api/messages/read', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otherUserId, petId }),
      });
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
    getAll: async (): Promise<{ success: boolean; data: WishlistPet[]; message?: string }> => {
      const res = await fetch('/api/wishlist');
      const json = await res.json().catch(() => ({}));
      if (json.success) {
        const rawList = Array.isArray(json.data) ? json.data : (json.data?.pets || []);
        const normalized: WishlistPet[] = rawList.map((pet: unknown) => {
          if (!pet || typeof pet !== 'object') {
            throw new Error('Invalid pet in wishlist response');
          }
          const item = pet as Record<string, unknown>;
          if (
            typeof item.id !== 'string'
            || typeof item.name !== 'string'
            || typeof item.location !== 'string'
          ) {
            throw new Error('Wishlist pet is missing required fields');
          }
          const rawImages = Array.isArray(item.images)
            ? item.images
            : (typeof item.image === 'string' ? [item.image] : []);
          const normalizedImages = rawImages.map((img: unknown, idx: number) => {
            const image = img && typeof img === 'object' ? img as Record<string, unknown> : undefined;
            const rawUrl = typeof img === 'string' ? img : image?.imageUrl;
            const cleaned = cleanImageUrl(rawUrl);
            return {
              id: typeof image?.id === 'string' ? image.id : `img-${idx}`,
              petId: item.id as string,
              imageUrl: cleaned || '',
              isPrimary: typeof image?.isPrimary === 'boolean' ? image.isPrimary : idx === 0,
            };
          });
          const firstImage = rawImages[0];
          const firstImageUrl = typeof firstImage === 'string'
            ? firstImage
            : firstImage && typeof firstImage === 'object'
              ? (firstImage as Record<string, unknown>).imageUrl
              : null;
          const rawPrimary = firstImageUrl || item.image || null;
          const primaryUrl = cleanImageUrl(rawPrimary);
          return {
            id: item.id as string,
            name: item.name as string,
            type: normalizePetType(item.type),
            ...(typeof item.breed === 'string' && { breed: item.breed }),
            location: item.location as string,
            status: normalizePetStatus(item.status),
            image: primaryUrl,
            images: normalizedImages,
          };
        });
        return { success: true, data: normalized };
      }
      return json;
    },
    add: async (petId: string) => {
      const res = await fetch('/api/wishlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ petId, pet_id: petId }),
      });
      return res.json();
    },
    remove: async (petId: string) => {
      const res = await fetch(`/api/wishlist/${petId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        return res.json();
      }
      const fallback = await fetch(`/api/wishlist?petId=${petId}`, {
        method: 'DELETE',
      });
      return fallback.json();
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
    create: async (petId: string, payload: { period: string; description?: string; images: File[] }) => {
      const formData = new FormData();
      formData.set('period', payload.period);
      if (payload.description) formData.set('description', payload.description);
      payload.images.forEach((image) => formData.append('images', image, image.name));

      const res = await fetch(`/api/pets/${petId}/updates`, {
        method: 'POST',
        body: formData,
      });
      return res.json();
    },
  },

  // 8. จัดการการแจ้งเตือน (Real Database)
  notifications: {
    getAll: async () => {
      const res = await fetch('/api/notifications');
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { success: false, message: json.message || 'ไม่สามารถดึงข้อมูลการแจ้งเตือนได้', data: [] };
      }
      return json;
    },
  },
};
