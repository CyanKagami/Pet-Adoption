export const PET_TYPES = [
  { value: 'Dog', label: 'สุนัข' },
  { value: 'Cat', label: 'แมว' },
  { value: 'Rabbit', label: 'กระต่าย' },
  { value: 'Bird', label: 'นก' },
  { value: 'Other', label: 'อื่นๆ' },
] as const;

export type PetType = (typeof PET_TYPES)[number]['value'];

export const PET_UPDATE_PERIODS = [
  { value: '1m', label: '1 เดือน' },
  { value: '3m', label: '3 เดือน' },
  { value: '5m', label: '5 เดือน' },
  { value: '1y', label: '1 ปี' },
] as const;

export type PetUpdatePeriod = (typeof PET_UPDATE_PERIODS)[number]['value'];

export interface PetImage {
  id: string;
  petId: string;
  imageUrl: string;
  isPrimary: boolean;
}

export interface WishlistPet {
  id: string;
  name: string;
  type: PetType;
  breed?: string;
  location: string;
  status: Pet['status'];
  image: string | null;
  images: PetImage[];
}

export interface PetOwner {
  id: string;
  fullName: string;
  name?: string;
  email?: string;
  profileImage?: string | null;
  isVerified: boolean;
  createdAt?: string;
}

export interface PetHealthHistory {
  disease?: string;
  vaccinated?: string | boolean;
  neutered?: boolean;
  [key: string]: unknown;
}

export interface PetApplication {
  id: string;
  petId: string;
  applicantId: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  createdAt: string;
  housingType: string;
  incomeRange: string;
  petExperience: string;
  additionalNote?: string;
  householdMembers?: string | number;
  adoptionReason?: string;
  readinessForm: {
    housingType: string;
    incomeRange: string;
    petExperience: string;
    additionalNote?: string;
    householdMembers?: string | number;
    adoptionReason?: string;
  };
  applicant?: {
    id: string;
    fullName: string;
    email?: string;
    phoneNumber?: string | null;
  };
}

export interface Pet {
  id: string;
  ownerId?: string;
  name: string;
  type: PetType;
  breed?: string | null;
  gender?: string | null;
  ageMonths?: number | null;
  location: string;
  status: 'available' | 'pending' | 'adopted';
  description?: string | null;
  healthHistory?: PetHealthHistory | null;
  adoptionConditions?: string | null;
  image?: string | null;
  images?: PetImage[];
  owner?: PetOwner;
  applications?: PetApplication[];
  createdAt: string;
  updatedAt: string;
  ownerStats?: {
    totalPets: number;
    totalReviews: number;
    averageRating: number;
    reviews: Array<{
      id: string;
      rating: number;
      comment?: string | null;
      createdAt: string;
      reviewerName: string;
    }>;
  };
}

export interface PetCreateInput {
  name: string;
  type: PetType;
  breed?: string;
  gender?: string;
  ageMonths?: number;
  description?: string;
  location: string;
  healthHistory?: PetHealthHistory;
  adoptionConditions?: string;
  images?: File[];
}

export interface PetCreateResponse {
  success: boolean;
  data?: {
    id: string;
    pet_id: string;
    status: 'available';
    createdAt: string;
    created_at: string;
  };
  message?: string;
  error?: { code?: string; message?: string };
}

export interface ApplicationInput {
  petId: string;
  applicantName?: string;
  housingType: string;
  incomeRange?: string;
  petExperience?: string;
  householdMembers?: string;
  adoptionReason?: string;
  additionalNote?: string;
  agreeTerms?: boolean;
}

export interface PetUpdateInput {
  name?: string;
  type?: PetType;
  breed?: string | null;
  ageMonths?: number | null;
  location?: string;
  status?: 'available' | 'pending' | 'adopted';
  adoptionConditions?: string | null;
}

export interface PetFilterParams {
  type?: string;
  breed?: string;
  location?: string;
  status?: string;
  page?: number;
  limit?: number;
}
