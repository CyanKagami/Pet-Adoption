const express = require('express');
const { createRequireAuth } = require('../middlewares/auth');
const { apiError, asyncHandler } = require('../utils/http');

function createWishlistsRouter(prisma) {
  const router = express.Router();
  const requireAuth = createRequireAuth(prisma);

  router.post('/', requireAuth, asyncHandler(async (request, response) => {
    const rawPetId = request.body?.pet_id ?? request.body?.petId;
    if (typeof rawPetId !== 'string' || !rawPetId.trim()) {
      throw apiError('INVALID_PET_ID', 'pet_id is required');
    }

    const pet = await prisma.pet.findUnique({
      where: { id: rawPetId.trim() },
      select: { id: true },
    });
    if (!pet) throw apiError('PET_NOT_FOUND', 'Pet not found', undefined, 404);

    try {
      await prisma.wishlist.create({
        data: { userId: request.user.id, petId: pet.id },
      });
    } catch (error) {
      if (error.code === 'P2002') {
        throw apiError('WISHLIST_ITEM_EXISTS', 'Pet already exists in your wishlist', undefined, 409);
      }
      throw error;
    }

    response.status(201).json({ success: true, message: 'Pet added to wishlist' });
  }));

  router.get('/', requireAuth, asyncHandler(async (request, response) => {
    const items = await prisma.wishlist.findMany({
      where: { userId: request.user.id },
      include: {
        pet: {
          include: {
            images: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    response.json({
      success: true,
      data: items.map(({ pet }) => {
        const imageUrls = pet.images.map((image) => {
          if (!image || !image.imageUrl) return null;
          const url = image.imageUrl;
          if (url.startsWith('data:') || url.startsWith('http://') || url.startsWith('https://')) {
            return url;
          }
          return `${request.protocol}://${request.get('host')}${url.startsWith('/') ? '' : '/'}${url}`;
        }).filter(Boolean);
        return {
          id: pet.id,
          name: pet.name,
          type: pet.type,
          ...(pet.breed && { breed: pet.breed }),
          location: pet.location,
          status: pet.status.toLowerCase(),
          image: imageUrls[0] || null,
          images: imageUrls,
        };
      }),
    });
  }));

  const removeWishlistHandler = asyncHandler(async (request, response) => {
    const rawPetId =
      request.params?.pet_id ||
      request.query?.pet_id ||
      request.query?.petId ||
      request.body?.pet_id ||
      request.body?.petId;

    if (typeof rawPetId !== 'string' || !rawPetId.trim()) {
      throw apiError('INVALID_PET_ID', 'pet_id is required');
    }

    const result = await prisma.wishlist.deleteMany({
      where: { userId: request.user.id, petId: rawPetId.trim() },
    });
    if (result.count === 0) {
      throw apiError('WISHLIST_ITEM_NOT_FOUND', 'Item not in wishlist', undefined, 404);
    }

    response.json({ success: true, message: 'Removed successfully' });
  });

  router.delete('/:pet_id', requireAuth, removeWishlistHandler);
  router.delete('/', requireAuth, removeWishlistHandler);

  return router;
}

module.exports = { createWishlistsRouter };
