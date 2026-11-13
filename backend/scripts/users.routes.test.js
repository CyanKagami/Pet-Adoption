const assert = require('node:assert/strict');
const { after, before, describe, it } = require('node:test');
const express = require('express');
const { createUsersRouter } = require('../src/routes/users.routes');

const userId = 'public-user';
const createdAt = new Date('2024-01-01T10:00:00.000Z');
const adoptedPet = {
  id: 'adopted-pet',
  name: 'Mali',
  type: 'Cat',
  breed: 'Siamese',
  location: 'Bangkok',
  status: 'ADOPTED',
  createdAt,
  images: [{ imageUrl: '/uploads/pets/mali.jpg' }],
};
const reviewDate = new Date('2024-02-01T10:00:00.000Z');

let server;
let baseUrl;
let userExists;
let capturedUserQuery;

before(async () => {
  userExists = true;
  capturedUserQuery = null;
  const prisma = {
    user: {
      findUnique: async (query) => {
        capturedUserQuery = query;
        if (!userExists) return null;
        return {
          id: userId,
          fullName: 'Public User',
          profileImage: '/uploads/avatars/user.jpg',
          isVerified: true,
          createdAt,
          applications: [{ pet: adoptedPet }],
        };
      },
    },
    review: {
      findMany: async () => [{
        id: 'review-1',
        rating: 4,
        comment: 'Great adopter',
        createdAt: reviewDate,
        reviewer: {
          id: 'reviewer-1',
          fullName: 'Reviewer',
          profileImage: null,
        },
      }],
    },
  };
  const app = express();
  app.use('/api/v1/users', createUsersRouter(prisma));
  app.use((error, _request, response, _next) => {
    response.status(error.statusCode || error.status || 500).json({
      success: false,
      error: { code: error.code, message: error.message },
    });
  });
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api/v1/users`;
});

after(async () => {
  if (server) {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

describe('GET /api/v1/users/:userId', () => {
  it('returns public profile data, adopted pets, and received reviews without private account fields', async () => {
    const response = await fetch(`${baseUrl}/${userId}`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.deepEqual(Object.keys(body.data).sort(), [
      'adoptedPets',
      'averageRating',
      'createdAt',
      'fullName',
      'id',
      'isVerified',
      'profileImage',
      'reviews',
      'totalReviews',
    ]);
    assert.equal(body.data.profileImage, '/uploads/avatars/user.jpg');
    assert.equal(body.data.averageRating, 4);
    assert.equal(body.data.totalReviews, 1);
    assert.equal(body.data.adoptedPets[0].status, 'adopted');
    assert.equal(body.data.adoptedPets[0].image, '/uploads/pets/mali.jpg');
    assert.equal(body.data.reviews[0].reviewer.fullName, 'Reviewer');
    assert.equal(capturedUserQuery.select.applications.where.status, 'APPROVED');
    assert.equal(capturedUserQuery.select.applications.where.pet.status, 'ADOPTED');
  });

  it('returns not found for an unknown profile', async () => {
    userExists = false;
    try {
      const response = await fetch(`${baseUrl}/missing-user`);
      const body = await response.json();

      assert.equal(response.status, 404);
      assert.equal(body.success, false);
      assert.equal(body.error.code, 'USER_NOT_FOUND');
    } finally {
      userExists = true;
    }
  });
});
