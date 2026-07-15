// backend/lib/logger.js
// Structured JSON logger for Vercel/Render production environments.
// Outputs one JSON object per line so log aggregators (Vercel, Datadog, etc.)
// can index and filter by field without regex parsing.
//
// Usage:
//   const logger = require('./lib/logger');
//   logger.info('server started', { port: 3001 });
//   logger.error('db connect failed', { error: err.message, table: 'profiles' });

const LEVEL_VALUES = { debug: 10, info: 20, warn: 30, error: 40 };
const ACTIVE_LEVEL = LEVEL_VALUES[process.env.LOG_LEVEL] ?? LEVEL_VALUES.info;

function write(level, message, fields = {}) {
  if (LEVEL_VALUES[level] < ACTIVE_LEVEL) return;

  // Never log secrets — strip known-dangerous keys defensively
  const safe = { ...fields };
  for (const k of Object.keys(safe)) {
    const lk = k.toLowerCase();
    if (lk.includes('password') || lk.includes('secret') || lk.includes('token') || lk.includes('key')) {
      safe[k] = '[REDACTED]';
    }
  }

  const entry = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    pid: process.pid,
    ...safe,
  };

  // Use stderr for warn/error (Vercel surfaces both, but some tools split them)
  const out = level === 'error' || level === 'warn' ? process.stderr : process.stdout;
  out.write(JSON.stringify(entry) + '\n');
}

const logger = {
  debug: (msg, fields) => write('debug', msg, fields),
  info:  (msg, fields) => write('info',  msg, fields),
  warn:  (msg, fields) => write('warn',  msg, fields),
  error: (msg, fields) => write('error', msg, fields),

  // Returns an Express error-handler that logs the error then responds 500
  expressErrorHandler() {
    return (err, _req, res, _next) => {
      this.error('unhandled express error', {
        error: err.message,
        stack: process.env.NODE_ENV === 'production' ? undefined : err.stack,
      });
      if (res.headersSent) return;
      res.status(500).json({ error: 'Internal server error' });
    };
  },
};

module.exports = logger;
