export interface PetImage {
  id: string;
  petId: string;
  imageUrl: string;
  isPrimary: boolean;
}

export interface PetOwner {
  id: string;
  fullName: string;
  profileImage?: string | null;
  isVerified: boolean;
}

export interface Pet {
  id: string;
  ownerId?: string;
  name: string;
  type: string;
  breed?: string | null;
  gender: string;
  ageMonths?: number | null;
  location: string;
  status: string;
  healthHistory?: any;
  adoptionConditions?: string | null;
  images?: PetImage[];
  owner?: PetOwner;
  createdAt: string;
  updatedAt?: string;
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

export interface PetFilterParams {
  type?: string;
  breed?: string;
  location?: string;
  status?: string;
  page?: number;
  limit?: number;
}
