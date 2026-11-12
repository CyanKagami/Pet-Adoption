const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { createRequireAuth } = require('../middlewares/auth');
const { apiError, asyncHandler } = require('../utils/http');

function createUpdatesRouter(prisma) {
  const router = express.Router();
  const requireAuth = createRequireAuth(prisma);
  const uploadDirectory = path.join(__dirname, '..', '..', 'uploads', 'updates');
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

  router.get('/:pet_id/updates', asyncHandler(async (request, response) => {
    const pet = await prisma.pet.findUnique({
      where: { id: request.params.pet_id },
      select: { id: true },
    });
    if (!pet) throw apiError('PET_NOT_FOUND', 'Pet not found', undefined, 404);

    const updates = await prisma.petUpdate.findMany({
      where: { petId: pet.id },
      orderBy: { createdAt: 'desc' },
    });

    response.json({
      success: true,
      data: updates.map((update) => ({
        id: update.id,
        pet_id: update.petId,
        period: update.updatePeriod,
        description: update.description,
        images: (update.images || []).map((image) => (
          typeof image === 'string' && (image.startsWith('http') || image.startsWith('data:'))
            ? image
            : `${request.protocol}://${request.get('host')}${image}`
        )),
        created_at: update.createdAt.toISOString(),
      })),
    });
  }));

  router.post(
    '/:pet_id/updates',
    requireAuth,
    upload.array('images', 5),
    asyncHandler(async (request, response) => {
      let { period, description } = request.body || {};
      if (period === '1 เดือน' || period === '1_month') period = '1m';
      else if (period === '3 เดือน' || period === '3_months') period = '3m';
      else if (period === '5 เดือน' || period === '6 เดือน' || period === '6_months') period = '6m';
      else if (period === '1 ปี' || period === '1_year') period = '1y';

      if (!['1m', '3m', '6m', '1y'].includes(period)) {
        throw apiError('INVALID_PERIOD', 'period must be 1m, 3m, 6m, or 1y');
      }
      if (typeof description !== 'string' || !description.trim()) {
        throw apiError('INVALID_DESCRIPTION', 'description is required');
      }

      let imagesList = [];
      if (request.files && request.files.length > 0) {
        imagesList = request.files.map((image) => `/uploads/updates/${image.filename}`);
      } else if (Array.isArray(request.body.images) && request.body.images.length > 0) {
        imagesList = request.body.images;
      }

      if (imagesList.length < 3 || imagesList.length > 5) {
        throw apiError('INVALID_IMAGES', 'An update must include 3 to 5 images');
      }

      const pet = await prisma.pet.findUnique({
        where: { id: request.params.pet_id },
        select: { id: true, status: true },
      });
      if (!pet) throw apiError('PET_NOT_FOUND', 'Pet not found', undefined, 404);
      if (pet.status !== 'ADOPTED') {
        throw apiError('PET_NOT_ADOPTED', 'Updates can only be posted for adopted pets', undefined, 400);
      }

      const adoption = await prisma.application.findFirst({
        where: { petId: pet.id, applicantId: request.user.id, status: 'APPROVED' },
        select: { id: true },
      });
      if (!adoption) {
        throw apiError('FORBIDDEN', 'Only the approved adopter can post updates', undefined, 403);
      }

      const update = await prisma.petUpdate.create({
        data: {
          petId: pet.id,
          updatePeriod: period,
          description: description.trim(),
          images: imagesList,
        },
      });

      response.status(201).json({
        success: true,
        data: {
          id: update.id,
          update_id: update.id,
          created_at: update.createdAt.toISOString(),
          createdAt: update.createdAt.toISOString(),
          period: update.updatePeriod,
          description: update.description,
          images: update.images,
        },
      });
    }),
  );

  return router;
}

module.exports = { createUpdatesRouter };
