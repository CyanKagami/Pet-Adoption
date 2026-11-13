const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { after, before, describe, it } = require('node:test');
const express = require('express');
const jwt = require('jsonwebtoken');
const { createNotificationsRouter } = require('../src/routes/notifications.routes');
const {
  publishNotificationChanged,
  subscribeToNotificationChanges,
} = require('../src/utils/notificationEvents');

process.env.JWT_SECRET = 'notifications-route-test-secret';

const ownerId = 'notifications-test-owner';
const applicantId = 'notifications-test-applicant';
const createdAt = new Date('2024-03-15T12:00:00.000Z');
const owner = {
  id: ownerId,
  fullName: 'Test Owner',
  email: 'owner@example.test',
  phoneNumber: null,
  profileImage: null,
  isVerified: false,
  createdAt,
  reviewsReceived: [],
};
const applicant = {
  id: applicantId,
  fullName: 'Test Applicant',
  email: 'applicant@example.test',
  phoneNumber: null,
  profileImage: null,
  isVerified: false,
  createdAt,
  reviewsReceived: [],
};
const ownerApplication = {
  id: 'owner-application',
  pet: {
    id: 'owner-pet',
    name: 'Owner Pet',
    type: 'Dog',
    status: 'AVAILABLE',
    ownerId,
  },
  applicant,
  readinessForm: {},
  status: 'PENDING',
  createdAt,
  updatedAt: createdAt,
};
const applicantApplication = {
  id: 'applicant-application',
  pet: {
    id: 'applicant-pet',
    name: 'Applicant Pet',
    breed: null,
    type: 'Cat',
    status: 'AVAILABLE',
    images: [],
    owner,
  },
  status: 'PENDING',
  createdAt,
  updatedAt: createdAt,
};
const petUpdate = {
  id: 'pet-update',
  description: null,
  images: ['/uploads/updates/one.png', '/uploads/updates/two.png', '/uploads/updates/three.png'],
  createdAt,
  pet: {
    id: 'updated-pet',
    name: 'Updated Pet',
    status: 'ADOPTED',
    applications: [],
  },
};

let server;
let baseUrl;

before(async () => {
  const prisma = {
    user: {
      findUnique: async ({ where }) => ({ id: where.id }),
    },
    application: {
      findMany: async ({ where }) => {
        if (where.applicantId) {
          return where.applicantId === applicantId ? [applicantApplication] : [];
        }
        return where.pet?.ownerId === ownerId ? [ownerApplication] : [];
      },
    },
    petUpdate: {
      findMany: async ({ where }) => (
        where.pet?.ownerId === ownerId ? [petUpdate] : []
      ),
    },
  };
  const app = express();
  app.use('/api/v1/notifications', createNotificationsRouter(prisma));
  app.use((error, _request, response, _next) => {
    response.status(error.statusCode || 500).json({ message: error.message });
  });
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api/v1/notifications`;
});

after(async () => {
  if (server) {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

async function getNotifications(userId) {
  const token = jwt.sign({ id: userId }, process.env.JWT_SECRET);
  const response = await fetch(baseUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return { response, body: await response.json() };
}

describe('GET /api/v1/notifications', () => {
  it('does not invent missing application or pet-update profile data', async () => {
    const { response, body } = await getNotifications(ownerId);

    assert.equal(response.status, 200);
    const application = body.data.find((item) => item.type === 'application');
    assert.equal(application.housing, 'ไม่ระบุ');
    assert.equal(application.experience, 'ไม่ระบุ');
    assert.equal(application.income, 'ไม่ระบุ');
    assert.equal(application.householdMembers, null);

    const update = body.data.find((item) => item.type === 'update');
    assert.equal(update.applicantId, null);
    assert.equal(update.applicantName, 'ไม่พบข้อมูลผู้รับเลี้ยง');
    assert.equal(update.isVerified, null);
    assert.equal(update.joinDate, null);
    assert.equal(update.housing, null);
    assert.equal(update.experience, null);
    assert.equal(update.income, null);
    assert.equal(update.householdMembers, null);
    assert.equal(update.updateDetails.description, 'ไม่มีรายละเอียดเพิ่มเติม');
    assert.deepEqual(update.updateDetails.images, petUpdate.images);
  });

  it('preserves actual owner identity and verification data in application results', async () => {
    const { response, body } = await getNotifications(applicantId);

    assert.equal(response.status, 200);
    const result = body.data.find((item) => item.type === 'application_result');
    assert.equal(result.applicantId, ownerId);
    assert.equal(result.applicantName, owner.fullName);
    assert.equal(result.isVerified, false);
    assert.equal(result.joinDate, 'สมัครเมื่อ มี.ค. 2024');
    assert.equal(result.housing, null);
    assert.equal(result.experience, null);
    assert.equal(result.income, null);
    assert.equal(result.householdMembers, null);
  });
});

describe('GET /api/v1/notifications/events', () => {
  it('delivers changes only to connections belonging to that user', () => {
    const ownerResponse = Object.assign(new EventEmitter(), {
      destroyed: false,
      writableEnded: false,
      writes: [],
    });
    const applicantResponse = Object.assign(new EventEmitter(), {
      destroyed: false,
      writableEnded: false,
      writes: [],
    });
    ownerResponse.write = (event) => ownerResponse.writes.push(event);
    applicantResponse.write = (event) => applicantResponse.writes.push(event);

    subscribeToNotificationChanges(ownerId, ownerResponse);
    subscribeToNotificationChanges(applicantId, applicantResponse);
    publishNotificationChanged(applicantId);

    assert.deepEqual(ownerResponse.writes, []);
    assert.deepEqual(applicantResponse.writes, ['event: notifications-changed\ndata: {}\n\n']);
    ownerResponse.emit('close');
    applicantResponse.emit('close');
  });

  it('streams notification changes to authenticated subscribers', async () => {
    const token = jwt.sign({ id: ownerId }, process.env.JWT_SECRET);
    const response = await fetch(`${baseUrl}/events`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/event-stream/);
    const reader = response.body.getReader();
    try {
      await reader.read();
      publishNotificationChanged(applicantId);
      publishNotificationChanged(ownerId);
      const { value } = await reader.read();
      assert.match(new TextDecoder().decode(value), /event: notifications-changed/);
    } finally {
      await reader.cancel();
    }
  });
});
