const assert = require('node:assert/strict');
const { after, before, describe, it } = require('node:test');
const bcrypt = require('bcryptjs');
const express = require('express');
const jwt = require('jsonwebtoken');
const { createAuthRouter } = require('../src/routes/auth.routes');

process.env.JWT_SECRET = 'auth-route-test-secret';

let server;
let baseUrl;
let users;
let nextUserId;
let failUserLookup;
let prisma;

before(async () => {
  const passwordHash = await bcrypt.hash('Password123!', 10);
  users = new Map([
    ['existing@example.com', {
      id: 'existing-user',
      email: 'existing@example.com',
      passwordHash,
      fullName: 'Existing User',
      phoneNumber: null,
      profileImage: null,
      isVerified: true,
      role: 'USER',
    }],
  ]);
  nextUserId = 0;
  failUserLookup = false;
  prisma = {
    user: {
      findUnique: async ({ where }) => {
        if (where.email) return users.get(where.email) || null;
        if (where.id) {
          if (failUserLookup) throw new Error('Database unavailable');
          return [...users.values()].find((user) => user.id === where.id) || null;
        }
        return null;
      },
      create: async ({ data }) => {
        const user = { id: `new-user-${++nextUserId}`, ...data };
        users.set(user.email, user);
        return user;
      },
    },
  };

  const app = express();
  app.use(express.json());
  app.use('/api/v1/auth', createAuthRouter(prisma));
  app.use((error, _request, response, _next) => {
    response.status(500).json({ success: false, message: error.message });
  });
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api/v1/auth`;
});

after(async () => {
  if (server) {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

describe('POST /api/v1/auth', () => {
  it('logs in with the frontend action payload and sets the auth cookie', async () => {
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'login',
        email: ' EXISTING@example.com ',
        password: 'Password123!',
      }),
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.user.id, 'existing-user');
    assert.equal(body.user.fullName, 'Existing User');
    assert.ok(body.token);
    assert.match(response.headers.get('set-cookie'), /auth_token=.*HttpOnly/);
  });

  it('registers with the frontend action payload and exposes the expected user fields', async () => {
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'register',
        email: ' NewUser@example.com ',
        password: 'Password123!',
        fullName: 'New User',
      }),
    });
    const body = await response.json();

    assert.equal(response.status, 201);
    assert.equal(body.success, true);
    assert.equal(body.user.email, 'newuser@example.com');
    assert.equal(body.user.fullName, 'New User');
    assert.equal(body.user.isVerified, false);
    assert.ok(body.token);
    assert.match(response.headers.get('set-cookie'), /auth_token=.*HttpOnly/);
  });

  it('rejects a missing or unsupported action instead of silently attempting login', async () => {
    for (const payload of [{}, { action: 'reset-password' }]) {
      const response = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await response.json();

      assert.equal(response.status, 400);
      assert.equal(body.success, false);
      assert.ok(body.message);
    }
  });
});

describe('GET /api/v1/auth/me', () => {
  it('returns the authenticated user from the login cookie', async () => {
    const login = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'login',
        email: 'existing@example.com',
        password: 'Password123!',
      }),
    });
    const cookie = login.headers.get('set-cookie').split(';', 1)[0];
    const response = await fetch(`${baseUrl}/me`, { headers: { Cookie: cookie } });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.user.id, 'existing-user');
    assert.equal(body.user.email, 'existing@example.com');
  });

  it('returns the frontend unauthenticated response for a missing token', async () => {
    const response = await fetch(`${baseUrl}/me`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body, { success: false, user: null });
  });

  it('does not turn a user lookup failure into an unauthenticated response', async () => {
    failUserLookup = true;
    try {
      const token = jwt.sign({ id: 'existing-user' }, process.env.JWT_SECRET);
      const response = await fetch(`${baseUrl}/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await response.json();

      assert.equal(response.status, 500);
      assert.deepEqual(body, { success: false, message: 'Database unavailable' });
    } finally {
      failUserLookup = false;
    }
  });
});

describe('POST /api/v1/auth/logout', () => {
  it('clears the auth cookie and returns the frontend success response', async () => {
    const response = await fetch(`${baseUrl}/logout`, { method: 'POST' });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.match(response.headers.get('set-cookie'), /auth_token=;.*Expires=/);
  });
});
