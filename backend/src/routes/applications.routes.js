const express = require('express');
const { createRequireAuth } = require('../middlewares/auth');
const { apiError, asyncHandler } = require('../utils/http');
const { serializeApplication } = require('../utils/serializers');
const { publishNotificationChanged } = require('../utils/notificationEvents');

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
      select: { id: true, ownerId: true },
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

    publishNotificationChanged(pet.ownerId);

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

function createApplicationManagementRouter(prisma) {
  const router = express.Router();
  const requireAuth = createRequireAuth(prisma);

  router.get('/', requireAuth, asyncHandler(async (request, response) => {
    const { petId } = request.query;
    const where = {};
    if (petId) {
      where.petId = petId;
      where.OR = [
        { pet: { ownerId: request.user.id } },
        { applicantId: request.user.id },
      ];
    } else {
      where.OR = [
        { pet: { ownerId: request.user.id } },
        { applicantId: request.user.id },
      ];
    }

    const applications = await prisma.application.findMany({
      where,
      include: {
        pet: {
          select: {
            id: true,
            name: true,
            type: true,
            status: true,
            ownerId: true,
          },
        },
        applicant: {
          select: {
            id: true,
            fullName: true,
            email: true,
            phoneNumber: true,
            profileImage: true,
            isVerified: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    response.json({
      success: true,
      data: applications.map(serializeApplication),
    });
  }));

  router.post('/', requireAuth, asyncHandler(async (request, response) => {
    const {
      petId,
      pet_id,
      housingType,
      housing_type,
      incomeRange,
      income_range,
      petExperience,
      experience,
      householdMembers,
      adoptionReason,
      agreeTerms,
      note,
      applicantName,
    } = request.body || {};

    const targetPetId = petId || pet_id;
    if (!targetPetId) {
      throw apiError('INVALID_APPLICATION', 'petId is required');
    }

    const finalHousing = housingType || housing_type || '';
    const finalIncome = incomeRange || income_range || '';
    const finalExp = petExperience || experience || '';

    if (!finalHousing || !finalIncome || !finalExp) {
      throw apiError('INVALID_APPLICATION', 'housing_type, income_range, and experience are required');
    }

    const pet = await prisma.pet.findUnique({
      where: { id: targetPetId },
      select: { id: true, ownerId: true },
    });
    if (!pet) throw apiError('PET_NOT_FOUND', 'Pet not found', undefined, 404);

    if (pet.ownerId === request.user.id) {
      throw apiError('INVALID_APPLICATION', 'You cannot apply to adopt your own pet');
    }

    const compiledNoteParts = [];
    if (householdMembers) compiledNoteParts.push(`จำนวนสมาชิก/สัตว์เลี้ยงอื่น: ${householdMembers}`);
    if (adoptionReason) compiledNoteParts.push(`เหตุผลที่อยากรับเลี้ยง: ${adoptionReason}`);
    if (applicantName) compiledNoteParts.push(`ชื่อผู้สมัคร: ${applicantName}`);
    if (agreeTerms !== undefined) compiledNoteParts.push(`ยอมรับเงื่อนไขการรับเลี้ยง: ${agreeTerms ? 'ยอมรับ' : 'ไม่ยอมรับ'}`);
    if (note) compiledNoteParts.push(note);
    const compiledNote = compiledNoteParts.join('\n');

    let application;
    try {
      application = await prisma.application.create({
        data: {
          petId: pet.id,
          applicantId: request.user.id,
          readinessForm: {
            housing_type: String(finalHousing).trim(),
            income_range: String(finalIncome).trim(),
            experience: String(finalExp).trim(),
            ...(compiledNote ? { note: compiledNote } : {}),
            household_members: householdMembers,
            adoption_reason: adoptionReason,
          },
        },
        include: {
          pet: { select: { id: true, name: true, type: true } },
          applicant: { select: { id: true, fullName: true, email: true } },
        },
      });
    } catch (error) {
      if (error.code === 'P2002') {
        throw apiError('APPLICATION_ALREADY_SUBMITTED', 'You have already applied for this pet');
      }
      throw error;
    }

    // Send initial inquiry message from applicant to owner to start chat thread
    await prisma.message.create({
      data: {
        senderId: request.user.id,
        receiverId: pet.ownerId,
        petId: pet.id,
        content: `สวัสดีครับ/ค่ะ สนใจขอรับเลี้ยงน้อง "${pet.name}" และได้ส่งแบบประเมินความพร้อมรับเลี้ยงเรียบร้อยแล้วครับ/ค่ะ`,
      },
    }).catch(() => null);

    publishNotificationChanged(pet.ownerId);

    response.status(201).json({
      success: true,
      message: 'ส่งแบบประเมินความพร้อมรับเลี้ยงเรียบร้อยแล้ว',
      data: {
        ...serializeApplication(application),
        application_id: application.id,
        submitted_at: application.createdAt.toISOString(),
      },
    });
  }));

  router.patch('/', requireAuth, asyncHandler(async (request, response) => {
    const { id, status } = request.body || {};
    if (!id || !status) {
      throw apiError('INVALID_APPLICATION', 'id and status are required');
    }

    const application = await prisma.application.findUnique({
      where: { id },
      include: { pet: true, applicant: true },
    });
    if (!application) {
      throw apiError('APPLICATION_NOT_FOUND', 'Application not found', undefined, 404);
    }
    if (application.pet.ownerId !== request.user.id && application.applicantId !== request.user.id) {
      throw apiError('FORBIDDEN', 'No permission to update this application', undefined, 403);
    }

    let mappedStatus = 'PENDING';
    const s = String(status).toUpperCase();
    if (s === 'ACCEPTED' || s === 'APPROVED') mappedStatus = 'APPROVED';
    else if (s === 'CANCELLED' || s === 'REJECTED') mappedStatus = 'CANCELLED';

    const { updated, changed } = await prisma.$transaction(async (transaction) => {
      const transition = await transaction.application.updateMany({
        where: { id, status: { not: mappedStatus } },
        data: { status: mappedStatus },
      });

      if (transition.count > 0 && mappedStatus === 'APPROVED') {
        await transaction.pet.update({
          where: { id: application.petId },
          data: { status: 'PENDING' },
        });
        await transaction.message.create({
          data: {
            senderId: request.user.id,
            receiverId: application.applicantId,
            petId: application.petId,
            content: `🎉 ยินดีด้วยครับ/ค่ะ! คุณได้รับการคัดเลือกให้เป็นผู้รับเลี้ยงน้อง "${application.pet.name}" เรียบร้อยแล้ว กรุณาพูดคุยเพื่อนัดหมายวันและเวลารับน้อง หรือสอบถามรายละเอียดเพิ่มเติมได้เลยครับ/ค่ะ`,
          },
        });
      } else if (transition.count > 0 && mappedStatus === 'CANCELLED') {
        await transaction.message.create({
          data: {
            senderId: request.user.id,
            receiverId: application.applicantId,
            petId: application.petId,
            content: `ขออภัยด้วยครับ/ค่ะ คำขอรับเลี้ยงน้อง "${application.pet.name}" ไม่ผ่านการคัดเลือกในครั้งนี้ ขอขอบคุณที่ให้ความสนใจและรักสัตว์เลี้ยงครับ/ค่ะ`,
          },
        });
      }

      const updatedApplication = await transaction.application.findUnique({
        where: { id },
        include: {
          pet: true,
          applicant: true,
        },
      });
      return { updated: updatedApplication, changed: transition.count > 0 };
    });

    if (changed) {
      publishNotificationChanged(application.applicantId);
      publishNotificationChanged(application.pet.ownerId);
    }

    response.json({ success: true, data: serializeApplication(updated) });
  }));

  return router;
}

module.exports = { createApplicationsRouter, createApplicationManagementRouter };
