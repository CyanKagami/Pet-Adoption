const jwt = require('jsonwebtoken');
const { apiError } = require('../utils/http');

function createRequireAuth(prisma) {
  return async function requireAuth(request, _response, next) {
    try {
      const authorization = request.headers.authorization;
      const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
      if (!token) throw apiError('UNAUTHORIZED', 'Authentication required', undefined, 401);

      const payload = jwt.verify(token, process.env.JWT_SECRET);
      const userId = payload.id || payload.userId || payload.sub;
      if (!userId) throw apiError('UNAUTHORIZED', 'Invalid access token', undefined, 401);

      const user = await prisma.user.findUnique({
        where: { id: String(userId) },
        select: { id: true },
      });
      if (!user) throw apiError('UNAUTHORIZED', 'User does not exist', undefined, 401);

      request.user = user;
      next();
    } catch (error) {
      if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
        return next(apiError('UNAUTHORIZED', 'Invalid or expired access token', undefined, 401));
      }
      next(error);
    }
  };
}

module.exports = { createRequireAuth };