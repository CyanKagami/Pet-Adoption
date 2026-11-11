const express = require('express');
const { createRequireAuth } = require('../middlewares/auth');
const { apiError, asyncHandler } = require('../utils/http');

function createMessagesRouter(prisma) {
  const router = express.Router();
  const requireAuth = createRequireAuth(prisma);

  router.post('/messages', requireAuth, asyncHandler(async (request, response) => {
    const { receiver_id: rawReceiverId, message } = request.body || {};
    const receiverId = typeof rawReceiverId === 'string' ? rawReceiverId.trim() : rawReceiverId;
    if (typeof receiverId !== 'string' || !receiverId.trim()) {
      throw apiError('INVALID_RECEIVER', 'receiver_id is required');
    }
    if (typeof message !== 'string' || !message.trim()) {
      throw apiError('INVALID_MESSAGE', 'message is required');
    }
    if (receiverId === request.user.id) {
      throw apiError('INVALID_RECEIVER', 'You cannot send a message to yourself');
    }

    const receiver = await prisma.user.findUnique({
      where: { id: receiverId },
      select: { id: true },
    });
    if (!receiver) throw apiError('USER_NOT_FOUND', 'Recipient not found', undefined, 404);

    const createdMessage = await prisma.message.create({
      data: {
        senderId: request.user.id,
        receiverId: receiver.id,
        content: message.trim(),
      },
    });

    response.status(201).json({
      success: true,
      data: {
        message_id: createdMessage.id,
        sent_at: createdMessage.createdAt.toISOString(),
      },
    });
  }));

  return router;
}

module.exports = { createMessagesRouter };
