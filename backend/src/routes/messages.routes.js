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

async function resolveUserId(prisma, userId) {
  if (!userId.includes('-')) {
    const foundUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email: { startsWith: userId } },
          { fullName: { contains: userId, mode: 'insensitive' } },
        ],
      },
    });
    if (foundUser) return foundUser.id;
  }
  return userId;
}

function createMessagesRouter(prisma) {
  const router = express.Router();
  const requireAuth = createRequireAuth(prisma);

  const getHandler = asyncHandler(async (request, response) => {
    const { otherUserId, petId } = request.query;

    if (otherUserId) {
      const resolvedOtherId = await resolveUserId(prisma, otherUserId);

      const messages = await prisma.message.findMany({
        where: {
          AND: [
            {
              OR: [
                { senderId: request.user.id, receiverId: resolvedOtherId },
                { senderId: resolvedOtherId, receiverId: request.user.id },
              ],
            },
            { petId: typeof petId === 'string' && petId ? petId : null },
          ],
        },
        orderBy: { createdAt: 'asc' },
        include: {
          sender: { select: { id: true, fullName: true, profileImage: true } },
          receiver: { select: { id: true, fullName: true, profileImage: true } },
          pet: { select: { id: true } },
        },
      });

      return response.json({
        success: true,
        data: messages.map((m) => ({
          id: m.id,
          senderId: m.senderId,
          receiverId: m.receiverId,
          petId: m.petId,
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
        pet: {
          select: {
            id: true,
            name: true,
            status: true,
            images: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }], take: 1 },
          },
        },
      },
    });

    const threadMap = new Map();
    for (const msg of allUserMessages) {
      const isMeSender = msg.senderId === request.user.id;
      const otherUser = isMeSender ? msg.receiver : msg.sender;
      const threadKey = `${otherUser.id}:${msg.petId || 'general'}`;

      if (!threadMap.has(threadKey)) {
        threadMap.set(threadKey, {
          id: threadKey,
          userId: otherUser.id,
          userName: otherUser.fullName,
          userEmail: otherUser.email,
          userAvatar: otherUser.profileImage,
          petId: msg.pet?.id || undefined,
          petName: msg.pet?.name || 'สัตว์เลี้ยง',
          petStatus: msg.pet?.status.toLowerCase() || 'available',
          petImage: msg.pet?.images?.[0]?.imageUrl || null,
          lastMessage: msg.content,
          lastMessageAt: msg.createdAt.toISOString(),
          time: formatRelativeTime(msg.createdAt),
          unread: false,
        });
      }
      if (!msg.isRead && msg.receiverId === request.user.id) {
        threadMap.get(threadKey).unread = true;
      }
    }

    const threads = Array.from(threadMap.values());
    response.json({
      success: true,
      data: threads,
    });
  });

  const markReadHandler = asyncHandler(async (request, response) => {
    const { otherUserId, petId } = request.body || {};
    if (typeof otherUserId !== 'string' || !otherUserId.trim()) {
      throw apiError('INVALID_OTHER_USER', 'otherUserId is required');
    }

    const resolvedOtherId = await resolveUserId(prisma, otherUserId.trim());
    if (resolvedOtherId === request.user.id) {
      throw apiError('INVALID_OTHER_USER', 'You cannot mark your own messages as received');
    }

    const otherUser = await prisma.user.findUnique({
      where: { id: resolvedOtherId },
      select: { id: true },
    });
    if (!otherUser) throw apiError('USER_NOT_FOUND', 'User not found', undefined, 404);

    let targetPetId = null;
    if (petId !== undefined && petId !== null) {
      if (typeof petId !== 'string' || !petId.trim()) {
        throw apiError('INVALID_PET_ID', 'petId must be a non-empty string');
      }
      const pet = await prisma.pet.findUnique({
        where: { id: petId.trim() },
        select: { id: true },
      });
      if (!pet) throw apiError('PET_NOT_FOUND', 'Pet not found', undefined, 404);
      targetPetId = pet.id;
    }

    const result = await prisma.message.updateMany({
      where: {
        senderId: resolvedOtherId,
        receiverId: request.user.id,
        petId: targetPetId,
        isRead: false,
      },
      data: { isRead: true },
    });

    response.json({
      success: true,
      data: { count: result.count },
    });
  });

  const postHandler = asyncHandler(async (request, response) => {
    const { receiver_id, receiverId, pet_id, petId, message, content } = request.body || {};
    const rawReceiver = receiver_id || receiverId;
    const rawPetId = pet_id ?? petId;
    const rawMsg = message !== undefined ? message : content;

    let targetReceiverId = typeof rawReceiver === 'string' ? rawReceiver.trim() : rawReceiver;
    if (typeof targetReceiverId !== 'string' || !targetReceiverId.trim()) {
      throw apiError('INVALID_RECEIVER', 'receiver_id is required');
    }
    if (typeof rawMsg !== 'string' || !rawMsg.trim()) {
      throw apiError('INVALID_MESSAGE', 'message is required');
    }

    targetReceiverId = await resolveUserId(prisma, targetReceiverId);

    if (targetReceiverId === request.user.id) {
      throw apiError('INVALID_RECEIVER', 'You cannot send a message to yourself');
    }

    const receiver = await prisma.user.findUnique({
      where: { id: targetReceiverId },
      select: { id: true },
    });
    if (!receiver) throw apiError('USER_NOT_FOUND', 'Recipient not found', undefined, 404);

    let targetPetId = null;
    if (rawPetId !== undefined && rawPetId !== null) {
      if (typeof rawPetId !== 'string' || !rawPetId.trim()) {
        throw apiError('INVALID_PET_ID', 'petId must be a non-empty string');
      }
      const pet = await prisma.pet.findUnique({
        where: { id: rawPetId.trim() },
        select: { id: true },
      });
      if (!pet) throw apiError('PET_NOT_FOUND', 'Pet not found', undefined, 404);
      targetPetId = pet.id;
    }

    const createdMessage = await prisma.message.create({
      data: {
        senderId: request.user.id,
        receiverId: receiver.id,
        petId: targetPetId,
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
        petId: createdMessage.petId,
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
  router.patch('/read', requireAuth, markReadHandler);

  return router;
}

module.exports = { createMessagesRouter };
