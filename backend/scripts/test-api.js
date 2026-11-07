require('dotenv').config();

const assert = require('node:assert/strict');
const { after, before, describe, it } = require('node:test');
const { randomUUID } = require('node:crypto');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

const databaseUrl = process.env.DATABASE_URL;
const jwtSecret = process.env.JWT_SECRET;
const apiBaseUrl = (process.env.API_BASE_URL || 'http://localhost:5000/api/v1').replace(/\/+$/, '');

if (!databaseUrl) throw new Error('DATABASE_URL must be set to create and clean up API test data');
if (!jwtSecret) throw new Error('JWT_SECRET must be set to authenticate API test requests');

const pool = new Pool({ connectionString: databaseUrl });
const ownerId = randomUUID();
const applicantId = randomUUID();
const fixture = {
  petId: randomUUID(),
  applicationPetId: randomUUID(),
  adoptedPetId: randomUUID(),
  petName: `API test pet ${randomUUID()}`,
  location: `API test location ${randomUUID()}`,
  ownerToken: jwt.sign({ id: ownerId }, jwtSecret, { expiresIn: '5m' }),
  applicantToken: jwt.sign({ id: applicantId }, jwtSecret, { expiresIn: '5m' }),
};

async function request(path, { token, ...options } = {}) {
  const headers = new Headers(options.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers,
    signal: AbortSignal.timeout(10000),
  });
  const text = await response.text();
  let body;

  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = text;
  }

  return { response, body };
}

async function expectApiError(path, { status, code, ...options }) {
  const { response, body } = await request(path, options);
  assert.equal(response.status, status);
  assert.equal(body.error.code, code);
}

async function expectErrorStatus(path, status, options) {
  const { response, body } = await request(path, options);
  assert.equal(response.status, status);
  assert.equal(body.success, false);
  assert.ok(body.error && typeof body.error.code === 'string');
}

async function createTestUser(id, name) {
  await pool.query(
    `INSERT INTO users (id, email, password_hash, full_name, updated_at)
     VALUES ($1, $2, $3, $4, NOW())`,
    [id, `${id}@api-test.invalid`, 'not-used-by-api-tests', name],
  );
}

describe('Pet adoption API', () => {
  before(async () => {
    await createTestUser(ownerId, 'API Test Owner');
    await createTestUser(applicantId, 'API Test Applicant');

    await pool.query(
      `INSERT INTO pets (id, owner_id, name, type, breed, location, updated_at)
       VALUES ($1, $2, $3, 'Dog', 'Mixed', $4, NOW()),
              ($5, $2, $6, 'Dog', 'Mixed', $4, NOW()),
              ($7, $2, $8, 'Cat', 'Mixed', $4, NOW())`,
      [
        fixture.petId,
        ownerId,
        fixture.petName,
        fixture.location,
        fixture.applicationPetId,
        `Application ${fixture.petName}`,
        fixture.adoptedPetId,
        `Adopted ${fixture.petName}`,
      ],
    );
    await pool.query(
      `UPDATE pets SET status = 'ADOPTED' WHERE id = $1`,
      [fixture.adoptedPetId],
    );
    await pool.query(
      `INSERT INTO applications (id, pet_id, applicant_id, readiness_form, status, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, 'APPROVED', NOW())`,
      [randomUUID(), fixture.adoptedPetId, applicantId, JSON.stringify({
        housing_type: 'House with yard',
        income_range: '30,000 - 50,000 THB',
        experience: 'API test fixture',
      })],
    );
  });

  after(async () => {
    try {
      await pool.query('DELETE FROM users WHERE id = ANY($1::text[])', [[ownerId, applicantId]]);
      console.log('Cleaned up API test users and related records.');
    } finally {
      await pool.end();
    }
  });

  describe('Pets', () => {
    it('GET /pets rejects an invalid status filter', async () => {
      await expectApiError('/pets?status=unknown', { status: 400, code: 'INVALID_STATUS' });
    });

    it('POST /pets requires authentication', async () => {
      await expectApiError('/pets', {
        status: 401,
        code: 'UNAUTHORIZED',
        method: 'POST',
        body: JSON.stringify({ name: 'Test pet', type: 'Dog', location: fixture.location }),
      });
    });

    it('POST /pets validates required fields', async () => {
      await expectApiError('/pets', {
        status: 400,
        code: 'INVALID_NAME',
        method: 'POST',
        token: fixture.ownerToken,
        body: JSON.stringify({ name: 'X', type: 'Dog', location: fixture.location }),
      });
    });

    it('POST /pets creates a pet', async () => {
      const { response, body } = await request('/pets', {
        method: 'POST',
        token: fixture.ownerToken,
        body: JSON.stringify({
          name: `Created pet ${randomUUID()}`,
          type: 'Dog',
          breed: 'Mixed',
          location: fixture.location,
          conditions: 'API test only',
          health_history: { vaccinated: true },
        }),
      });

      assert.equal(response.status, 201);
      assert.equal(body.success, true);
      assert.equal(body.data.status, 'available');
      assert.ok(body.data.pet_id);
    });

    it('GET /pets lists matching pets with pagination', async () => {
      const query = new URLSearchParams({ type: 'Dog', location: fixture.location, page: '1', limit: '5' });
      const { response, body } = await request(`/pets?${query}`);

      assert.equal(response.status, 200);
      assert.equal(body.success, true);
      assert.ok(body.data.pets.some((pet) => pet.id === fixture.petId));
      assert.ok(body.data.total >= 1);
      assert.equal(body.data.page, 1);
      assert.equal(body.data.limit, 5);
    });

    it('GET /pets/:pet_id returns the pet and owner', async () => {
      const { response, body } = await request(`/pets/${fixture.petId}`);

      assert.equal(response.status, 200);
      assert.equal(body.success, true);
      assert.equal(body.data.id, fixture.petId);
      assert.equal(body.data.name, fixture.petName);
      assert.equal(body.data.owner.id, ownerId);
    });

    it('GET /pets/:pet_id returns 404 for an unknown pet', async () => {
      await expectApiError(`/pets/${randomUUID()}`, { status: 404, code: 'PET_NOT_FOUND' });
    });

    it('PATCH /pets/:pet_id/status requires authentication', async () => {
      await expectApiError(`/pets/${fixture.petId}/status`, {
        status: 401,
        code: 'UNAUTHORIZED',
        method: 'PATCH',
        body: JSON.stringify({ status: 'adopted' }),
      });
    });

    it('PATCH /pets/:pet_id/status rejects non-owners', async () => {
      await expectApiError(`/pets/${fixture.petId}/status`, {
        status: 403,
        code: 'FORBIDDEN',
        method: 'PATCH',
        token: fixture.applicantToken,
        body: JSON.stringify({ status: 'adopted' }),
      });
    });

    it('PATCH /pets/:pet_id/status validates the requested status', async () => {
      await expectApiError(`/pets/${fixture.petId}/status`, {
        status: 400,
        code: 'INVALID_STATUS',
        method: 'PATCH',
        token: fixture.ownerToken,
        body: JSON.stringify({ status: 'pending' }),
      });
    });

    it('PATCH /pets/:pet_id/status updates the pet for its owner', async () => {
      const { response, body } = await request(`/pets/${fixture.petId}/status`, {
        method: 'PATCH',
        token: fixture.ownerToken,
        body: JSON.stringify({ status: 'adopted' }),
      });

      assert.equal(response.status, 200);
      assert.equal(body.success, true);
      assert.equal(body.data.pet_id, fixture.petId);
      assert.equal(body.data.updated_status, 'adopted');
    });

    it('GET /pets filters by the updated status', async () => {
      const query = new URLSearchParams({ status: 'adopted', location: fixture.location });
      const { response, body } = await request(`/pets?${query}`);

      assert.equal(response.status, 200);
      assert.ok(body.data.pets.some((pet) => pet.id === fixture.petId && pet.status === 'adopted'));
    });
  });

  describe('Adoption Applications', () => {
    it('POST /pets/:pet_id/applications submits an application', async () => {
      const { response, body } = await request(`/pets/${fixture.applicationPetId}/applications`, {
        method: 'POST',
        token: fixture.applicantToken,
        body: JSON.stringify({
          housing_type: 'House with yard',
          income_range: '30,000 - 50,000 THB',
          experience: 'Have owned dogs before',
          note: 'API test application',
        }),
      });

      assert.equal(response.status, 201);
      assert.equal(body.success, true);
      assert.ok(body.data.application_id);
      assert.ok(body.data.submitted_at);
    });

    it('GET /pets/:pet_id/applications lists applications for the pet owner', async () => {
      const { response, body } = await request(`/pets/${fixture.applicationPetId}/applications`, {
        token: fixture.ownerToken,
      });

      assert.equal(response.status, 200);
      assert.equal(body.success, true);
      assert.ok(Array.isArray(body.data));
      assert.ok(body.data.some((application) => (
        application.pet_id === fixture.applicationPetId
        && application.applicant.id === applicantId
        && application.housing_type === 'House with yard'
      )));
    });
  });

  describe('Wishlists', () => {
    it('POST /wishlists adds a pet to the user wishlist', async () => {
      const { response, body } = await request('/wishlists', {
        method: 'POST',
        token: fixture.applicantToken,
        body: JSON.stringify({ pet_id: fixture.petId }),
      });

      assert.equal(response.status, 201);
      assert.equal(body.success, true);
    });

    it('POST /wishlists rejects a duplicate pet', async () => {
      await expectErrorStatus('/wishlists', 409, {
        method: 'POST',
        token: fixture.applicantToken,
        body: JSON.stringify({ pet_id: fixture.petId }),
      });
    });

    it('GET /wishlists lists the current user wishlist', async () => {
      const { response, body } = await request('/wishlists', { token: fixture.applicantToken });

      assert.equal(response.status, 200);
      assert.equal(body.success, true);
      assert.ok(Array.isArray(body.data));
      assert.ok(body.data.some((pet) => pet.id === fixture.petId));
    });

    it('DELETE /wishlists/:pet_id removes the pet from the wishlist', async () => {
      const { response, body } = await request(`/wishlists/${fixture.petId}`, {
        method: 'DELETE',
        token: fixture.applicantToken,
      });

      assert.equal(response.status, 200);
      assert.equal(body.success, true);
    });

    it('DELETE /wishlists/:pet_id returns 404 when the pet is not listed', async () => {
      await expectErrorStatus(`/wishlists/${fixture.petId}`, 404, {
        method: 'DELETE',
        token: fixture.applicantToken,
      });
    });
  });

  describe('Pet Updates', () => {
    it('GET /pets/:pet_id/updates returns the update timeline', async () => {
      const { response, body } = await request(`/pets/${fixture.adoptedPetId}/updates`);

      assert.equal(response.status, 200);
      assert.equal(body.success, true);
      assert.ok(Array.isArray(body.data));
    });

    it('POST /pets/:pet_id/updates rejects an update without the required images', async () => {
      const form = new FormData();
      form.set('period', '1m');
      form.set('description', 'API test update');
      const { response, body } = await request(`/pets/${fixture.adoptedPetId}/updates`, {
        method: 'POST',
        token: fixture.applicantToken,
        body: form,
      });

      assert.equal(response.status, 400);
      assert.equal(body.success, false);
    });
  });

  describe('Messaging', () => {
    it('POST /chats/messages sends a message', async () => {
      const { response, body } = await request('/chats/messages', {
        method: 'POST',
        token: fixture.applicantToken,
        body: JSON.stringify({
          receiver_id: ownerId,
          message: 'Is this pet still available?',
        }),
      });

      assert.equal(response.status, 201);
      assert.equal(body.success, true);
      assert.ok(body.data.message_id);
      assert.ok(body.data.sent_at);
    });
  });

  describe('Reviews', () => {
    it('POST /reviews rejects a rating outside the documented range', async () => {
      const { response, body } = await request('/reviews', {
        method: 'POST',
        token: fixture.applicantToken,
        body: JSON.stringify({ target_user_id: ownerId, rating: 6, comment: 'Invalid rating' }),
      });

      assert.equal(response.status, 400);
      assert.equal(body.success, false);
    });

    it('POST /reviews creates a review', async () => {
      const { response, body } = await request('/reviews', {
        method: 'POST',
        token: fixture.applicantToken,
        body: JSON.stringify({
          target_user_id: ownerId,
          rating: 5,
          comment: 'API test review',
        }),
      });

      assert.equal(response.status, 201);
      assert.equal(body.success, true);
      assert.ok(body.data.review_id);
      assert.ok(body.data.created_at);
    });
  });
});
