const express = require('express');
const { createRequireAuth } = require('../middlewares/auth');
const { apiError, asyncHandler } = require('../utils/http');

function formatRelativeTime(date) {
  const now = new Date();
  const diffMs = now.getTime() - new Date(date).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'เมื่อสักครู่';
  if (diffMins < 60) return `${diffMins} นาทีที่แล้ว`;
  if (diffHours < 24) return `${diffHours} ชม.`;
  if (diffDays === 1) return 'เมื่อวาน';
  return `${diffDays} วันที่แล้ว`;
}

function createMessagesRouter(prisma) {
  const router = express.Router();
  const requireAuth = createRequireAuth(prisma);

  const getHandler = asyncHandler(async (request, response) => {
    const { otherUserId } = request.query;

    if (otherUserId) {
      let resolvedOtherId = otherUserId;
      if (!otherUserId.includes('-')) {
        const foundUser = await prisma.user.findFirst({
          where: {
            OR: [
              { email: { startsWith: otherUserId } },
              { fullName: { contains: otherUserId, mode: 'insensitive' } },
            ],
          },
        });
        if (foundUser) resolvedOtherId = foundUser.id;
      }

      const messages = await prisma.message.findMany({
        where: {
          OR: [
            { senderId: request.user.id, receiverId: resolvedOtherId },
            { senderId: resolvedOtherId, receiverId: request.user.id },
          ],
        },
        orderBy: { createdAt: 'asc' },
        include: {
          sender: { select: { id: true, fullName: true, profileImage: true } },
          receiver: { select: { id: true, fullName: true, profileImage: true } },
        },
      });

      return response.json({
        success: true,
        data: messages.map((m) => ({
          id: m.id,
          senderId: m.senderId,
          receiverId: m.receiverId,
          content: m.content,
          message: m.content,
          isRead: m.isRead,
          createdAt: m.createdAt.toISOString(),
          sender: m.sender,
          receiver: m.receiver,
        })),
      });
    }

    // Get threads
    const allUserMessages = await prisma.message.findMany({
      where: {
        OR: [
          { senderId: request.user.id },
          { receiverId: request.user.id },
        ],
      },
      orderBy: { createdAt: 'desc' },
      include: {
        sender: { select: { id: true, fullName: true, profileImage: true, email: true } },
        receiver: { select: { id: true, fullName: true, profileImage: true, email: true } },
      },
    });

    const threadMap = new Map();
    for (const msg of allUserMessages) {
      const isMeSender = msg.senderId === request.user.id;
      const otherUser = isMeSender ? msg.receiver : msg.sender;
      const threadKey = otherUser.id;

      if (!threadMap.has(threadKey)) {
        threadMap.set(threadKey, {
          id: otherUser.id,
          userId: otherUser.id,
          userName: otherUser.fullName,
          userEmail: otherUser.email,
          userAvatar: otherUser.profileImage,
          petName: 'สัตว์เลี้ยง',
          petStatus: 'available',
          petImage: null,
          lastMessage: msg.content,
          lastMessageAt: msg.createdAt.toISOString(),
          time: formatRelativeTime(msg.createdAt),
          unread: !msg.isRead && msg.receiverId === request.user.id,
        });
      }
    }

    response.json({
      success: true,
      data: Array.from(threadMap.values()),
    });
  });

  const postHandler = asyncHandler(async (request, response) => {
    const { receiver_id, receiverId, message, content } = request.body || {};
    const rawReceiver = receiver_id || receiverId;
    const rawMsg = message !== undefined ? message : content;

    let targetReceiverId = typeof rawReceiver === 'string' ? rawReceiver.trim() : rawReceiver;
    if (typeof targetReceiverId !== 'string' || !targetReceiverId.trim()) {
      throw apiError('INVALID_RECEIVER', 'receiver_id is required');
    }
    if (typeof rawMsg !== 'string' || !rawMsg.trim()) {
      throw apiError('INVALID_MESSAGE', 'message is required');
    }

    if (!targetReceiverId.includes('-')) {
      const foundUser = await prisma.user.findFirst({
        where: {
          OR: [
            { email: { startsWith: targetReceiverId } },
            { fullName: { contains: targetReceiverId, mode: 'insensitive' } },
          ],
        },
      });
      if (foundUser) targetReceiverId = foundUser.id;
    }

    if (targetReceiverId === request.user.id) {
      throw apiError('INVALID_RECEIVER', 'You cannot send a message to yourself');
    }

    const receiver = await prisma.user.findUnique({
      where: { id: targetReceiverId },
      select: { id: true },
    });
    if (!receiver) throw apiError('USER_NOT_FOUND', 'Recipient not found', undefined, 404);

    const createdMessage = await prisma.message.create({
      data: {
        senderId: request.user.id,
        receiverId: receiver.id,
        content: rawMsg.trim(),
      },
    });

    response.status(201).json({
      success: true,
      data: {
        id: createdMessage.id,
        message_id: createdMessage.id,
        senderId: createdMessage.senderId,
        receiverId: createdMessage.receiverId,
        content: createdMessage.content,
        message: createdMessage.content,
        createdAt: createdMessage.createdAt.toISOString(),
        sent_at: createdMessage.createdAt.toISOString(),
      },
    });
  });

  router.get('/', requireAuth, getHandler);
  router.get('/messages', requireAuth, getHandler);
  router.post('/', requireAuth, postHandler);
  router.post('/messages', requireAuth, postHandler);

  return router;
}

module.exports = { createMessagesRouter };
