const express = require('express');
const { createRequireAuth } = require('../middlewares/auth');
const { apiError, asyncHandler } = require('../utils/http');

function createReviewsRouter(prisma) {
  const router = express.Router();
  const requireAuth = createRequireAuth(prisma);

  router.get('/', asyncHandler(async (request, response) => {
    const rawTargetId = request.query.target_user_id || request.query.targetUserId;
    const where = {};

    if (rawTargetId) {
      let resolvedTargetId = String(rawTargetId).trim();
      if (!resolvedTargetId.includes('-')) {
        const found = await prisma.user.findFirst({
          where: {
            OR: [
              { email: { startsWith: resolvedTargetId } },
              { fullName: { contains: resolvedTargetId, mode: 'insensitive' } },
            ],
          },
        });
        if (found) resolvedTargetId = found.id;
      }
      where.targetId = resolvedTargetId;
    }

    const reviews = await prisma.review.findMany({
      where,
      include: {
        reviewer: {
          select: {
            id: true,
            fullName: true,
            profileImage: true,
          },
        },
        target: {
          select: {
            id: true,
            fullName: true,
            profileImage: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    response.json({
      success: true,
      data: reviews.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt.toISOString(),
        reviewer: r.reviewer,
        targetUser: r.target,
        target: r.target,
      })),
    });
  }));

  router.post('/', requireAuth, asyncHandler(async (request, response) => {
    const { target_user_id, targetUserId, rating, comment } = request.body || {};
    const rawTarget = target_user_id !== undefined ? target_user_id : targetUserId;

    if (rawTarget === undefined || rawTarget === null || (typeof rawTarget === 'string' && !rawTarget.trim())) {
      throw apiError('INVALID_TARGET_USER', 'target_user_id is required');
    }

    if (typeof rating !== 'number' || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw apiError('INVALID_RATING', 'rating must be an integer from 1 to 5');
    }

    if (comment !== undefined && typeof comment !== 'string') {
      throw apiError('INVALID_COMMENT', 'comment must be a string');
    }

    let targetId = typeof rawTarget === 'string' ? rawTarget.trim() : rawTarget;
    if (typeof targetId === 'string' && !targetId.includes('-')) {
      const found = await prisma.user.findFirst({
        where: {
          OR: [
            { email: { startsWith: targetId } },
            { fullName: { contains: targetId, mode: 'insensitive' } },
          ],
        },
      });
      if (found) targetId = found.id;
    }

    if (targetId === request.user.id) {
      throw apiError('INVALID_TARGET_USER', 'You cannot review yourself');
    }

    const target = await prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true },
    });
    if (!target) throw apiError('USER_NOT_FOUND', 'Review target not found', undefined, 404);

    const review = await prisma.review.create({
      data: {
        reviewerId: request.user.id,
        targetId: target.id,
        rating,
        comment: typeof comment === 'string' && comment.trim() ? comment.trim() : null,
      },
    });

    response.status(201).json({
      success: true,
      data: {
        id: review.id,
        review_id: review.id,
        created_at: review.createdAt.toISOString(),
        createdAt: review.createdAt.toISOString(),
        rating: review.rating,
        comment: review.comment,
      },
    });
  }));

  return router;
}

module.exports = { createReviewsRouter };
