require('dotenv').config();

const assert = require('node:assert/strict');
const { after, before, describe, it } = require('node:test');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
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
const uploadedTestFiles = new Set();

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

async function createTestUser(id, name) {
  await pool.query(
    `INSERT INTO users (id, email, password_hash, full_name, updated_at)
     VALUES ($1, $2, $3, $4, NOW())`,
    [id, `${id}@api-test.invalid`, 'not-used-by-api-tests', name],
  );
}

async function createUpdateForm({
  period = '1m',
  description = 'API test update',
  imageCount = 3,
  imageType = 'image/png',
  imageSize = 18,
} = {}) {
  const form = new FormData();
  form.set('period', period);
  form.set('description', description);
  for (let index = 0; index < imageCount; index += 1) {
    form.append(
      'images',
      new Blob([new Uint8Array(imageSize)], { type: imageType }),
      `api-test-${index}.png`,
    );
  }
  return form;
}

async function trackUpdateUploads(run) {
  const uploadDirectory = path.resolve(__dirname, '..', 'uploads', 'updates');
  const filesBefore = new Set(await fs.readdir(uploadDirectory));
  try {
    return await run();
  } finally {
    const filesAfter = await fs.readdir(uploadDirectory);
    for (const filename of filesAfter) {
      if (!filesBefore.has(filename)) uploadedTestFiles.add(filename);
    }
  }
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
    const cleanupErrors = [];
    try {
      const { rows } = await pool.query(
        'SELECT images FROM pet_updates WHERE pet_id = ANY($1::text[])',
        [[fixture.adoptedPetId]],
      );
      const uploadDirectory = path.resolve(__dirname, '..', 'uploads', 'updates');
      const filenames = new Set(uploadedTestFiles);
      for (const row of rows) {
        for (const imageUrl of row.images) {
          const filename = path.basename(imageUrl);
          if (imageUrl.startsWith('/uploads/updates/') && filename === imageUrl.slice('/uploads/updates/'.length)) {
            filenames.add(filename);
          }
        }
      }
      for (const filename of filenames) {
        try {
          await fs.unlink(path.join(uploadDirectory, filename));
        } catch (error) {
          if (error.code !== 'ENOENT') cleanupErrors.push(error);
        }
      }
    } catch (error) {
      cleanupErrors.push(error);
    } finally {
      try {
        await pool.query('DELETE FROM users WHERE id = ANY($1::text[])', [[ownerId, applicantId]]);
      } catch (error) {
        cleanupErrors.push(error);
      }
      try {
        await pool.end();
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    if (cleanupErrors.length) {
      throw new AggregateError(cleanupErrors, 'Failed to clean up API test fixtures');
    }
    console.log('Cleaned up API test users and related records.');
  });

  describe('Pets', () => {
    it('GET /pets rejects an invalid status filter', async () => {
      await expectApiError('/pets?status=unknown', { status: 400, code: 'INVALID_STATUS' });
    });

    it('GET /pets rejects repeated status query parameters', async () => {
      await expectApiError('/pets?status=available&status=adopted', {
        status: 400,
        code: 'INVALID_STATUS',
      });
    });

    it('GET /pets clamps page and limit to supported bounds', async () => {
      const { response, body } = await request('/pets?page=0&limit=100');

      assert.equal(response.status, 200);
      assert.equal(body.data.page, 1);
      assert.equal(body.data.limit, 50);
    });

    it('GET /pets returns an empty result for unmatched filters', async () => {
      const query = new URLSearchParams({ breed: `missing-${randomUUID()}`, location: fixture.location });
      const { response, body } = await request(`/pets?${query}`);

      assert.equal(response.status, 200);
      assert.deepEqual(body.data.pets, []);
      assert.equal(body.data.total, 0);
    });

    it('POST /pets requires authentication', async () => {
      await expectApiError('/pets', {
        status: 401,
        code: 'UNAUTHORIZED',
        method: 'POST',
        body: JSON.stringify({ name: 'Test pet', type: 'Dog', location: fixture.location }),
      });
    });

    it('POST /pets rejects malformed JSON', async () => {
      await expectApiError('/pets', {
        status: 400,
        code: 'BAD_REQUEST',
        method: 'POST',
        token: fixture.ownerToken,
        headers: { 'Content-Type': 'application/json' },
        body: '{"name":',
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

    it('POST /pets rejects an unsupported type', async () => {
      await expectApiError('/pets', {
        status: 400,
        code: 'INVALID_TYPE',
        method: 'POST',
        token: fixture.ownerToken,
        body: JSON.stringify({ name: 'Valid name', type: 'Rabbit', location: fixture.location }),
      });
    });

    it('POST /pets rejects a blank location', async () => {
      await expectApiError('/pets', {
        status: 400,
        code: 'INVALID_LOCATION',
        method: 'POST',
        token: fixture.ownerToken,
        body: JSON.stringify({ name: 'Valid name', type: 'Dog', location: '   ' }),
      });
    });

    it('POST /pets rejects malformed health history JSON', async () => {
      await expectApiError('/pets', {
        status: 400,
        code: 'INVALID_HEALTH_HISTORY',
        method: 'POST',
        token: fixture.ownerToken,
        body: JSON.stringify({
          name: 'Valid name',
          type: 'Dog',
          location: fixture.location,
          health_history: '{invalid',
        }),
      });
    });

    it('POST /pets rejects health history values that are not objects', async () => {
      await expectApiError('/pets', {
        status: 400,
        code: 'INVALID_HEALTH_HISTORY',
        method: 'POST',
        token: fixture.ownerToken,
        body: JSON.stringify({
          name: 'Valid name',
          type: 'Dog',
          location: fixture.location,
          health_history: ['not', 'an', 'object'],
        }),
      });
    });

    it('POST /pets creates a pet', async () => {
      const createdName = `  Created pet ${randomUUID()}  `;
      const { response, body } = await request('/pets', {
        method: 'POST',
        token: fixture.ownerToken,
        body: JSON.stringify({
          name: createdName,
          type: 'Dog',
          breed: 'Mixed',
          location: `  ${fixture.location}  `,
          conditions: 'API test only',
          health_history: { vaccinated: true },
        }),
      });

      assert.equal(response.status, 201);
      assert.equal(body.success, true);
      assert.equal(body.data.status, 'available');
      assert.ok(body.data.pet_id);
      const { rows } = await pool.query('SELECT name, location FROM pets WHERE id = $1', [body.data.pet_id]);
      assert.equal(rows[0].name, createdName.trim());
      assert.equal(rows[0].location, fixture.location);
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

    it('PATCH /pets/:pet_id/status returns 404 for an unknown pet', async () => {
      await expectApiError(`/pets/${randomUUID()}/status`, {
        status: 404,
        code: 'PET_NOT_FOUND',
        method: 'PATCH',
        token: fixture.ownerToken,
        body: JSON.stringify({ status: 'adopted' }),
      });
    });

    it('PATCH /pets/:pet_id/status requires a status value', async () => {
      await expectApiError(`/pets/${fixture.petId}/status`, {
        status: 400,
        code: 'INVALID_STATUS',
        method: 'PATCH',
        token: fixture.ownerToken,
        body: JSON.stringify({}),
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
    it('POST /pets/:pet_id/applications requires authentication', async () => {
      await expectApiError(`/pets/${fixture.applicationPetId}/applications`, {
        status: 401,
        code: 'UNAUTHORIZED',
        method: 'POST',
        body: JSON.stringify({}),
      });
    });

    it('POST /pets/:pet_id/applications rejects missing readiness fields', async () => {
      await expectApiError(`/pets/${fixture.applicationPetId}/applications`, {
        status: 400,
        code: 'INVALID_APPLICATION',
        method: 'POST',
        token: fixture.applicantToken,
        body: JSON.stringify({ housing_type: 'House' }),
      });
    });

    it('POST /pets/:pet_id/applications rejects whitespace-only readiness fields', async () => {
      await expectApiError(`/pets/${fixture.applicationPetId}/applications`, {
        status: 400,
        code: 'INVALID_APPLICATION',
        method: 'POST',
        token: fixture.applicantToken,
        body: JSON.stringify({
          housing_type: '   ',
          income_range: '30,000 - 50,000 THB',
          experience: 'Have owned pets',
        }),
      });
    });

    it('POST /pets/:pet_id/applications rejects a non-string note', async () => {
      await expectApiError(`/pets/${fixture.applicationPetId}/applications`, {
        status: 400,
        code: 'INVALID_APPLICATION',
        method: 'POST',
        token: fixture.applicantToken,
        body: JSON.stringify({
          housing_type: 'House',
          income_range: '30,000 - 50,000 THB',
          experience: 'Have owned pets',
          note: 123,
        }),
      });
    });

    it('POST /pets/:pet_id/applications returns 404 for an unknown pet', async () => {
      await expectApiError(`/pets/${randomUUID()}/applications`, {
        status: 404,
        code: 'PET_NOT_FOUND',
        method: 'POST',
        token: fixture.applicantToken,
        body: JSON.stringify({
          housing_type: 'House',
          income_range: '30,000 - 50,000 THB',
          experience: 'Have owned pets',
        }),
      });
    });

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

    it('POST /pets/:pet_id/applications rejects a duplicate application', async () => {
      await expectApiError(`/pets/${fixture.applicationPetId}/applications`, {
        status: 400,
        code: 'APPLICATION_ALREADY_SUBMITTED',
        method: 'POST',
        token: fixture.applicantToken,
        body: JSON.stringify({
          housing_type: 'House with yard',
          income_range: '30,000 - 50,000 THB',
          experience: 'Have owned dogs before',
        }),
      });
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

    it('GET /pets/:pet_id/applications rejects non-owners', async () => {
      await expectApiError(`/pets/${fixture.applicationPetId}/applications`, {
        status: 403,
        code: 'FORBIDDEN',
        token: fixture.applicantToken,
      });
    });

    it('GET /pets/:pet_id/applications returns 404 for an unknown pet', async () => {
      await expectApiError(`/pets/${randomUUID()}/applications`, {
        status: 404,
        code: 'PET_NOT_FOUND',
        token: fixture.ownerToken,
      });
    });
  });

  describe('Wishlists', () => {
    it('GET /wishlists requires authentication', async () => {
      await expectApiError('/wishlists', { status: 401, code: 'UNAUTHORIZED' });
    });

    it('POST /wishlists rejects a missing pet ID', async () => {
      await expectApiError('/wishlists', {
        status: 400,
        code: 'INVALID_PET_ID',
        method: 'POST',
        token: fixture.applicantToken,
        body: JSON.stringify({}),
      });
    });

    it('POST /wishlists returns 404 for an unknown pet', async () => {
      await expectApiError('/wishlists', {
        status: 404,
        code: 'PET_NOT_FOUND',
        method: 'POST',
        token: fixture.applicantToken,
        body: JSON.stringify({ pet_id: randomUUID() }),
      });
    });

    it('POST /wishlists adds a pet to the user wishlist', async () => {
      const { response, body } = await request('/wishlists', {
        method: 'POST',
        token: fixture.applicantToken,
        body: JSON.stringify({ pet_id: fixture.petId }),
      });

      assert.equal(response.status, 201);
      assert.equal(body.success, true);
    });

    it('POST /wishlists returns the documented duplicate error', async () => {
      await expectApiError('/wishlists', {
        status: 409,
        code: 'WISHLIST_ITEM_EXISTS',
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

    it('GET /wishlists does not expose another user wishlist', async () => {
      const { response, body } = await request('/wishlists', { token: fixture.ownerToken });

      assert.equal(response.status, 200);
      assert.equal(body.success, true);
      assert.ok(Array.isArray(body.data));
      assert.ok(!body.data.some((pet) => pet.id === fixture.petId));
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
      await expectApiError(`/wishlists/${fixture.petId}`, {
        status: 404,
        code: 'WISHLIST_ITEM_NOT_FOUND',
        method: 'DELETE',
        token: fixture.applicantToken,
      });
    });

    it('DELETE /wishlists/:pet_id requires authentication', async () => {
      await expectApiError(`/wishlists/${fixture.petId}`, {
        status: 401,
        code: 'UNAUTHORIZED',
        method: 'DELETE',
      });
    });
  });

  describe('Pet Updates', () => {
    it('GET /pets/:pet_id/updates returns 404 for an unknown pet', async () => {
      await expectApiError(`/pets/${randomUUID()}/updates`, {
        status: 404,
        code: 'PET_NOT_FOUND',
      });
    });

    it('GET /pets/:pet_id/updates returns the update timeline', async () => {
      const { response, body } = await request(`/pets/${fixture.adoptedPetId}/updates`);

      assert.equal(response.status, 200);
      assert.equal(body.success, true);
      assert.ok(Array.isArray(body.data));
    });

    it('POST /pets/:pet_id/updates requires authentication', async () => {
      await expectApiError(`/pets/${fixture.adoptedPetId}/updates`, {
        status: 401,
        code: 'UNAUTHORIZED',
        method: 'POST',
        body: await createUpdateForm(),
      });
    });

    it('POST /pets/:pet_id/updates rejects an unsupported period', async () => {
      const form = await createUpdateForm({ period: '2m', imageCount: 0 });
      await expectApiError(`/pets/${fixture.adoptedPetId}/updates`, {
        status: 400,
        code: 'INVALID_PERIOD',
        method: 'POST',
        token: fixture.applicantToken,
        body: form,
      });
    });

    it('POST /pets/:pet_id/updates rejects a blank description', async () => {
      const form = await createUpdateForm({ description: '   ', imageCount: 0 });
      await expectApiError(`/pets/${fixture.adoptedPetId}/updates`, {
        status: 400,
        code: 'INVALID_DESCRIPTION',
        method: 'POST',
        token: fixture.applicantToken,
        body: form,
      });
    });

    it('POST /pets/:pet_id/updates rejects an update without the required images', async () => {
      const form = await createUpdateForm({ imageCount: 2 });
      await expectApiError(`/pets/${fixture.adoptedPetId}/updates`, {
        status: 400,
        code: 'INVALID_IMAGES',
        method: 'POST',
        token: fixture.applicantToken,
        body: form,
      });
    });

    it('POST /pets/:pet_id/updates rejects unsupported image types', async () => {
      const form = await createUpdateForm({ imageType: 'text/plain' });
      await expectApiError(`/pets/${fixture.adoptedPetId}/updates`, {
        status: 400,
        code: 'INVALID_IMAGES',
        method: 'POST',
        token: fixture.applicantToken,
        body: form,
      });
    });

    it('POST /pets/:pet_id/updates returns 404 for an unknown pet', async () => {
      const form = await createUpdateForm();
      await trackUpdateUploads(async () => {
        await expectApiError(`/pets/${randomUUID()}/updates`, {
          status: 404,
          code: 'PET_NOT_FOUND',
          method: 'POST',
          token: fixture.applicantToken,
          body: form,
        });
      });
    });

    it('POST /pets/:pet_id/updates rejects more than five images', async () => {
      const form = await createUpdateForm({ imageCount: 6 });
      await trackUpdateUploads(async () => {
        const { response, body } = await request(`/pets/${fixture.adoptedPetId}/updates`, {
          method: 'POST',
          token: fixture.applicantToken,
          body: form,
        });

        assert.equal(response.status, 400);
        assert.equal(body.success, false);
        assert.equal(body.error.code, 'INVALID_IMAGES');
      });
    });

    it('POST /pets/:pet_id/updates rejects an image larger than five megabytes', async () => {
      const form = await createUpdateForm({ imageCount: 1, imageSize: 5 * 1024 * 1024 + 1 });
      await trackUpdateUploads(async () => {
        await expectApiError(`/pets/${fixture.adoptedPetId}/updates`, {
          status: 400,
          code: 'LIMIT_FILE_SIZE',
          method: 'POST',
          token: fixture.applicantToken,
          body: form,
        });
      });
    });

    it('POST /pets/:pet_id/updates rejects updates for pets that are not adopted', async () => {
      const form = await createUpdateForm();
      await trackUpdateUploads(async () => {
        await expectApiError(`/pets/${fixture.petId}/updates`, {
          status: 400,
          code: 'PET_NOT_ADOPTED',
          method: 'POST',
          token: fixture.applicantToken,
          body: form,
        });
      });
    });

    it('POST /pets/:pet_id/updates rejects a user who is not the approved adopter', async () => {
      const form = await createUpdateForm();
      await trackUpdateUploads(async () => {
        await expectApiError(`/pets/${fixture.adoptedPetId}/updates`, {
          status: 403,
          code: 'FORBIDDEN',
          method: 'POST',
          token: fixture.ownerToken,
          body: form,
        });
      });
    });

    it('POST /pets/:pet_id/updates accepts all documented periods for the approved adopter', async () => {
      for (const period of ['1m', '3m', '6m', '1y']) {
        const form = await createUpdateForm({ period });
        await trackUpdateUploads(async () => {
          const { response, body } = await request(`/pets/${fixture.adoptedPetId}/updates`, {
            method: 'POST',
            token: fixture.applicantToken,
            body: form,
          });

          assert.equal(response.status, 201);
          assert.equal(body.success, true);
          assert.ok(body.data.update_id);
          assert.ok(body.data.created_at);
        });
      }
    });

    it('GET /pets/:pet_id/updates includes created updates in newest-first order', async () => {
      const { response, body } = await request(`/pets/${fixture.adoptedPetId}/updates`);

      assert.equal(response.status, 200);
      assert.equal(body.success, true);
      assert.deepEqual(
        body.data.map((update) => update.period).sort(),
        ['1m', '1y', '3m', '6m'].sort(),
      );
      assert.ok(body.data.every((update, index) => (
        index === 0
        || new Date(body.data[index - 1].created_at) >= new Date(update.created_at)
      )));
      assert.ok(body.data.every((update) => update.images.length === 3));
    });
  });

  describe('Messaging', () => {
    it('POST /chats/messages requires authentication', async () => {
      await expectApiError('/chats/messages', {
        status: 401,
        code: 'UNAUTHORIZED',
        method: 'POST',
        body: JSON.stringify({ receiver_id: ownerId, message: 'Hello' }),
      });
    });

    it('POST /chats/messages requires a receiver', async () => {
      await expectApiError('/chats/messages', {
        status: 400,
        code: 'INVALID_RECEIVER',
        method: 'POST',
        token: fixture.applicantToken,
        body: JSON.stringify({ message: 'Hello' }),
      });
    });

    it('POST /chats/messages rejects a blank message', async () => {
      await expectApiError('/chats/messages', {
        status: 400,
        code: 'INVALID_MESSAGE',
        method: 'POST',
        token: fixture.applicantToken,
        body: JSON.stringify({ receiver_id: ownerId, message: '   ' }),
      });
    });

    it('POST /chats/messages rejects sending a message to yourself', async () => {
      await expectApiError('/chats/messages', {
        status: 400,
        code: 'INVALID_RECEIVER',
        method: 'POST',
        token: fixture.applicantToken,
        body: JSON.stringify({ receiver_id: applicantId, message: 'Hello' }),
      });
    });

    it('POST /chats/messages returns 404 for an unknown recipient', async () => {
      await expectApiError('/chats/messages', {
        status: 404,
        code: 'USER_NOT_FOUND',
        method: 'POST',
        token: fixture.applicantToken,
        body: JSON.stringify({ receiver_id: randomUUID(), message: 'Hello' }),
      });
    });

    it('POST /chats/messages sends a message', async () => {
      const { response, body } = await request('/chats/messages', {
        method: 'POST',
        token: fixture.applicantToken,
        body: JSON.stringify({
          receiver_id: ownerId,
          message: '  Is this pet still available?  ',
        }),
      });

      assert.equal(response.status, 201);
      assert.equal(body.success, true);
      assert.ok(body.data.message_id);
      assert.ok(body.data.sent_at);
      const { rows } = await pool.query('SELECT content FROM messages WHERE id = $1', [body.data.message_id]);
      assert.equal(rows[0].content, 'Is this pet still available?');
    });
  });

  describe('Reviews', () => {
    it('POST /reviews requires authentication', async () => {
      await expectApiError('/reviews', {
        status: 401,
        code: 'UNAUTHORIZED',
        method: 'POST',
        body: JSON.stringify({ target_user_id: ownerId, rating: 5 }),
      });
    });

    it('POST /reviews requires a target user', async () => {
      await expectApiError('/reviews', {
        status: 400,
        code: 'INVALID_TARGET_USER',
        method: 'POST',
        token: fixture.applicantToken,
        body: JSON.stringify({ rating: 5 }),
      });
    });

    it('POST /reviews rejects a rating outside the documented range', async () => {
      await expectApiError('/reviews', {
        status: 400,
        code: 'INVALID_RATING',
        method: 'POST',
        token: fixture.applicantToken,
        body: JSON.stringify({ target_user_id: ownerId, rating: 6, comment: 'Invalid rating' }),
      });
    });

    it('POST /reviews rejects a rating below the documented range', async () => {
      await expectApiError('/reviews', {
        status: 400,
        code: 'INVALID_RATING',
        method: 'POST',
        token: fixture.applicantToken,
        body: JSON.stringify({ target_user_id: ownerId, rating: 0 }),
      });
    });

    it('POST /reviews rejects fractional ratings', async () => {
      await expectApiError('/reviews', {
        status: 400,
        code: 'INVALID_RATING',
        method: 'POST',
        token: fixture.applicantToken,
        body: JSON.stringify({ target_user_id: ownerId, rating: 4.5 }),
      });
    });

    it('POST /reviews rejects a non-string comment', async () => {
      await expectApiError('/reviews', {
        status: 400,
        code: 'INVALID_COMMENT',
        method: 'POST',
        token: fixture.applicantToken,
        body: JSON.stringify({ target_user_id: ownerId, rating: 5, comment: 123 }),
      });
    });

    it('POST /reviews rejects reviewing yourself', async () => {
      await expectApiError('/reviews', {
        status: 400,
        code: 'INVALID_TARGET_USER',
        method: 'POST',
        token: fixture.applicantToken,
        body: JSON.stringify({ target_user_id: applicantId, rating: 5 }),
      });
    });

    it('POST /reviews returns 404 for an unknown target user', async () => {
      await expectApiError('/reviews', {
        status: 404,
        code: 'USER_NOT_FOUND',
        method: 'POST',
        token: fixture.applicantToken,
        body: JSON.stringify({ target_user_id: randomUUID(), rating: 5 }),
      });
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

    it('POST /reviews accepts the lowest valid rating', async () => {
      const { response, body } = await request('/reviews', {
        method: 'POST',
        token: fixture.applicantToken,
        body: JSON.stringify({ target_user_id: ownerId, rating: 1 }),
      });

      assert.equal(response.status, 201);
      assert.equal(body.success, true);
      const { rows } = await pool.query('SELECT rating, comment FROM reviews WHERE id = $1', [body.data.review_id]);
      assert.equal(rows[0].rating, 1);
      assert.equal(rows[0].comment, null);
    });
  });
});
