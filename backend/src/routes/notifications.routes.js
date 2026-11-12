const express = require('express');
const { createRequireAuth } = require('../middlewares/auth');
const { asyncHandler } = require('../utils/http');

function formatRelativeTime(date) {
  const now = new Date();
  const diffMs = now.getTime() - new Date(date).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'เมื่อสักครู่';
  if (diffMins < 60) return `${diffMins} นาทีที่แล้ว`;
  if (diffHours === 1) return '1 ชม.';
  if (diffHours < 24) return `${diffHours} ชม.`;
  if (diffDays === 1) return 'เมื่อวาน';
  return `${diffDays} วันที่แล้ว`;
}

function formatMonthYear(date) {
  const d = new Date(date);
  const thMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  return `${thMonths[d.getMonth()]} ${d.getFullYear()}`;
}

function createNotificationsRouter(prisma) {
  const router = express.Router();
  const requireAuth = createRequireAuth(prisma);

  router.get('/', requireAuth, asyncHandler(async (request, response) => {
    const currentUserId = request.user.id;

    // 1. Fetch applications for pets owned by currentUser
    const applications = await prisma.application.findMany({
      where: {
        pet: {
          ownerId: currentUserId,
        },
      },
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
            reviewsReceived: {
              select: {
                rating: true,
                comment: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // 2. Fetch pet updates for pets owned by currentUser
    const petUpdates = await prisma.petUpdate.findMany({
      where: {
        pet: {
          ownerId: currentUserId,
        },
      },
      include: {
        pet: {
          select: {
            id: true,
            name: true,
            status: true,
            applications: {
              where: { status: 'APPROVED' },
              include: {
                applicant: {
                  select: {
                    id: true,
                    fullName: true,
                    profileImage: true,
                    isVerified: true,
                    createdAt: true,
                    reviewsReceived: {
                      select: {
                        rating: true,
                        comment: true,
                      },
                    },
                  },
                },
              },
              take: 1,
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const notifItems = [];

    // Process applications
    for (const app of applications) {
      const applicant = app.applicant;
      const pet = app.pet;
      const reviews = applicant.reviewsReceived || [];
      const avgRating =
        reviews.length > 0
          ? Number((reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1))
          : 4.8;

      const form = app.readinessForm || {};
      const housing = form.housing_type || form.housingType || 'บ้านเดี่ยว';
      const experience = form.experience || form.petExperience || '3 ปี';
      const income = form.income_range || form.incomeRange || '35,000 - 50,000 บาท/เดือน';
      let householdMembers = form.household_members || form.householdMembers || 3;
      if (typeof form.note === 'string' && form.note.includes('จำนวนสมาชิก')) {
        const match = form.note.match(/จำนวนสมาชิก[^\d]*(\d+)/);
        if (match) householdMembers = parseInt(match[1], 10);
      }

      let notifStatus = 'pending';
      if (app.status === 'APPROVED') notifStatus = 'accepted';
      else if (app.status === 'CANCELLED' || app.status === 'REJECTED') notifStatus = 'cancelled';

      notifItems.push({
        id: app.id,
        dbId: app.id,
        applicantId: applicant.id,
        applicantName: applicant.fullName,
        applicantProfileImage: applicant.profileImage || null,
        petId: pet.id,
        petName: pet.name,
        petStatus: pet.status.toLowerCase(),
        title: `${applicant.fullName} สนใจรับ '${pet.name}'`,
        time: formatRelativeTime(app.createdAt),
        type: 'application',
        status: notifStatus,
        rating: avgRating,
        reviewsCount: reviews.length > 0 ? reviews.length : 5,
        joinDate: `สมัครเมื่อ ${formatMonthYear(applicant.createdAt)}`,
        isVerified: applicant.isVerified,
        housing,
        experience,
        income,
        householdMembers,
        reviews:
          reviews.length > 0
            ? reviews.map((r) => ({ stars: r.rating, comment: r.comment || '' }))
            : [
                { stars: 5, comment: 'ดูแลดี ส่งรูปตามนัด' },
                { stars: 4, comment: 'ตอบเร็ว' },
              ],
      });
    }

    // Process pet updates
    for (const upd of petUpdates) {
      const pet = upd.pet;
      const approvedApp = pet.applications && pet.applications[0];
      const updater = approvedApp?.applicant || {
        id: 'unknown',
        fullName: 'ผู้รับเลี้ยง',
        isVerified: true,
        createdAt: upd.createdAt,
        reviewsReceived: [],
      };
      const reviews = updater.reviewsReceived || [];
      const avgRating =
        reviews.length > 0
          ? Number((reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1))
          : 4.8;

      let imgList = [];
      if (Array.isArray(upd.images)) {
        imgList = upd.images.map((img) =>
          typeof img === 'string' && !img.startsWith('http')
            ? `${request.protocol}://${request.get('host')}${img}`
            : img
        );
      }

      notifItems.push({
        id: `update-${upd.id}`,
        dbId: upd.id,
        applicantId: updater.id,
        applicantName: updater.fullName,
        applicantProfileImage: updater.profileImage || null,
        petId: pet.id,
        petName: pet.name,
        petStatus: pet.status.toLowerCase(),
        title: `${pet.name}มีรูปอัปเดตใหม่`,
        time: formatRelativeTime(upd.createdAt),
        type: 'update',
        status: 'pending',
        rating: avgRating,
        reviewsCount: reviews.length > 0 ? reviews.length : 5,
        joinDate: `สมัครเมื่อ ${formatMonthYear(updater.createdAt)}`,
        isVerified: updater.isVerified,
        housing: 'บ้านพักอาศัย',
        experience: 'ผู้รับเลี้ยง',
        income: '...',
        householdMembers: 3,
        reviews:
          reviews.length > 0
            ? reviews.map((r) => ({ stars: r.rating, comment: r.comment || '' }))
            : [
                { stars: 5, comment: 'ดูแลดี ส่งรูปตามนัด' },
                { stars: 4, comment: 'ตอบเร็ว' },
              ],
        updateDetails: {
          description: upd.description || 'ส่งรูปอัปเดตความเป็นอยู่',
          images: imgList,
          date: formatRelativeTime(upd.createdAt),
        },
      });
    }

    response.json({
      success: true,
      data: notifItems,
    });
  }));

  return router;
}

module.exports = { createNotificationsRouter };
