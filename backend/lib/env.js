// backend/lib/env.js
// Validates required environment variables at startup.
// Called once from server.js before any route is registered.
// Logs warnings for optional vars and ERRORS for required ones.
// Does NOT call process.exit() — Vercel serverless functions cannot exit;
// instead, a startup error flag is set so every request returns 503.

const logger = require('./logger');

const REQUIRED = [
  { key: 'SUPABASE_URL',         hint: 'Supabase project URL (Dashboard → Settings → API)' },
  { key: 'SUPABASE_SERVICE_KEY', hint: 'Supabase service role key (Dashboard → Settings → API)' },
];

const RECOMMENDED = [
  { key: 'SUPABASE_JWT_SECRET', hint: 'JWT secret (Dashboard → Settings → API → JWT secret) — required for local token verification; without it every request does a remote Supabase call' },
  { key: 'REDIS_URL',           hint: 'Redis connection URL — caching and distributed rate-limiting disabled without it' },
  { key: 'FRONTEND_URL',        hint: 'Allowed CORS origin for the production frontend' },
];

let _startupOk = true;

function validateEnv() {
  const missingRequired = REQUIRED.filter(({ key }) => !process.env[key]);

  if (missingRequired.length > 0) {
    for (const { key, hint } of missingRequired) {
      logger.error(`[env] MISSING required env var: ${key}`, { hint });
    }
    _startupOk = false;
    logger.error('[env] Server will respond 503 until required env vars are set', {
      missing: missingRequired.map(v => v.key),
    });
  }

  for (const { key, hint } of RECOMMENDED) {
    if (!process.env[key]) {
      logger.warn(`[env] Missing optional env var: ${key}`, { hint });
    }
  }

  return _startupOk;
}

// Express middleware: returns 503 if startup validation failed
function startupGuard(req, res, next) {
  if (!_startupOk) {
    return res.status(503).json({
      error: 'Server misconfigured — required environment variables are missing',
      docs: 'Check server logs for details',
    });
  }
  next();
}

module.exports = { validateEnv, startupGuard };
