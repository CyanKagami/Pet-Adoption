const express = require('express');
const { apiError, asyncHandler } = require('../utils/http');
const { toPublicImageUrl } = require('../utils/serializers');

function createUsersRouter(prisma) {
  const router = express.Router();

  router.get('/:userId', asyncHandler(async (request, response) => {
    const user = await prisma.user.findUnique({
      where: { id: request.params.userId },
      select: {
        id: true,
        fullName: true,
        profileImage: true,
        isVerified: true,
        createdAt: true,
        applications: {
          where: {
            status: 'APPROVED',
            pet: { status: 'ADOPTED' },
          },
          orderBy: { createdAt: 'desc' },
          select: {
            pet: {
              select: {
                id: true,
                name: true,
                type: true,
                breed: true,
                location: true,
                status: true,
                createdAt: true,
                images: {
                  orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
                  take: 1,
                  select: { imageUrl: true },
                },
              },
            },
          },
        },
      },
    });

    if (!user) throw apiError('USER_NOT_FOUND', 'User not found', undefined, 404);

    const reviews = await prisma.review.findMany({
      where: { targetId: user.id },
      include: {
        reviewer: {
          select: { id: true, fullName: true, profileImage: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    const averageRating = reviews.length
      ? Number((reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length).toFixed(1))
      : null;

    response.json({
      success: true,
      data: {
        id: user.id,
        fullName: user.fullName,
        profileImage: user.profileImage ? toPublicImageUrl(user.profileImage) : null,
        isVerified: user.isVerified,
        createdAt: user.createdAt.toISOString(),
        adoptedPets: user.applications.map(({ pet }) => ({
          id: pet.id,
          name: pet.name,
          type: pet.type,
          breed: pet.breed,
          location: pet.location,
          status: pet.status.toLowerCase(),
          createdAt: pet.createdAt.toISOString(),
          image: pet.images[0] ? toPublicImageUrl(pet.images[0].imageUrl) : null,
        })),
        reviews: reviews.map((review) => ({
          id: review.id,
          rating: review.rating,
          comment: review.comment,
          createdAt: review.createdAt.toISOString(),
          reviewer: {
            id: review.reviewer.id,
            fullName: review.reviewer.fullName,
            profileImage: review.reviewer.profileImage
              ? toPublicImageUrl(review.reviewer.profileImage)
              : null,
          },
        })),
        totalReviews: reviews.length,
        averageRating,
      },
    });
  }));

  return router;
}

module.exports = { createUsersRouter };
