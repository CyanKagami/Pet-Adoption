const express = require('express');
const { createRequireAuth } = require('../middlewares/auth');
const { apiError, asyncHandler } = require('../utils/http');

function createReviewsRouter(prisma) {
  const router = express.Router();
  const requireAuth = createRequireAuth(prisma);

  router.post('/', requireAuth, asyncHandler(async (request, response) => {
    const { target_user_id: rawTargetId, rating, comment } = request.body || {};
    const targetId = typeof rawTargetId === 'string' ? rawTargetId.trim() : rawTargetId;
    if (typeof targetId !== 'string' || !targetId.trim()) {
      throw apiError('INVALID_TARGET_USER', 'target_user_id is required');
    }
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw apiError('INVALID_RATING', 'rating must be an integer from 1 to 5');
    }
    if (comment !== undefined && typeof comment !== 'string') {
      throw apiError('INVALID_COMMENT', 'comment must be a string');
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
      data: { review_id: review.id, created_at: review.createdAt.toISOString() },
    });
  }));

  return router;
}

module.exports = { createReviewsRouter };
