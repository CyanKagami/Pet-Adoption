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
  applicationId: null,
  adoptedPetId: randomUUID(),
  petName: `API test pet ${randomUUID()}`,
  location: `API test location ${randomUUID()}`,
  ownerToken: jwt.sign({ id: ownerId }, jwtSecret, { expiresIn: '5m' }),
  applicantToken: jwt.sign({ id: applicantId }, jwtSecret, { expiresIn: '5m' }),
};
const uploadDirectories = {
  pets: path.resolve(__dirname, '..', 'uploads', 'pets'),
  updates: path.resolve(__dirname, '..', 'uploads', 'updates'),
};
const uploadedTestFiles = new Map(
  Object.keys(uploadDirectories).map((type) => [type, new Set()]),
);

async function snapshotUploads() {
  const snapshot = new Map();
  for (const [type, directory] of Object.entries(uploadDirectories)) {
    snapshot.set(type, new Set(await fs.readdir(directory)));
  }
  return snapshot;
}

async function trackNewUploads(snapshot) {
  for (const [type, directory] of Object.entries(uploadDirectories)) {
    const filesAfter = await fs.readdir(directory);
    for (const filename of filesAfter) {
      if (!snapshot.get(type).has(filename)) uploadedTestFiles.get(type).add(filename);
    }
  }
}

async function request(path, { token, ...options } = {}) {
  const headers = new Headers(options.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const uploadSnapshot = options.body instanceof FormData ? await snapshotUploads() : null;
  try {
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
  } finally {
    if (uploadSnapshot) await trackNewUploads(uploadSnapshot);
  }
}

async function expectApiError(path, { status, code, ...options }) {
  const { response, body } = await request(path, options);
  assert.equal(response.status, status);
  assert.equal(body.error.code, code);
}

async function countSystemMessages(petId, contentPrefix) {
  const { rows } = await pool.query(
    `SELECT COUNT(*) AS count
       FROM messages
      WHERE pet_id = $1
        AND sender_id = $2
        AND receiver_id = $3
        AND content LIKE $4`,
    [petId, ownerId, applicantId, `${contentPrefix}%`],
  );
  return Number(rows[0].count);
}

async function createTestUser(id, name) {
  await pool.query(
    `INSERT INTO users (id, email, password_hash, full_name, updated_at)
     VALUES ($1, $2, $3, $4, NOW())`,
    [id, `${id}@api-test.invalid`, 'not-used-by-api-tests', name],
  );
}

async function createImageForm(fields, {
  imageCount = 3,
  imageType = 'image/png',
  imageSize = 18,
} = {}) {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.set(name, value);
  for (let index = 0; index < imageCount; index += 1) {
    form.append(
      'images',
      new Blob([new Uint8Array(Array.isArray(imageSize) ? imageSize[index] : imageSize)], { type: imageType }),
      `api-test-${index}.png`,
    );
  }
  return form;
}

function createUpdateForm({
  period = '1m',
  description = 'API test update',
  ...imageOptions
} = {}) {
  return createImageForm({ period, description }, imageOptions);
}

function createPetForm({
  name = 'API image upload test pet',
  type = 'Dog',
  location = fixture.location,
  imageType = 'image/png',
  imageSize = 18,
} = {}) {
  return createImageForm(
    { name, type, location },
    { imageCount: 1, imageType, imageSize },
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
      `UPDATE pets
          SET age_months = 24,
              gender = 'Female',
              description = 'API test description',
              health_info = $2::jsonb,
              adoption_conditions = 'API test conditions'
        WHERE id = $1`,
      [fixture.petId, JSON.stringify({ disease: 'None', vaccinated: true, neutered: false })],
    );
    await pool.query(
      `INSERT INTO applications (id, pet_id, applicant_id, readiness_form, status, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, 'PENDING', NOW())`,
      [randomUUID(), fixture.petId, applicantId, JSON.stringify({
        housing_type: 'House',
        income_range: '30,000 - 50,000 THB',
        experience: 'API test experience',
        note: 'API test application note',
        household_members: 2,
        adoption_reason: 'API test reason',
      })],
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
        `SELECT 'pets' AS upload_type, image_url
           FROM pet_images
          WHERE pet_id IN (SELECT id FROM pets WHERE owner_id = $1)
         UNION ALL
         SELECT 'updates' AS upload_type, update_image.image_url
           FROM pet_updates
           CROSS JOIN LATERAL jsonb_array_elements_text(pet_updates.images) AS update_image(image_url)
          WHERE pet_updates.pet_id = ANY($2::text[])`,
        [ownerId, [fixture.adoptedPetId]],
      );
      for (const row of rows) {
        const prefix = `/uploads/${row.upload_type}/`;
        const filename = path.basename(row.image_url);
        if (row.image_url.startsWith(prefix) && filename === row.image_url.slice(prefix.length)) {
          uploadedTestFiles.get(row.upload_type).add(filename);
        }
      }
    } catch (error) {
      cleanupErrors.push(error);
    }

    for (const [type, filenames] of uploadedTestFiles) {
      for (const filename of filenames) {
        try {
          await fs.unlink(path.join(uploadDirectories[type], filename));
        } catch (error) {
          if (error.code !== 'ENOENT') cleanupErrors.push(error);
        }
      }
    }

    try {
      await pool.query('DELETE FROM users WHERE id = ANY($1::text[])', [[ownerId, applicantId]]);
    } catch (error) {
      cleanupErrors.push(error);
    } finally {
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
        body: JSON.stringify({ name: 'Valid name', type: 'Horse', location: fixture.location }),
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

    it('POST /pets rejects unsupported image types', async () => {
      await expectApiError('/pets', {
        status: 400,
        code: 'INVALID_IMAGES',
        method: 'POST',
        token: fixture.ownerToken,
        body: await createPetForm({ imageType: 'text/plain' }),
      });
    });

    it('POST /pets accepts an image exactly five megabytes in size', async () => {
      const { response, body } = await request('/pets', {
        method: 'POST',
        token: fixture.ownerToken,
        body: await createPetForm({ imageSize: 5 * 1024 * 1024 }),
      });

      assert.equal(response.status, 201);
      const { rows } = await pool.query(
        'SELECT image_url FROM pet_images WHERE pet_id = $1',
        [body.data.pet_id],
      );
      assert.equal(rows.length, 1);
      assert.equal(rows[0].image_url.startsWith('/uploads/pets/'), true);
    });

    it('POST /pets rejects an image larger than five megabytes', async () => {
      await expectApiError('/pets', {
        status: 400,
        code: 'LIMIT_FILE_SIZE',
        method: 'POST',
        token: fixture.ownerToken,
        body: await createPetForm({ imageSize: 5 * 1024 * 1024 + 1 }),
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

    it('POST /pets accepts every frontend pet type and legacy Thai labels', async () => {
      const petTypes = [
        ['Dog', 'Dog'],
        ['Cat', 'Cat'],
        ['Rabbit', 'Rabbit'],
        ['Bird', 'Bird'],
        ['Other', 'Other'],
        ['สุนัข', 'Dog'],
        ['แมว', 'Cat'],
        ['กระต่าย', 'Rabbit'],
        ['นก', 'Bird'],
        ['อื่นๆ', 'Other'],
      ];

      for (const [type, expectedType] of petTypes) {
        const { response, body } = await request('/pets', {
          method: 'POST',
          token: fixture.ownerToken,
          body: JSON.stringify({
            name: `Type test ${randomUUID()}`,
            type,
            location: fixture.location,
          }),
        });

        assert.equal(response.status, 201);
        const { rows } = await pool.query('SELECT type FROM pets WHERE id = $1', [body.data.pet_id]);
        assert.equal(rows[0].type, expectedType);
      }
    });

    it('GET /pets lists matching pets with pagination', async () => {
      const query = new URLSearchParams({ type: 'Dog', location: fixture.location, page: '1', limit: '10' });
      const { response, body } = await request(`/pets?${query}`);

      assert.equal(response.status, 200);
      assert.equal(body.success, true);
      assert.ok(
        body.data.pets.some((pet) => pet.id === fixture.petId),
        `Expected fixture pet in ${JSON.stringify(body.data.pets)}`,
      );
      assert.ok(body.data.total >= 1);
      assert.equal(body.data.page, 1);
      assert.equal(body.data.limit, 10);
    });

    it('PATCH /pets/:pet_id accepts a localized frontend type and stores its canonical value', async () => {
      const { response, body } = await request(`/pets/${fixture.applicationPetId}`, {
        method: 'PATCH',
        token: fixture.ownerToken,
        body: JSON.stringify({ type: 'นก' }),
      });

      assert.equal(response.status, 200);
      assert.equal(body.data.type, 'Bird');
      const { rows } = await pool.query('SELECT type FROM pets WHERE id = $1', [fixture.applicationPetId]);
      assert.equal(rows[0].type, 'Bird');
    });

    it('GET /pets?adoptedByMe=true returns only adopted pets with the user’s approved application', async () => {
      const { response, body } = await request('/pets?limit=50&adoptedByMe=true', {
        token: fixture.applicantToken,
      });

      assert.equal(response.status, 200);
      assert.equal(body.success, true);
      assert.deepEqual(body.data.pets.map((pet) => pet.id), [fixture.adoptedPetId]);
    });

    it('GET /pets/:pet_id returns the pet and owner', async () => {
      const { response, body } = await request(`/pets/${fixture.petId}`);

      assert.equal(response.status, 200);
      assert.equal(body.success, true);
      assert.equal(body.data.id, fixture.petId);
      assert.equal(body.data.name, fixture.petName);
      assert.equal(body.data.type, 'Dog');
      assert.equal(body.data.ageMonths, 24);
      assert.equal(body.data.gender, 'Female');
      assert.equal(body.data.description, 'API test description');
      assert.deepEqual(body.data.healthHistory, { disease: 'None', vaccinated: true, neutered: false });
      assert.equal(body.data.adoptionConditions, 'API test conditions');
      assert.ok(body.data.createdAt);
      assert.ok(body.data.updatedAt);
      assert.equal(body.data.owner.id, ownerId);
      assert.ok(body.data.owner.createdAt);
      assert.equal(body.data.applications[0].housingType, 'House');
      assert.equal(body.data.applications[0].incomeRange, '30,000 - 50,000 THB');
      assert.equal(body.data.applications[0].petExperience, 'API test experience');
      assert.equal(body.data.applications[0].additionalNote, 'API test application note');
      assert.equal(body.data.applications[0].householdMembers, 2);
      assert.equal(body.data.applications[0].adoptionReason, 'API test reason');
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

    it('PATCH pet status routes send one completion message per adoption transition', async () => {
      const contentPrefix = `🎉 ยืนยันการรับเลี้ยงน้อง "Adopted ${fixture.petName}"`;
      const routes = [
        `/pets/${fixture.adoptedPetId}`,
        `/pets/${fixture.adoptedPetId}/status`,
      ];

      for (const route of routes) {
        await pool.query(
          `UPDATE pets SET status = 'PENDING' WHERE id = $1`,
          [fixture.adoptedPetId],
        );
        const beforeCount = await countSystemMessages(fixture.adoptedPetId, contentPrefix);
        const body = JSON.stringify({ status: 'adopted' });
        const options = { method: 'PATCH', token: fixture.ownerToken, body };
        const responses = await Promise.all([
          request(route, options),
          request(route, options),
        ]);

        assert.ok(responses.every(({ response, body: responseBody }) => (
          response.status === 200 && responseBody.success
        )));
        assert.equal(
          await countSystemMessages(fixture.adoptedPetId, contentPrefix),
          beforeCount + 1,
        );

        const replay = await request(route, options);
        assert.equal(replay.response.status, 200);
        assert.equal(
          await countSystemMessages(fixture.adoptedPetId, contentPrefix),
          beforeCount + 1,
        );
      }
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
      fixture.applicationId = body.data.application_id;
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

    it('PATCH /applications sends the approval message only once per status transition', async () => {
      assert.ok(fixture.applicationId);
      const contentPrefix = '🎉 ยินดีด้วยครับ/ค่ะ! คุณได้รับการคัดเลือก';
      const beforeCount = await countSystemMessages(fixture.applicationPetId, contentPrefix);
      const options = {
        method: 'PATCH',
        token: fixture.ownerToken,
        body: JSON.stringify({ id: fixture.applicationId, status: 'accepted' }),
      };

      const responses = await Promise.all([
        request('/applications', options),
        request('/applications', options),
      ]);
      assert.ok(responses.every(({ response, body }) => (
        response.status === 200 && body.success
      )));
      assert.equal(
        await countSystemMessages(fixture.applicationPetId, contentPrefix),
        beforeCount + 1,
      );

      const replay = await request('/applications', options);
      assert.equal(replay.response.status, 200);
      assert.equal(
        await countSystemMessages(fixture.applicationPetId, contentPrefix),
        beforeCount + 1,
      );

      await pool.query(
        `UPDATE applications SET status = 'PENDING' WHERE id = $1`,
        [fixture.applicationId],
      );
      await pool.query(
        `UPDATE pets SET status = 'AVAILABLE' WHERE id = $1`,
        [fixture.applicationPetId],
      );
    });
  });

  describe('Notifications', () => {
    it('GET /notifications requires authentication', async () => {
      await expectApiError('/notifications', { status: 401, code: 'UNAUTHORIZED' });
    });

    it('GET /notifications reports no reviews for applicants without reviews', async () => {
      const { response, body } = await request('/notifications', {
        token: fixture.ownerToken,
      });

      assert.equal(response.status, 200);
      assert.equal(body.success, true);

      const notification = body.data.find((item) => (
        item.applicantId === applicantId && item.petId === fixture.petId
      ));
      assert.ok(notification);
      assert.equal(notification.rating, null);
      assert.equal(notification.reviewsCount, 0);
      assert.deepEqual(notification.reviews, []);
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

    it('GET /wishlists preserves a pending pet status', async () => {
      const { rows } = await pool.query('SELECT status FROM pets WHERE id = $1', [fixture.adoptedPetId]);
      const originalStatus = rows[0].status;
      try {
        await pool.query('UPDATE pets SET status = $2 WHERE id = $1', [fixture.adoptedPetId, 'PENDING']);
        const added = await request('/wishlists', {
          method: 'POST',
          token: fixture.applicantToken,
          body: JSON.stringify({ petId: fixture.adoptedPetId }),
        });
        assert.equal(added.response.status, 201);

        const { response, body } = await request('/wishlists', { token: fixture.applicantToken });
        assert.equal(response.status, 200);
        assert.equal(body.data.find((pet) => pet.id === fixture.adoptedPetId).status, 'pending');
      } finally {
        await pool.query('DELETE FROM wishlists WHERE user_id = $1 AND pet_id = $2', [applicantId, fixture.adoptedPetId]);
        await pool.query('UPDATE pets SET status = $2 WHERE id = $1', [fixture.adoptedPetId, originalStatus]);
      }
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
      await expectApiError(`/pets/${randomUUID()}/updates`, {
        status: 404,
        code: 'PET_NOT_FOUND',
        method: 'POST',
        token: fixture.applicantToken,
        body: form,
      });
    });

    it('POST /pets/:pet_id/updates rejects more than five images', async () => {
      const form = await createUpdateForm({ imageCount: 6 });
      const { response, body } = await request(`/pets/${fixture.adoptedPetId}/updates`, {
        method: 'POST',
        token: fixture.applicantToken,
        body: form,
      });

      assert.equal(response.status, 400);
      assert.equal(body.success, false);
      assert.equal(body.error.code, 'INVALID_IMAGES');
    });

    it('POST /pets/:pet_id/updates rejects an image larger than five megabytes', async () => {
      const form = await createUpdateForm({ imageCount: 1, imageSize: 5 * 1024 * 1024 + 1 });
      await expectApiError(`/pets/${fixture.adoptedPetId}/updates`, {
        status: 400,
        code: 'LIMIT_FILE_SIZE',
        method: 'POST',
        token: fixture.applicantToken,
        body: form,
      });
    });

    it('POST /pets/:pet_id/updates accepts an image exactly five megabytes in size', async () => {
      const form = await createUpdateForm({ imageSize: [5 * 1024 * 1024, 18, 18] });
      const { response, body } = await request(`/pets/${fixture.adoptedPetId}/updates`, {
        method: 'POST',
        token: fixture.applicantToken,
        body: form,
      });

      assert.equal(response.status, 201);
      assert.equal(body.success, true);
      assert.ok(body.data.update_id);
      assert.equal(body.data.images.length, 3);
      assert.equal(new Set(body.data.images).size, body.data.images.length);
      for (const imageUrl of body.data.images) {
        assert.match(imageUrl, /^\/uploads\/updates\/[^/]+$/);
        await fs.access(path.join(uploadDirectories.updates, path.basename(imageUrl)));
      }
    });

    it('POST /pets/:pet_id/updates rejects updates for pets that are not adopted', async () => {
      const form = await createUpdateForm();
      await expectApiError(`/pets/${fixture.applicationPetId}/updates`, {
        status: 400,
        code: 'PET_NOT_ADOPTED',
        method: 'POST',
        token: fixture.applicantToken,
        body: form,
      });
    });

    it('POST /pets/:pet_id/updates rejects a user who is not the approved adopter', async () => {
      const form = await createUpdateForm();
      await expectApiError(`/pets/${fixture.adoptedPetId}/updates`, {
        status: 403,
        code: 'FORBIDDEN',
        method: 'POST',
        token: fixture.ownerToken,
        body: form,
      });
    });

    it('POST /pets/:pet_id/updates accepts all documented periods for the approved adopter', async () => {
      for (const period of ['1m', '3m', '5m', '1y']) {
        const form = await createUpdateForm({ period });
        const { response, body } = await request(`/pets/${fixture.adoptedPetId}/updates`, {
          method: 'POST',
          token: fixture.applicantToken,
          body: form,
        });

        assert.equal(response.status, 201);
        assert.equal(body.success, true);
        assert.ok(body.data.update_id);
        assert.ok(body.data.created_at);
        assert.ok(body.data.createdAt);
        assert.equal(body.data.period, period);
      }
    });

    it('POST /pets/:pet_id/updates rejects six-month periods', async () => {
      for (const period of ['6m', '6_months', '6 เดือน']) {
        const form = await createUpdateForm({ period, imageCount: 0 });
        await expectApiError(`/pets/${fixture.adoptedPetId}/updates`, {
          status: 400,
          code: 'INVALID_PERIOD',
          method: 'POST',
          token: fixture.applicantToken,
          body: form,
        });
      }
    });

    it('GET /pets/:pet_id/updates includes created updates in newest-first order', async () => {
      const { response, body } = await request(`/pets/${fixture.adoptedPetId}/updates`);

      assert.equal(response.status, 200);
      assert.equal(body.success, true);
      assert.deepEqual(
        body.data.map((update) => update.period).sort(),
        ['1m', '1m', '1y', '3m', '5m'].sort(),
      );
      assert.ok(body.data.every((update) => update.createdAt));
      assert.ok(body.data.every((update, index) => (
        index === 0
        || new Date(body.data[index - 1].createdAt) >= new Date(update.createdAt)
      )));
      assert.ok(body.data.every((update) => update.pet_id === fixture.adoptedPetId));
      assert.ok(body.data.every((update) => update.images.length === 3));
      assert.ok(body.data.every((update) => (
        update.images.every((imageUrl) => imageUrl.startsWith('/uploads/updates/'))
      )));
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

    it('POST and GET /chats/messages keep histories and threads separate by pet', async () => {
      for (const petId of [fixture.petId, fixture.applicationPetId]) {
        const { response, body } = await request('/chats/messages', {
          method: 'POST',
          token: fixture.applicantToken,
          body: JSON.stringify({
            receiverId: ownerId,
            petId,
            message: `Message for ${petId}`,
          }),
        });
        assert.equal(response.status, 201);
        assert.equal(body.data.petId, petId);

        const query = new URLSearchParams({ otherUserId: ownerId, petId });
        const history = await request(`/chats/messages?${query}`, { token: fixture.applicantToken });
        assert.equal(history.response.status, 200);
        assert.ok(history.body.data.length > 0);
        assert.ok(history.body.data.every((message) => message.petId === petId));
      }

      const { response, body } = await request('/chats/messages', { token: fixture.applicantToken });
      assert.equal(response.status, 200);
      const ownerThreads = body.data.filter((thread) => thread.userId === ownerId);
      assert.ok(ownerThreads.some((thread) => thread.petId === fixture.petId));
      assert.ok(ownerThreads.some((thread) => thread.petId === fixture.applicationPetId));
      assert.notEqual(
        ownerThreads.find((thread) => thread.petId === fixture.petId).id,
        ownerThreads.find((thread) => thread.petId === fixture.applicationPetId).id,
      );
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
