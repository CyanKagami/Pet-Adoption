const express = require('express');
const { createRequireAuth } = require('../middlewares/auth');
const { apiError, asyncHandler } = require('../utils/http');

function createApplicationsRouter(prisma) {
  const router = express.Router();
  const requireAuth = createRequireAuth(prisma);

  router.post('/:pet_id/applications', requireAuth, asyncHandler(async (request, response) => {
    const { housing_type: housingType, income_range: incomeRange, experience, note } = request.body || {};
    for (const [field, value] of Object.entries({
      housing_type: housingType,
      income_range: incomeRange,
      experience,
    })) {
      if (typeof value !== 'string' || !value.trim()) {
        throw apiError('INVALID_APPLICATION', `${field} is required`);
      }
    }
    if (note !== undefined && typeof note !== 'string') {
      throw apiError('INVALID_APPLICATION', 'note must be a string');
    }

    const pet = await prisma.pet.findUnique({
      where: { id: request.params.pet_id },
      select: { id: true },
    });
    if (!pet) throw apiError('PET_NOT_FOUND', 'Pet not found', undefined, 404);

    let application;
    try {
      application = await prisma.application.create({
        data: {
          petId: pet.id,
          applicantId: request.user.id,
          readinessForm: {
            housing_type: housingType.trim(),
            income_range: incomeRange.trim(),
            experience: experience.trim(),
            ...(typeof note === 'string' && note.trim() ? { note: note.trim() } : {}),
          },
        },
      });
    } catch (error) {
      if (error.code === 'P2002') {
        throw apiError('APPLICATION_ALREADY_SUBMITTED', 'You have already applied for this pet');
      }
      throw error;
    }

    response.status(201).json({
      success: true,
      data: {
        application_id: application.id,
        submitted_at: application.createdAt.toISOString(),
      },
    });
  }));

  router.get('/:pet_id/applications', requireAuth, asyncHandler(async (request, response) => {
    const pet = await prisma.pet.findUnique({
      where: { id: request.params.pet_id },
      select: { id: true, ownerId: true },
    });
    if (!pet) throw apiError('PET_NOT_FOUND', 'Pet not found', undefined, 404);
    if (pet.ownerId !== request.user.id) {
      throw apiError('FORBIDDEN', 'Only the pet owner can view applications', undefined, 403);
    }

    const applications = await prisma.application.findMany({
      where: { petId: pet.id },
      include: {
        applicant: {
          select: { id: true, fullName: true, email: true, phoneNumber: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    response.json({
      success: true,
      data: applications.map((application) => {
        const form = application.readinessForm;
        return {
          application_id: application.id,
          pet_id: application.petId,
          housing_type: form.housing_type,
          income_range: form.income_range,
          experience: form.experience,
          ...(form.note && { note: form.note }),
          submitted_at: application.createdAt.toISOString(),
          applicant: {
            id: application.applicant.id,
            name: application.applicant.fullName,
            email: application.applicant.email,
            phone: application.applicant.phoneNumber,
          },
        };
      }),
    });
  }));

  return router;
}

module.exports = { createApplicationsRouter };
