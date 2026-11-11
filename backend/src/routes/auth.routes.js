const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { apiError, asyncHandler } = require('../utils/http');

function createAuthRouter(prisma) {
  const router = express.Router();
  const JWT_SECRET = process.env.JWT_SECRET || 'supersecretjwtkey';

  function extractToken(request) {
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.slice(7);
    }
    const rawCookies = request.headers.cookie || '';
    const cookies = Object.fromEntries(
      rawCookies.split(';').map((c) => {
        const [k, ...v] = c.trim().split('=');
        return [k, v.join('=')];
      })
    );
    return cookies.auth_token || null;
  }

  function setAuthCookie(response, token) {
    response.setHeader(
      'Set-Cookie',
      `auth_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}`
    );
  }

  function clearAuthCookie(response) {
    response.setHeader(
      'Set-Cookie',
      'auth_token=; Path=/; HttpOnly; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT'
    );
  }

  async function handleLogin(request, response) {
    const { email, password } = request.body || {};
    if (!email || !password) {
      return response.status(400).json({
        success: false,
        message: 'กรุณากรอกอีเมลและรหัสผ่าน',
      });
    }

    const user = await prisma.user.findUnique({
      where: { email: String(email).trim().toLowerCase() },
    });

    if (!user) {
      return response.status(401).json({
        success: false,
        message: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
      });
    }

    const isMatch = await bcrypt.compare(String(password), user.passwordHash);
    if (!isMatch) {
      return response.status(401).json({
        success: false,
        message: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
      });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, fullName: user.fullName },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    setAuthCookie(response, token);

    return response.json({
      success: true,
      message: 'เข้าสู่ระบบสำเร็จ',
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        phoneNumber: user.phoneNumber,
        profileImage: user.profileImage,
        isVerified: user.isVerified,
      },
      token,
    });
  }

  async function handleRegister(request, response) {
    const { email, password, fullName, phoneNumber, profileImage } = request.body || {};
    if (!email || !password || !fullName) {
      return response.status(400).json({
        success: false,
        message: 'กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน',
      });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const existing = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existing) {
      return response.status(400).json({
        success: false,
        message: 'อีเมลนี้ถูกใช้งานแล้วในระบบ',
      });
    }

    const passwordHash = await bcrypt.hash(String(password), 10);
    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        fullName: String(fullName).trim(),
        phoneNumber: phoneNumber ? String(phoneNumber).trim() : null,
        profileImage: profileImage ? String(profileImage).trim() : null,
        isVerified: false,
        role: 'USER',
      },
    });

    const token = jwt.sign(
      { id: user.id, email: user.email, fullName: user.fullName },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    setAuthCookie(response, token);

    return response.status(201).json({
      success: true,
      message: 'สมัครสมาชิกสำเร็จ',
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        phoneNumber: user.phoneNumber,
        profileImage: user.profileImage,
        isVerified: user.isVerified,
      },
      token,
    });
  }

  // POST / (Handles login or register via action field)
  router.post('/', asyncHandler(async (request, response) => {
    const { action } = request.body || {};
    if (action === 'register') {
      return handleRegister(request, response);
    }
    return handleLogin(request, response);
  }));

  router.post('/login', asyncHandler(handleLogin));
  router.post('/register', asyncHandler(handleRegister));

  // GET /me
  router.get('/me', asyncHandler(async (request, response) => {
    const token = extractToken(request);
    if (!token) {
      return response.json({ success: false, user: null });
    }

    try {
      const payload = jwt.verify(token, JWT_SECRET);
      const userId = payload.id || payload.userId || payload.sub;
      if (!userId) {
        return response.json({ success: false, user: null });
      }

      const user = await prisma.user.findUnique({
        where: { id: String(userId) },
        select: {
          id: true,
          email: true,
          fullName: true,
          phoneNumber: true,
          profileImage: true,
          isVerified: true,
          role: true,
        },
      });

      if (!user) {
        return response.json({ success: false, user: null });
      }

      return response.json({ success: true, user });
    } catch {
      return response.json({ success: false, user: null });
    }
  }));

  // POST /logout
  router.post('/logout', asyncHandler(async (_request, response) => {
    clearAuthCookie(response);
    return response.json({ success: true, message: 'ออกจากระบบสำเร็จ' });
  }));

  return router;
}

module.exports = { createAuthRouter };
