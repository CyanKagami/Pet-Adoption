# API Specification — Pet Adoption Platform

**Version:** 1.0.0  
**Base URL:** `/api/v1`  
**Content-Type:** `application/json` (except file uploads using `multipart/form-data`)

---

## Shared Data Models (TypeScript Interfaces)

```typescript
export type PetStatus = 'available' | 'adopted';
export type UpdatePeriod = '1m' | '3m' | '6m' | '1y';

export interface Pet {
  id: string; // UUID
  name: string;
  type: string; // e.g., "Dog", "Cat"
  breed?: string;
  health_history?: Record<string, any>;
  location: string;
  conditions?: string;
  images: string[];
  status: PetStatus;
  owner_id: string;
  created_at: string; // ISO 8601
  updated_at: string; // ISO 8601
}

export interface AdoptionApplication {
  id: string; // UUID
  pet_id: string; // UUID
  applicant_id: string; // UUID
  housing_type: string;
  income_range: string;
  experience: string;
  note?: string;
  submitted_at: string; // ISO 8601
}

export interface PetUpdate {
  id: string; // UUID
  pet_id: string; // UUID
  period: UpdatePeriod;
  description: string;
  images: string[];
  created_at: string; // ISO 8601
}

export interface Message {
  id: string; // UUID
  sender_id: string; // UUID
  receiver_id: string; // UUID
  message: string;
  sent_at: string; // ISO 8601
}

export interface Review {
  id: string; // UUID
  reviewer_id: string; // UUID
  target_user_id: string; // UUID
  rating: number; // 1 to 5
  comment?: string;
  created_at: string; // ISO 8601
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any;
  };
}
```

---

## 1. Pets & Listings Management (`/pets`)

### 1.1 List Pets
* **Endpoint:** `GET /pets`
* **FR Reference:** FR-04, FR-09
* **Auth Required:** No

#### Request Query Parameters
| Parameter | Type | Required | Description |
|---|---|---|---|
| `status` | `string` | No | Filter by status: `available` \| `adopted` |
| `type` | `string` | No | Filter by type (e.g. `Dog`, `Cat`) |
| `breed` | `string` | No | Filter by breed |
| `location`| `string` | No | Search by location |
| `page` | `integer`| No | Default `1` |
| `limit` | `integer`| No | Default `10`, Max `50` |

#### Responses
* **`200 OK`**
  ```json
  {
    "success": true,
    "data": {
      "pets": [
        {
          "id": "c62f275e-851f-4bb2-b5e8-5d27d7f7fa04",
          "name": "Milo",
          "type": "Dog",
          "breed": "Golden Retriever",
          "health_history": { "vaccinated": true, "neutered": true },
          "location": "Bangkok",
          "conditions": "Needs space to run",
          "images": ["https://storage.example.com/pets/milo-1.jpg"],
          "status": "available",
          "created_at": "2026-03-30T10:00:00Z"
        }
      ],
      "total": 1,
      "page": 1,
      "limit": 10
    }
  }
  ```

---

### 1.2 Create Pet Listing
* **Endpoint:** `POST /pets`
* **FR Reference:** FR-01
* **Auth Required:** Yes (`Bearer Token`)
* **Content-Type:** `multipart/form-data`

#### Request Body
| Field | Type | Required | Rules |
|---|---|---|---|
| `name` | `string` | **Yes** | Min 2 chars |
| `type` | `string` | **Yes** | Enum: `Dog`, `Cat`, `Other` |
| `location` | `string` | **Yes** | Non-empty |
| `breed` | `string` | No | Optional |
| `health_history`| `json / string`| No | JSON stringified object |
| `conditions` | `string` | No | Text description |
| `images` | `file[]` | No | Max 5 JPEG/PNG image files, up to 5 MB per file |

#### Responses
* **`201 Created`**
  ```json
  {
    "success": true,
    "data": {
      "pet_id": "c62f275e-851f-4bb2-b5e8-5d27d7f7fa04",
      "status": "available",
      "created_at": "2026-03-30T10:00:00Z"
    }
  }
  ```
* **`400 Bad Request`** — Invalid input or missing required fields. Unsupported image types and files over 5 MB are rejected.

---

### 1.3 Get Pet Detail
* **Endpoint:** `GET /pets/:pet_id`
* **FR Reference:** FR-01, FR-09
* **Auth Required:** No

#### Request Path Parameters
| Parameter | Type | Description |
|---|---|---|
| `pet_id` | `string (UUID)` | ID of the pet listing |

#### Responses
* **`200 OK`**
  ```json
  {
    "success": true,
    "data": {
      "id": "c62f275e-851f-4bb2-b5e8-5d27d7f7fa04",
      "name": "Milo",
      "type": "Dog",
      "breed": "Golden Retriever",
      "health_history": { "vaccinated": true, "neutered": true },
      "location": "Bangkok",
      "conditions": "Needs space to run",
      "images": ["https://storage.example.com/pets/milo-1.jpg"],
      "status": "available",
      "created_at": "2026-03-30T10:00:00Z",
      "owner": {
        "id": "f512a870-7b2e-4bb2-b5e8-5d27d7f7fa09",
        "name": "Jane Doe",
        "email": "jane@example.com"
      }
    }
  }
  ```
* **`404 Not Found`** — Pet with given ID does not exist.

---

### 1.4 Update Pet Status
* **Endpoint:** `PATCH /pets/:pet_id/status`
* **FR Reference:** FR-03
* **Auth Required:** Yes (Owner only)

#### Request Path Parameters
| Parameter | Type | Description |
|---|---|---|
| `pet_id` | `string (UUID)` | ID of the pet listing |

#### Request Body
```json
{
  "status": "adopted" // Allowed values: "available" | "adopted"
}
```

#### Responses
* **`200 OK`**
  ```json
  {
    "success": true,
    "data": {
      "pet_id": "c62f275e-851f-4bb2-b5e8-5d27d7f7fa04",
      "updated_status": "adopted"
    }
  }
  ```
* **`403 Forbidden`** — User is not the owner of this pet listing.
* **`404 Not Found`** — Pet ID not found.

---

## 2. Adoption Applications (`/pets/:pet_id/applications`)

### 2.1 Submit Adoption Application
* **Endpoint:** `POST /pets/:pet_id/applications`
* **FR Reference:** FR-08, FR-11
* **Auth Required:** Yes (`Bearer Token`)

#### Request Path Parameters
| Parameter | Type | Description |
|---|---|---|
| `pet_id` | `string (UUID)` | ID of the target pet |

#### Request Body
```json
{
  "housing_type": "House with yard",
  "income_range": "30,000 - 50,000 THB",
  "experience": "Have owned 2 dogs before",
  "note": "We are ready to adopt immediately."
}
```

#### Responses
* **`201 Created`**
  ```json
  {
    "success": true,
    "data": {
      "application_id": "a90b41c0-302a-4318-bc10-ee88273a5a7f",
      "submitted_at": "2026-03-30T10:15:00Z"
    }
  }
  ```
* **`400 Bad Request`** — Application missing required fields or already submitted by user.

---

### 2.2 List Pet Applications
* **Endpoint:** `GET /pets/:pet_id/applications`
* **FR Reference:** FR-02
* **Auth Required:** Yes (Pet Owner only)

#### Request Path Parameters
| Parameter | Type | Description |
|---|---|---|
| `pet_id` | `string (UUID)` | ID of the pet listing |

#### Responses
* **`200 OK`**
  ```json
  {
    "success": true,
    "data": [
      {
        "application_id": "a90b41c0-302a-4318-bc10-ee88273a5a7f",
        "pet_id": "c62f275e-851f-4bb2-b5e8-5d27d7f7fa04",
        "housing_type": "House with yard",
        "income_range": "30,000 - 50,000 THB",
        "experience": "Have owned 2 dogs before",
        "note": "We are ready to adopt immediately.",
        "submitted_at": "2026-03-30T10:15:00Z",
        "applicant": {
          "id": "e812a870-7b2e-4bb2-b5e8-5d27d7f7fa11",
          "name": "John Smith",
          "email": "john@example.com",
          "phone": "+66812345678"
        }
      }
    ]
  }
  ```

---

## 3. Wishlist Management (`/wishlists`)

### 3.1 Add Pet to Wishlist
* **Endpoint:** `POST /wishlists`
* **FR Reference:** FR-06
* **Auth Required:** Yes (`Bearer Token`)

#### Request Body
```json
{
  "pet_id": "c62f275e-851f-4bb2-b5e8-5d27d7f7fa04"
}
```

#### Responses
* **`201 Created`**
  ```json
  {
    "success": true,
    "message": "Pet added to wishlist"
  }
  ```
* **`409 Conflict`** — Pet already exists in user wishlist.

---

### 3.2 Get User Wishlist
* **Endpoint:** `GET /wishlists`
* **FR Reference:** FR-06
* **Auth Required:** Yes (`Bearer Token`)

#### Request Headers
| Header | Value | Required |
|---|---|---|
| `Authorization` | `Bearer <JWT_TOKEN>` | **Yes** |

#### Responses
* **`200 OK`**
  ```json
  {
    "success": true,
    "data": [
      {
        "id": "c62f275e-851f-4bb2-b5e8-5d27d7f7fa04",
        "name": "Milo",
        "type": "Dog",
        "breed": "Golden Retriever",
        "location": "Bangkok",
        "status": "available",
        "images": ["https://storage.example.com/pets/milo-1.jpg"]
      }
    ]
  }
  ```

---

### 3.3 Remove Pet from Wishlist
* **Endpoint:** `DELETE /wishlists/:pet_id`
* **FR Reference:** FR-06
* **Auth Required:** Yes (`Bearer Token`)

#### Request Path Parameters
| Parameter | Type | Description |
|---|---|---|
| `pet_id` | `string (UUID)` | ID of pet to remove |

#### Responses
* **`200 OK`**
  ```json
  {
    "success": true,
    "message": "Removed successfully"
  }
  ```
* **`404 Not Found`** — Item not in wishlist.

---

## 4. Pet Follow-up Updates (`/pets/:pet_id/updates`)

### 4.1 Post Pet Update
* **Endpoint:** `POST /pets/:pet_id/updates`
* **FR Reference:** FR-07
* **Auth Required:** Yes (Adopter only)
* **Content-Type:** `multipart/form-data`

#### Request Path Parameters
| Parameter | Type | Description |
|---|---|---|
| `pet_id` | `string (UUID)` | ID of adopted pet |

#### Request Body
| Field | Type | Required | Description |
|---|---|---|---|
| `period` | `string` | **Yes** | Enum: `1m`, `3m`, `6m`, `1y` |
| `description` | `string` | **Yes** | Details on pet's life/health |
| `images` | `file[]` | **Yes** | Requires 3 to 5 JPEG/PNG images, up to 5 MB per file |

#### Responses
* **`201 Created`**
  ```json
  {
    "success": true,
    "data": {
      "update_id": "b11d41c0-302a-4318-bc10-ee88273a5b01",
      "created_at": "2026-03-30T10:30:00Z"
    }
  }
  ```
* **`400 Bad Request`** — Image count outside 3-5 range, unsupported image type, file over 5 MB, missing description, or invalid period.

---

### 4.2 Get Pet Updates Timeline
* **Endpoint:** `GET /pets/:pet_id/updates`
* **FR Reference:** FR-07
* **Auth Required:** No

#### Request Path Parameters
| Parameter | Type | Description |
|---|---|---|
| `pet_id` | `string (UUID)` | ID of pet |

#### Responses
* **`200 OK`**
  ```json
  {
    "success": true,
    "data": [
      {
        "id": "b11d41c0-302a-4318-bc10-ee88273a5b01",
        "pet_id": "c62f275e-851f-4bb2-b5e8-5d27d7f7fa04",
        "period": "1m",
        "description": "Milo adjusted very well to the new home!",
        "images": [
          "https://storage.example.com/updates/up1.jpg",
          "https://storage.example.com/updates/up2.jpg",
          "https://storage.example.com/updates/up3.jpg"
        ],
        "created_at": "2026-03-30T10:30:00Z"
      }
    ]
  }
  ```

---

## 5. Messaging & Reviews

### 5.1 Send Chat Message
* **Endpoint:** `POST /chats/messages`
* **FR Reference:** FR-05
* **Auth Required:** Yes (`Bearer Token`)

#### Request Body
```json
{
  "receiver_id": "f512a870-7b2e-4bb2-b5e8-5d27d7f7fa09",
  "message": "Hello, is Milo still available?"
}
```

#### Responses
* **`201 Created`**
  ```json
  {
    "success": true,
    "data": {
      "message_id": "d99e41c0-302a-4318-bc10-ee88273a5c99",
      "sent_at": "2026-03-30T10:45:00Z"
    }
  }
  ```

---

### 5.2 Create User Review
* **Endpoint:** `POST /reviews`
* **FR Reference:** FR-10
* **Auth Required:** Yes (`Bearer Token`)

#### Request Body
```json
{
  "target_user_id": "f512a870-7b2e-4bb2-b5e8-5d27d7f7fa09",
  "rating": 5,
  "comment": "Very friendly owner and transparent health information!"
}
```

#### Responses
* **`201 Created`**
  ```json
  {
    "success": true,
    "data": {
      "review_id": "e77f41c0-302a-4318-bc10-ee88273a5e12",
      "created_at": "2026-03-30T11:00:00Z"
    }
  }
  ```
* **`400 Bad Request`** — Rating not between 1 and 5.