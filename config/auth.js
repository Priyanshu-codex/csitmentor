const ONE_DAY_MS = 24 * 60 * 60 * 1000;

class AuthConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AuthConfigError';
    this.statusCode = 503;
  }
}

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || !secret.trim()) {
    throw new AuthConfigError('JWT_SECRET is not configured on the server.');
  }
  return secret;
}

function getJwtExpiresIn() {
  return process.env.JWT_EXPIRES_IN || '24h';
}

function getAuthCookieOptions() {
  const isProduction = process.env.NODE_ENV === 'production';

  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
    maxAge: ONE_DAY_MS,
  };
}

module.exports = {
  AuthConfigError,
  ONE_DAY_MS,
  getAuthCookieOptions,
  getJwtExpiresIn,
  getJwtSecret,
};
