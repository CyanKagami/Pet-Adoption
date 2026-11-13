const express = require('express');
const { createRequireAuth } = require('../middlewares/auth');
const { asyncHandler } = require('../utils/http');
const { toPublicImageUrl } = require('../utils/serializers');
const { subscribeToNotificationChanges } = require('../utils/notificationEvents');

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

function getFormString(form, ...keys) {
  for (const key of keys) {
    const value = form[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return 'ไม่ระบุ';
}

function createNotificationsRouter(prisma) {
  const router = express.Router();
  const requireAuth = createRequireAuth(prisma);

  router.get('/events', requireAuth, (request, response) => {
    response.status(200);
    response.set({
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Content-Type': 'text/event-stream',
      'X-Accel-Buffering': 'no',
    });
    response.flushHeaders();
    response.write(': connected\n\n');
    subscribeToNotificationChanges(request.user.id, response);

    const heartbeat = setInterval(() => {
      if (!response.destroyed && !response.writableEnded) response.write(': keep-alive\n\n');
    }, 25000);
    response.on('close', () => clearInterval(heartbeat));
  });

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
          : null;

      const form = app.readinessForm || {};
      const housing = getFormString(form, 'housing_type', 'housingType');
      const experience = getFormString(form, 'experience', 'petExperience');
      const income = getFormString(form, 'income_range', 'incomeRange');
      let householdMembers = form.household_members ?? form.householdMembers ?? null;
      if (typeof form.note === 'string' && form.note.includes('จำนวนสมาชิก')) {
        const match = form.note.match(/จำนวนสมาชิก[^\d]*(\d+)/);
        if (match) householdMembers = Number(match[1]);
      }
      if (typeof householdMembers === 'string' && householdMembers.trim()) {
        householdMembers = Number(householdMembers);
      }
      if (!Number.isInteger(householdMembers) || householdMembers < 1) householdMembers = null;

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
        reviewsCount: reviews.length,
        joinDate: `สมัครเมื่อ ${formatMonthYear(applicant.createdAt)}`,
        isVerified: applicant.isVerified,
        housing,
        experience,
        income,
        householdMembers,
        reviews: reviews.map((r) => ({ stars: r.rating, comment: r.comment || '' })),
      });
    }

    // Process pet updates
    for (const upd of petUpdates) {
      const pet = upd.pet;
      const approvedApp = pet.applications && pet.applications[0];
      const updater = approvedApp?.applicant || null;
      const reviews = updater?.reviewsReceived || [];
      const avgRating =
        reviews.length > 0
          ? Number((reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1))
          : null;

      let imgList = [];
      if (Array.isArray(upd.images)) {
        imgList = upd.images.map(toPublicImageUrl);
      }

      notifItems.push({
        id: `update-${upd.id}`,
        dbId: upd.id,
        applicantId: updater?.id || null,
        applicantName: updater?.fullName || 'ไม่พบข้อมูลผู้รับเลี้ยง',
        applicantProfileImage: updater?.profileImage || null,
        petId: pet.id,
        petName: pet.name,
        petStatus: pet.status.toLowerCase(),
        title: `${pet.name}มีรูปอัปเดตใหม่`,
        time: formatRelativeTime(upd.createdAt),
        type: 'update',
        status: 'pending',
        rating: avgRating,
        reviewsCount: reviews.length,
        joinDate: updater?.createdAt ? `สมัครเมื่อ ${formatMonthYear(updater.createdAt)}` : null,
        isVerified: updater?.isVerified ?? null,
        housing: null,
        experience: null,
        income: null,
        householdMembers: null,
        reviews: reviews.map((r) => ({ stars: r.rating, comment: r.comment || '' })),
        updateDetails: {
          description: upd.description?.trim() || 'ไม่มีรายละเอียดเพิ่มเติม',
          images: imgList,
          date: formatRelativeTime(upd.createdAt),
        },
      });
    }

    // 3. Fetch applications where currentUser is the APPLICANT (to notify recipient)
    const myApplications = await prisma.application.findMany({
      where: {
        applicantId: currentUserId,
      },
      include: {
        pet: {
          select: {
            id: true,
            name: true,
            type: true,
            status: true,
            images: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] },
            owner: {
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
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    for (const app of myApplications) {
      const pet = app.pet;
      const owner = pet.owner;
      const reviews = owner.reviewsReceived || [];
      const avgRating =
        reviews.length > 0
          ? Number((reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1))
          : null;

      const isApproved = app.status === 'APPROVED';
      const isRejected = app.status === 'CANCELLED' || app.status === 'REJECTED';
      const isAdopted = pet.status === 'ADOPTED';

      let notifStatus = 'pending';
      let title = `คำขอรับเลี้ยง '${pet.name}' อยู่ระหว่างการพิจารณา`;
      let note = 'ใบสมัครของคุณได้รับการส่งถึงเจ้าของแล้ว เจ้าของกำลังตรวจสอบแบบประเมินความพร้อม';

      if (isApproved && isAdopted) {
        notifStatus = 'accepted';
        title = `🎉 การรับเลี้ยงสำเร็จ! คุณได้รับเลี้ยงน้อง '${pet.name}' เรียบร้อยแล้ว`;
        note = `ยินดีด้วย! เจ้าของได้ยืนยันการรับเลี้ยงน้อง "${pet.name}" ให้คุณเรียบร้อยแล้ว คุณสามารถส่งรูปภาพอัปเดตความเป็นอยู่ตามรอบ (1 เดือน, 3 เดือน, 5 เดือน, 1 ปี) และเขียนรีวิวเจ้าของเดิมได้ที่หน้า 'สัตว์ที่รับเลี้ยง'`;
      } else if (isApproved) {
        notifStatus = 'accepted';
        title = `🎉 ยินดีด้วย! ${owner.fullName} ได้คัดเลือกคุณให้รับเลี้ยง '${pet.name}'`;
        note = `เจ้าของได้คัดเลือกคุณให้เป็นผู้รับเลี้ยงน้อง "${pet.name}" เรียบร้อยแล้ว (สถานะ: รอส่งมอบ) กรุณากดปุ่ม "แชท" เพื่อพูดคุยเตรียมนัดหมายรับน้อง และเตรียมนัดรับตัวน้อง`;
      } else if (isRejected) {
        notifStatus = 'cancelled';
        title = `คำขอรับเลี้ยง '${pet.name}' ได้รับการปฏิเสธ`;
        note = `ขออภัย คำขอรับเลี้ยงน้อง "${pet.name}" ไม่ผ่านการคัดเลือกในครั้งนี้ คุณสามารถค้นหาสัตว์เลี้ยงตัวอื่นที่รอคอยบ้านใหม่ได้`;
      }

      const primaryImage = pet.images && pet.images[0] ? pet.images[0].imageUrl : null;
      const formattedPetImage = primaryImage ? toPublicImageUrl(primaryImage) : null;

      notifItems.push({
        id: `applicant-app-${app.id}`,
        dbId: app.id,
        isApplicantNotification: true,
        applicantId: owner.id,
        applicantName: owner.fullName,
        applicantProfileImage: owner.profileImage || null,
        ownerId: owner.id,
        ownerName: owner.fullName,
        petId: pet.id,
        petName: pet.name,
        petBreed: pet.breed || pet.type,
        petStatus: pet.status.toLowerCase(),
        petImage: formattedPetImage,
        title,
        time: formatRelativeTime(app.updatedAt || app.createdAt),
        type: 'application_result',
        status: notifStatus,
        rating: avgRating,
        reviewsCount: reviews.length,
        joinDate: `สมัครเมื่อ ${formatMonthYear(owner.createdAt)}`,
        isVerified: owner.isVerified,
        housing: null,
        experience: null,
        income: null,
        householdMembers: null,
        reviews: reviews.map((r) => ({ stars: r.rating, comment: r.comment || '' })),
        note,
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
