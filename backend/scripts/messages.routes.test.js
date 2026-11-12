const assert = require('node:assert/strict');
const { after, before, describe, it } = require('node:test');
const express = require('express');
const jwt = require('jsonwebtoken');
const { createMessagesRouter } = require('../src/routes/messages.routes');

process.env.JWT_SECRET = 'messages-route-test-secret';

const currentUserId = '00000000-0000-4000-8000-000000000001';
const otherUserId = '00000000-0000-4000-8000-000000000002';
const firstPetId = '00000000-0000-4000-8000-000000000003';
const secondPetId = '00000000-0000-4000-8000-000000000004';
const users = [
  { id: currentUserId, fullName: 'Current User', email: 'current@example.test', profileImage: null },
  { id: otherUserId, fullName: 'Other User', email: 'other@example.test', profileImage: null },
];
const pets = [
  { id: firstPetId, name: 'First Pet', status: 'AVAILABLE', images: [] },
  { id: secondPetId, name: 'Second Pet', status: 'AVAILABLE', images: [] },
];
const messages = [
  {
    id: 'incoming-unread',
    senderId: otherUserId,
    receiverId: currentUserId,
    petId: firstPetId,
    content: 'Incoming unread',
    isRead: false,
    createdAt: new Date('2024-01-01T10:00:00.000Z'),
  },
  {
    id: 'outgoing-latest',
    senderId: currentUserId,
    receiverId: otherUserId,
    petId: firstPetId,
    content: 'Outgoing latest',
    isRead: true,
    createdAt: new Date('2024-01-01T10:01:00.000Z'),
  },
  {
    id: 'other-pet-unread',
    senderId: otherUserId,
    receiverId: currentUserId,
    petId: secondPetId,
    content: 'Other pet unread',
    isRead: false,
    createdAt: new Date('2024-01-01T10:02:00.000Z'),
  },
];

let server;
let baseUrl;

before(async () => {
  const prisma = {
    user: {
      findUnique: async ({ where }) => users.find((user) => user.id === where.id) || null,
    },
    pet: {
      findUnique: async ({ where }) => pets.find((pet) => pet.id === where.id) || null,
    },
    message: {
      findMany: async ({ where, orderBy }) => {
        let results = messages;
        if (where.AND) {
          const [conversation, petFilter] = where.AND;
          results = results.filter((message) => (
            conversation.OR.some((pair) => (
              message.senderId === pair.senderId && message.receiverId === pair.receiverId
            ))
            && message.petId === petFilter.petId
          ));
        } else {
          results = results.filter((message) => (
            where.OR.some((pair) => (
              message.senderId === pair.senderId || message.receiverId === pair.receiverId
            ))
          ));
        }

        results = [...results].sort((a, b) => (
          orderBy.createdAt === 'asc'
            ? a.createdAt - b.createdAt
            : b.createdAt - a.createdAt
        ));
        return results.map((message) => ({
          ...message,
          sender: users.find((user) => user.id === message.senderId),
          receiver: users.find((user) => user.id === message.receiverId),
          pet: pets.find((pet) => pet.id === message.petId) || null,
        }));
      },
      updateMany: async ({ where, data }) => {
        let count = 0;
        for (const message of messages) {
          if (
            message.senderId === where.senderId
            && message.receiverId === where.receiverId
            && message.petId === where.petId
            && message.isRead === where.isRead
          ) {
            Object.assign(message, data);
            count += 1;
          }
        }
        return { count };
      },
    },
  };
  const app = express();
  app.use(express.json());
  app.use('/api/v1/messages', createMessagesRouter(prisma));
  app.use((error, _request, response, _next) => {
    response.status(error.statusCode || 500).json({
      error: { code: error.code, message: error.message },
    });
  });
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api/v1/messages`;
});

after(async () => {
  if (server) {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

async function request(path, options = {}) {
  const token = jwt.sign({ id: currentUserId }, process.env.JWT_SECRET);
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  return { response, body: await response.json() };
}

describe('chat message read state', () => {
  it('reports unread when any incoming message in the thread is unread', async () => {
    const { response, body } = await request('/');

    assert.equal(response.status, 200);
    const firstThread = body.data.find((thread) => thread.petId === firstPetId);
    assert.equal(firstThread.lastMessage, 'Outgoing latest');
    assert.equal(firstThread.unread, true);
  });

  it('marks only incoming messages in the selected pet conversation as read', async () => {
    const { response, body } = await request('/read', {
      method: 'PATCH',
      body: JSON.stringify({ otherUserId, petId: firstPetId }),
    });

    assert.equal(response.status, 200);
    assert.equal(body.data.count, 1);
    assert.equal(messages.find((message) => message.id === 'incoming-unread').isRead, true);
    assert.equal(messages.find((message) => message.id === 'other-pet-unread').isRead, false);

    const threads = await request('/');
    assert.equal(threads.body.data.find((thread) => thread.petId === firstPetId).unread, false);
    assert.equal(threads.body.data.find((thread) => thread.petId === secondPetId).unread, true);
  });
});
