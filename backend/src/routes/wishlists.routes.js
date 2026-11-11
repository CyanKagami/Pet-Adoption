const express = require('express');
const { createRequireAuth } = require('../middlewares/auth');
const { apiError, asyncHandler } = require('../utils/http');

function createWishlistsRouter(prisma) {
  const router = express.Router();
  const requireAuth = createRequireAuth(prisma);

  router.post('/', requireAuth, asyncHandler(async (request, response) => {
    const { pet_id: petId } = request.body || {};
    if (typeof petId !== 'string' || !petId.trim()) {
      throw apiError('INVALID_PET_ID', 'pet_id is required');
    }

    const pet = await prisma.pet.findUnique({
      where: { id: petId.trim() },
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
      data: items.map(({ pet }) => ({
        id: pet.id,
        name: pet.name,
        type: pet.type,
        ...(pet.breed && { breed: pet.breed }),
        location: pet.location,
        status: pet.status === 'ADOPTED' ? 'adopted' : 'available',
        images: pet.images.map((image) => (
          image.imageUrl.startsWith('http')
            ? image.imageUrl
            : `${request.protocol}://${request.get('host')}${image.imageUrl}`
        )),
      })),
    });
  }));

  router.delete('/:pet_id', requireAuth, asyncHandler(async (request, response) => {
    const result = await prisma.wishlist.deleteMany({
      where: { userId: request.user.id, petId: request.params.pet_id },
    });
    if (result.count === 0) {
      throw apiError('WISHLIST_ITEM_NOT_FOUND', 'Item not in wishlist', undefined, 404);
    }

    response.json({ success: true, message: 'Removed successfully' });
  }));

  return router;
}

module.exports = { createWishlistsRouter };
