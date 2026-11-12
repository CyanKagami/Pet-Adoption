const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { createRequireAuth } = require('../middlewares/auth');
const { apiError, asyncHandler } = require('../utils/http');
const { serializeApplication } = require('../utils/serializers');

function createPetsRouter(prisma) {
  const router = express.Router();
  const requireAuth = createRequireAuth(prisma);
  const uploadDirectory = path.join(__dirname, '..', '..', 'uploads', 'pets');
  fs.mkdirSync(uploadDirectory, { recursive: true });
  const petTypeAliases = new Map([
    ['dog', 'Dog'],
    ['สุนัข', 'Dog'],
    ['cat', 'Cat'],
    ['แมว', 'Cat'],
    ['rabbit', 'Rabbit'],
    ['กระต่าย', 'Rabbit'],
    ['bird', 'Bird'],
    ['นก', 'Bird'],
    ['other', 'Other'],
    ['อื่นๆ', 'Other'],
  ]);

  const upload = multer({
    storage: multer.diskStorage({
      destination: uploadDirectory,
      filename: (_request, file, callback) => {
        const extension = path.extname(file.originalname).toLowerCase();
        callback(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${extension}`);
      },
    }),
    limits: { fileSize: 5 * 1024 * 1024, files: 5 },
    fileFilter: (_request, file, callback) => {
      if (!['image/jpeg', 'image/png'].includes(file.mimetype)) {
        callback(apiError('INVALID_IMAGES', 'Only JPEG and PNG images are allowed'));
        return;
      }
      callback(null, true);
    },
  });

  function normalizePetType(type) {
    if (typeof type !== 'string') return null;
    return petTypeAliases.get(type.trim().toLowerCase()) || null;
  }

  function normalizeStatus(status) {
    if (status === 'ADOPTED') return 'adopted';
    if (status === 'PENDING') return 'pending';
    return 'available';
  }

  function imageUrl(request, image) {
    if (!image || !image.imageUrl) return null;
    const url = image.imageUrl;
    if (url.startsWith('data:') || url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    return `${request.protocol}://${request.get('host')}${url.startsWith('/') ? '' : '/'}${url}`;
  }

  function serializePet(request, pet, includeOwner = false) {
    const imageUrls = (pet.images || []).map((image) => imageUrl(request, image));
    const result = {
      id: pet.id,
      name: pet.name,
      type: normalizePetType(pet.type) || pet.type,
      ageMonths: pet.ageMonths,
      gender: pet.gender,
      description: pet.description,
      healthHistory: pet.healthInfo || undefined,
      adoptionConditions: pet.adoptionConditions || undefined,
      breed: pet.breed || undefined,
      health_history: pet.healthInfo || undefined,
      location: pet.location,
      conditions: pet.adoptionConditions || undefined,
      image: imageUrls[0] || null,
      images: imageUrls,
      status: normalizeStatus(pet.status),
      owner_id: pet.ownerId,
      ownerId: pet.ownerId,
      created_at: pet.createdAt.toISOString(),
      updated_at: pet.updatedAt.toISOString(),
      createdAt: pet.createdAt.toISOString(),
      updatedAt: pet.updatedAt.toISOString(),
    };

    if (pet.owner || includeOwner) {
      result.owner = {
        id: pet.owner?.id || pet.ownerId,
        name: pet.owner?.fullName,
        fullName: pet.owner?.fullName,
        email: pet.owner?.email,
        profileImage: pet.owner?.profileImage,
        isVerified: pet.owner?.isVerified,
        createdAt: pet.owner?.createdAt ? pet.owner.createdAt.toISOString() : undefined,
      };
    }

    if (pet.applications) {
      result.applications = pet.applications.map(serializeApplication);
    }

    return result;
  }

  function parseHealthHistory(value) {
    if (!value) return undefined;
    if (typeof value !== 'string') return value;

    try {
      return JSON.parse(value);
    } catch {
      throw apiError('INVALID_HEALTH_HISTORY', 'health_history must be a valid JSON object');
    }
  }

  router.get('/', asyncHandler(async (request, response) => {
    const { status, type, breed, location, myPosts, adoptedByMe } = request.query;
    const page = Math.max(1, Number.parseInt(request.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, Number.parseInt(request.query.limit, 10) || 10));

    let statusFilter;
    if (status !== undefined) {
      if (!['available', 'adopted'].includes(status)) {
        throw apiError('INVALID_STATUS', 'status must be available or adopted');
      }
      statusFilter = status === 'adopted' ? 'ADOPTED' : 'AVAILABLE';
    }

    const where = {
      ...(statusFilter && { status: statusFilter }),
      ...(type && { type: normalizePetType(type) || String(type) }),
      ...(breed && { breed: String(breed) }),
      ...(location && { location: { contains: String(location), mode: 'insensitive' } }),
    };

    let currentUserId = null;
    const authHeader = request.headers.authorization;
    let token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token && request.headers.cookie) {
      const cookies = Object.fromEntries(
        request.headers.cookie.split(';').map((c) => {
          const [k, ...v] = c.trim().split('=');
          return [k, v.join('=')];
        })
      );
      token = cookies.auth_token || null;
    }
    if (token) {
      try {
        const jwt = require('jsonwebtoken');
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        currentUserId = payload.id || payload.userId || payload.sub;
      } catch {}
    }

    if (myPosts === 'true') {
      if (!currentUserId) throw apiError('UNAUTHORIZED', 'Authentication required', undefined, 401);
      where.ownerId = currentUserId;
    }

    if (adoptedByMe === 'true') {
      if (!currentUserId) throw apiError('UNAUTHORIZED', 'Authentication required', undefined, 401);
      where.status = 'ADOPTED';
      where.applications = {
        some: {
          applicantId: currentUserId,
          status: 'APPROVED',
        },
      };
    }

    const [pets, total] = await Promise.all([
      prisma.pet.findMany({
        where,
        include: {
          images: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] },
          owner: { select: { id: true, fullName: true, email: true, profileImage: true, isVerified: true, createdAt: true } },
          applications: {
            include: {
              applicant: { select: { id: true, fullName: true, email: true, phoneNumber: true } },
            },
            orderBy: { createdAt: 'desc' },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.pet.count({ where }),
    ]);

    response.json({
      success: true,
      data: { pets: pets.map((pet) => serializePet(request, pet, true)), total, page, limit },
    });
  }));

  router.post('/', requireAuth, upload.array('images', 5), asyncHandler(async (request, response) => {
    let { name, type, location, breed, conditions, gender, ageMonths, description } = request.body || {};
    if (typeof name !== 'string' || name.trim().length < 2) {
      throw apiError('INVALID_NAME', 'name must contain at least 2 characters');
    }

    type = normalizePetType(type);
    if (!type) throw apiError('INVALID_TYPE', 'type must be Dog, Cat, Rabbit, Bird, or Other');
    if (typeof location !== 'string' || !location.trim()) {
      throw apiError('INVALID_LOCATION', 'location is required');
    }

    const healthHistory = parseHealthHistory(request.body.health_history || request.body.healthHistory);
    if (healthHistory !== undefined && (healthHistory === null || typeof healthHistory !== 'object' || Array.isArray(healthHistory))) {
      throw apiError('INVALID_HEALTH_HISTORY', 'health_history must be a valid JSON object');
    }

    let imageCreates = [];
    if (request.files && request.files.length > 0) {
      imageCreates = request.files.map((file, index) => ({
        imageUrl: `/uploads/pets/${file.filename}`,
        isPrimary: index === 0,
      }));
    } else if (Array.isArray(request.body.images) && request.body.images.length > 0) {
      imageCreates = request.body.images.map((img, index) => ({
        imageUrl: typeof img === 'string' ? img : (img.imageUrl || ''),
        isPrimary: index === 0,
      }));
    }

    const adoptionConditions = typeof conditions === 'string' && conditions.trim()
      ? conditions.trim()
      : (typeof request.body.adoptionConditions === 'string' && request.body.adoptionConditions.trim() ? request.body.adoptionConditions.trim() : null);

    const pet = await prisma.pet.create({
      data: {
        ownerId: request.user.id,
        name: name.trim(),
        type,
        location: location.trim(),
        breed: typeof breed === 'string' && breed.trim() ? breed.trim() : null,
        gender: typeof gender === 'string' && gender.trim() ? gender.trim() : null,
        ageMonths: ageMonths !== undefined && ageMonths !== null && !isNaN(Number(ageMonths)) ? Number(ageMonths) : null,
        description: typeof description === 'string' && description.trim() ? description.trim() : null,
        healthInfo: healthHistory,
        adoptionConditions,
        images: imageCreates.length > 0 ? { create: imageCreates } : undefined,
      },
    });

    response.status(201).json({
      success: true,
      data: {
        pet_id: pet.id,
        id: pet.id,
        status: 'available',
        created_at: pet.createdAt.toISOString(),
        createdAt: pet.createdAt.toISOString(),
      },
    });
  }));

  router.get('/:pet_id', asyncHandler(async (request, response) => {
    const pet = await prisma.pet.findUnique({
      where: { id: request.params.pet_id },
      include: {
        owner: { select: { id: true, fullName: true, email: true, profileImage: true, isVerified: true, createdAt: true } },
        images: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] },
        applications: {
          include: {
            applicant: { select: { id: true, fullName: true, email: true, phoneNumber: true, profileImage: true, isVerified: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        updates: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!pet) throw apiError('PET_NOT_FOUND', 'Pet not found', undefined, 404);

    const [totalPets, ownerReviews] = await Promise.all([
      prisma.pet.count({ where: { ownerId: pet.ownerId } }),
      prisma.review.findMany({
        where: { targetId: pet.ownerId },
        include: {
          reviewer: { select: { id: true, fullName: true, profileImage: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const avgRating =
      ownerReviews.length > 0
        ? Number((ownerReviews.reduce((sum, r) => sum + r.rating, 0) / ownerReviews.length).toFixed(1))
        : 5.0;

    const serialized = serializePet(request, pet, true);
    serialized.ownerStats = {
      totalPets,
      totalReviews: ownerReviews.length,
      averageRating: avgRating,
      reviews: ownerReviews.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt.toISOString(),
        reviewerName: r.reviewer?.fullName || 'ผู้ใช้งาน',
      })),
    };

    response.json({ success: true, data: serialized });
  }));

  router.patch('/:pet_id/status', requireAuth, asyncHandler(async (request, response) => {
    if (!['available', 'adopted'].includes(request.body.status)) {
      throw apiError('INVALID_STATUS', 'status must be available or adopted');
    }

    const pet = await prisma.pet.findUnique({
      where: { id: request.params.pet_id },
      select: { id: true, name: true, ownerId: true },
    });
    if (!pet) throw apiError('PET_NOT_FOUND', 'Pet not found', undefined, 404);
    if (pet.ownerId !== request.user.id) throw apiError('FORBIDDEN', 'Only the pet owner can update this status', undefined, 403);

    const targetStatus = request.body.status === 'adopted' ? 'ADOPTED' : 'AVAILABLE';
    const updatedPet = await prisma.pet.update({
      where: { id: pet.id },
      data: { status: targetStatus },
    });

    if (targetStatus === 'ADOPTED') {
      const approvedApp = await prisma.application.findFirst({
        where: { petId: pet.id, status: 'APPROVED' },
        include: { applicant: true },
      });
      if (approvedApp) {
        await prisma.message.create({
          data: {
            senderId: request.user.id,
            receiverId: approvedApp.applicantId,
            petId: pet.id,
            content: `🎉 ยืนยันการรับเลี้ยงน้อง "${pet.name}" เสร็จสมบูรณ์แล้ว! ขอบคุณที่มอบบ้านใหม่ที่อบอุ่นและดูแลน้องเป็นอย่างดีครับ/ค่ะ คุณสามารถเริ่มส่งรูปอัปเดตความเป็นอยู่และเขียนรีวิวผู้ลงประกาศได้ที่หน้า 'สัตว์ที่รับเลี้ยง' ได้เลยครับ`,
          },
        }).catch(() => null);
      }
    }

    response.json({
      success: true,
      data: { pet_id: updatedPet.id, updated_status: normalizeStatus(updatedPet.status) },
    });
  }));

  router.patch('/:pet_id', requireAuth, asyncHandler(async (request, response) => {
    const pet = await prisma.pet.findUnique({
      where: { id: request.params.pet_id },
      include: {
        images: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] },
        owner: { select: { id: true, fullName: true, email: true, profileImage: true, isVerified: true } },
      },
    });
    if (!pet) throw apiError('PET_NOT_FOUND', 'Pet not found', undefined, 404);
    if (pet.ownerId !== request.user.id) throw apiError('FORBIDDEN', 'Only the pet owner can update this pet', undefined, 403);

    const updateData = {};
    if (request.body.name) updateData.name = String(request.body.name).trim();
    if (request.body.type !== undefined) {
      const type = normalizePetType(request.body.type);
      if (!type) throw apiError('INVALID_TYPE', 'type must be Dog, Cat, Rabbit, Bird, or Other');
      updateData.type = type;
    }
    if (request.body.breed !== undefined) updateData.breed = request.body.breed ? String(request.body.breed).trim() : null;
    if (request.body.location) updateData.location = String(request.body.location).trim();
    if (request.body.conditions !== undefined) updateData.adoptionConditions = request.body.conditions;
    if (request.body.adoptionConditions !== undefined) updateData.adoptionConditions = request.body.adoptionConditions;
    if (request.body.ageMonths !== undefined) updateData.ageMonths = Number(request.body.ageMonths) || null;
    if (request.body.status) {
      const s = String(request.body.status).toUpperCase();
      if (['AVAILABLE', 'PENDING', 'ADOPTED'].includes(s)) {
        updateData.status = s;
      }
    }

    const updatedPet = await prisma.pet.update({
      where: { id: pet.id },
      data: updateData,
      include: {
        images: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] },
        owner: { select: { id: true, fullName: true, email: true, profileImage: true, isVerified: true } },
      },
    });

    if (updateData.status === 'ADOPTED') {
      const approvedApp = await prisma.application.findFirst({
        where: { petId: pet.id, status: 'APPROVED' },
        include: { applicant: true },
      });
      if (approvedApp) {
        await prisma.message.create({
          data: {
            senderId: request.user.id,
            receiverId: approvedApp.applicantId,
            petId: pet.id,
            content: `🎉 ยืนยันการรับเลี้ยงน้อง "${pet.name}" เสร็จสมบูรณ์แล้ว! ขอบคุณที่มอบบ้านใหม่ที่อบอุ่นและดูแลน้องเป็นอย่างดีครับ/ค่ะ คุณสามารถเริ่มส่งรูปอัปเดตความเป็นอยู่และเขียนรีวิวผู้ลงประกาศได้ที่หน้า 'สัตว์ที่รับเลี้ยง' ได้เลยครับ`,
          },
        }).catch(() => null);
      }
    }

    response.json({
      success: true,
      data: serializePet(request, updatedPet, true),
    });
  }));

  return router;
}

module.exports = { createPetsRouter };