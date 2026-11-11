const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { createRequireAuth } = require('../middlewares/auth');
const { apiError, asyncHandler } = require('../utils/http');

function createPetsRouter(prisma) {
  const router = express.Router();
  const requireAuth = createRequireAuth(prisma);
  const uploadDirectory = path.join(__dirname, '..', '..', 'uploads', 'pets');
  fs.mkdirSync(uploadDirectory, { recursive: true });

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

  function normalizeStatus(status) {
    return status === 'ADOPTED' ? 'adopted' : 'available';
  }

  function imageUrl(request, image) {
    return image.imageUrl.startsWith('http')
      ? image.imageUrl
      : `${request.protocol}://${request.get('host')}${image.imageUrl}`;
  }

  function serializePet(request, pet, includeOwner = false) {
    const result = {
      id: pet.id,
      name: pet.name,
      type: pet.type,
      breed: pet.breed || undefined,
      health_history: pet.healthInfo || undefined,
      location: pet.location,
      conditions: pet.adoptionConditions || undefined,
      images: (pet.images || []).map((image) => imageUrl(request, image)),
      status: normalizeStatus(pet.status),
      owner_id: pet.ownerId,
      created_at: pet.createdAt.toISOString(),
      updated_at: pet.updatedAt.toISOString(),
    };

    if (includeOwner && pet.owner) {
      result.owner = {
        id: pet.owner.id,
        name: pet.owner.fullName,
        email: pet.owner.email,
      };
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
    const { status, type, breed, location } = request.query;
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
      ...(type && { type: String(type) }),
      ...(breed && { breed: String(breed) }),
      ...(location && { location: { contains: String(location), mode: 'insensitive' } }),
    };

    const [pets, total] = await Promise.all([
      prisma.pet.findMany({
        where,
        include: { images: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.pet.count({ where }),
    ]);

    response.json({
      success: true,
      data: { pets: pets.map((pet) => serializePet(request, pet)), total, page, limit },
    });
  }));

  router.post('/', requireAuth, upload.array('images', 5), asyncHandler(async (request, response) => {
    const { name, type, location, breed, conditions } = request.body;
    if (typeof name !== 'string' || name.trim().length < 2) {
      throw apiError('INVALID_NAME', 'name must contain at least 2 characters');
    }
    if (!['Dog', 'Cat', 'Other'].includes(type)) {
      throw apiError('INVALID_TYPE', 'type must be Dog, Cat, or Other');
    }
    if (typeof location !== 'string' || !location.trim()) {
      throw apiError('INVALID_LOCATION', 'location is required');
    }

    const healthHistory = parseHealthHistory(request.body.health_history);
    if (healthHistory !== undefined && (healthHistory === null || typeof healthHistory !== 'object' || Array.isArray(healthHistory))) {
      throw apiError('INVALID_HEALTH_HISTORY', 'health_history must be a valid JSON object');
    }

    const pet = await prisma.pet.create({
      data: {
        ownerId: request.user.id,
        name: name.trim(),
        type,
        location: location.trim(),
        breed: typeof breed === 'string' && breed.trim() ? breed.trim() : null,
        healthInfo: healthHistory,
        adoptionConditions: typeof conditions === 'string' && conditions.trim() ? conditions.trim() : null,
        images: {
          create: (request.files || []).map((file, index) => ({
            imageUrl: `/uploads/pets/${file.filename}`,
            isPrimary: index === 0,
          })),
        },
      },
    });

    response.status(201).json({
      success: true,
      data: { pet_id: pet.id, status: 'available', created_at: pet.createdAt.toISOString() },
    });
  }));

  router.get('/:pet_id', asyncHandler(async (request, response) => {
    const pet = await prisma.pet.findUnique({
      where: { id: request.params.pet_id },
      include: {
        owner: { select: { id: true, fullName: true, email: true } },
        images: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] },
      },
    });
    if (!pet) throw apiError('PET_NOT_FOUND', 'Pet not found', undefined, 404);

    response.json({ success: true, data: serializePet(request, pet, true) });
  }));

  router.patch('/:pet_id/status', requireAuth, asyncHandler(async (request, response) => {
    if (!['available', 'adopted'].includes(request.body.status)) {
      throw apiError('INVALID_STATUS', 'status must be available or adopted');
    }

    const pet = await prisma.pet.findUnique({
      where: { id: request.params.pet_id },
      select: { id: true, ownerId: true },
    });
    if (!pet) throw apiError('PET_NOT_FOUND', 'Pet not found', undefined, 404);
    if (pet.ownerId !== request.user.id) throw apiError('FORBIDDEN', 'Only the pet owner can update this status', undefined, 403);

    const updatedPet = await prisma.pet.update({
      where: { id: pet.id },
      data: { status: request.body.status === 'adopted' ? 'ADOPTED' : 'AVAILABLE' },
    });

    response.json({
      success: true,
      data: { pet_id: updatedPet.id, updated_status: normalizeStatus(updatedPet.status) },
    });
  }));

  return router;
}

module.exports = { createPetsRouter };