require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const rateLimit = require("express-rate-limit");
const { RedisStore } = require("rate-limit-redis");
const supabase = require("./lib/supabase");
const redis = require("./lib/redis");
const logger = require("./lib/logger");
const { validateEnv, startupGuard } = require("./lib/env");

// Validate env vars before registering any routes
validateEnv();

const app = express();

// Reject all requests if required env vars are missing
app.use(startupGuard);

// Shared Redis client — lib/redis.js handles lazy-init and error recovery.
// Falls back gracefully to null when REDIS_URL is not set.
const redisClient = redis.getClient();

// Build rate-limiter options, shared via Redis when available
function makeLimiter({ windowMs, max, message }) {
  const opts = {
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: message },
    // If Redis is down/unreachable, fail open (allow the request) instead of
    // taking down every route — each worker just enforces limits independently.
    passOnStoreError: true,
  };
  const rc = redis.getClient();
  if (rc) {
    opts.store = new RedisStore({
      sendCommand: (...args) => rc.call(...args),
    });
  }
  return rateLimit(opts);
}

// ── CORS — must come first so headers are set even on errors ──
const allowedOrigins = [
  "https://staykarolms-six.vercel.app",
];
if (process.env.FRONTEND_URL) {
  const normalized = process.env.FRONTEND_URL.replace(/\/$/, "");
  if (!allowedOrigins.includes(normalized)) {
    allowedOrigins.push(normalized);
  }
}

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) return callback(null, true);
    if (allowedOrigins.some(o => o.toLowerCase() === origin.toLowerCase())) {
      return callback(null, true);
    }
    console.warn(`CORS: origin not allowed: ${origin}`);
    callback(new Error(`CORS: origin not allowed: ${origin}`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

// ── Compression — gzip/br all JSON responses ─────────────────
// Cuts typical API response size by 60-80%, reducing network time.
app.use(compression());

// ── Security headers ─────────────────────────────────────────
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: false,
}));

// Trust proxy so req.ip is the real client IP behind Render/Vercel LB
app.set("trust proxy", 1);

// ── Rate limiting ────────────────────────────────────────────
// Limits are per real client IP. With Redis these are shared across all
// PM2 workers; without Redis each worker enforces independently.
// RATE_LIMIT_GENERAL_MAX: raise for campuses where many students share one NAT IP.
// Default 3000/min = 50 req/s per IP, handles ~1000 concurrent users through a campus gateway.
const generalLimiter = makeLimiter({
  windowMs: 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_GENERAL_MAX || "3000", 10),
  message: "Too many requests, please try again later.",
});

const authLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  // Default 100/15min covers a full campus on one NAT IP. Override with AUTH_RATE_LIMIT_MAX.
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX || "100", 10),
  message: "Too many login attempts, please try again later.",
});

const uploadLimiter = makeLimiter({
  windowMs: 60 * 1000,
  max: 20,
  message: "Too many upload requests, please try again later.",
});

const readLimiter = makeLimiter({
  windowMs: 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_READ_MAX || "600", 10),
  message: "Too many requests, please slow down.",
});

app.use(generalLimiter);

// Upload route: higher body limit (base64 video ≈ 150 MB), registered before global parser
app.use("/api/upload", uploadLimiter, express.json({ limit: "150mb" }), require("./routes/upload"));

// All other routes use the standard 1 MB JSON body limit
app.use(express.json({ limit: "1mb" }));

// ── Health check ────────────────────────────────────────────
// Cache the probe result for 30 s so rapid polling (Vercel healthchecks,
// monitoring services) doesn't saturate Supabase with repeated DB calls.
let _healthCache = null;
let _healthCacheAt = 0;
const HEALTH_CACHE_TTL = 30_000;

app.get("/api/health", async (_req, res) => {
  const now = Date.now();

  // Check Redis first (shared across all Vercel invocations)
  const redisCached = await redis.get("health:cache");
  if (redisCached) {
    try {
      const payload = JSON.parse(redisCached);
      return res.json({ ...payload, timestamp: new Date().toISOString(), cached: true });
    } catch { /* fall through */ }
  }

  if (_healthCache && now - _healthCacheAt < HEALTH_CACHE_TTL) {
    return res.json({ ..._healthCache, timestamp: new Date().toISOString(), cached: true });
  }

  const timestamp = new Date().toISOString();
  const services = [];

  const mem = process.memoryUsage();
  services.push({
    id: "api",
    name: "API Server",
    status: "Healthy",
    detail: `Express · worker ${process.pid}`,
    region: "ap-south-1",
    latency: "< 1ms",
    uptime: "99.9%",
    cpu: 0,
    memory: Math.round((mem.heapUsed / mem.heapTotal) * 100),
  });

  const dbStart = Date.now();
  let dbStatus = "Healthy";
  try {
    const { error } = await supabase.from("profiles").select("id").limit(1);
    if (error) dbStatus = "Degraded";
  } catch {
    dbStatus = "Down";
  }
  services.push({
    id: "db",
    name: "Database",
    status: dbStatus,
    detail: "Supabase PostgreSQL",
    region: "ap-south-1",
    latency: `${Date.now() - dbStart}ms`,
    uptime: "99.9%",
    cpu: 0,
    memory: 0,
  });

  const storageStart = Date.now();
  let storageStatus = "Healthy";
  try {
    const { error } = await supabase.storage.listBuckets();
    if (error) storageStatus = "Degraded";
  } catch {
    storageStatus = "Down";
  }
  services.push({
    id: "storage",
    name: "File Storage",
    status: storageStatus,
    detail: "Supabase Storage",
    region: "ap-south-1",
    latency: `${Date.now() - storageStart}ms`,
    uptime: "99.9%",
    cpu: 0,
    memory: 0,
  });

  const redisStart = Date.now();
  let redisStatus = "Healthy";
  let redisDetail = "Not configured";
  if (redisClient) {
    try {
      await redisClient.ping();
      redisDetail = "Connected";
    } catch {
      redisStatus = "Degraded";
      redisDetail = "Ping failed";
    }
  }
  services.push({
    id: "redis",
    name: "Redis Cache",
    status: redisClient ? redisStatus : "Healthy",
    detail: redisDetail,
    region: "ap-south-1",
    latency: redisClient ? `${Date.now() - redisStart}ms` : "N/A",
    uptime: "99.9%",
    cpu: 0,
    memory: 0,
  });

  const allHealthy = services.every(s => s.status === "Healthy");
  const payload = { status: allHealthy ? "ok" : "degraded", timestamp, services };
  _healthCache   = payload;
  _healthCacheAt = now;
  // Also cache in Redis so all serverless instances benefit
  await redis.set("health:cache", JSON.stringify(payload), HEALTH_CACHE_TTL / 1000);
  res.json(payload);
});

// ── Routes ──────────────────────────────────────────────────
app.use("/api/auth", authLimiter, require("./routes/auth"));
app.use("/api/users", readLimiter, require("./routes/users"));
app.use("/api/courses", require("./routes/courses"));
app.use("/api/tests", require("./routes/tests"));
app.use("/api/attempts", require("./routes/attempts"));
app.use("/api/assignments", require("./routes/assignments"));
app.use("/api/attendance", require("./routes/attendance"));
app.use("/api/notifications", require("./routes/notifications"));
app.use("/api/analytics", require("./routes/analytics"));
app.use("/api/billing", require("./routes/billing"));
app.use("/api/certificates", require("./routes/certificates"));
app.use("/api/batches", require("./routes/batches"));
app.use("/api/ai-sessions", require("./routes/aiSessions"));
app.use("/api/ai-questions", require("./routes/aiQuestions"));
app.use("/api/live-classes", require("./routes/liveClasses"));
app.use("/api/messages", require("./routes/messages"));
app.use("/api/calendar", require("./routes/calendar"));
app.use("/api/submissions", require("./routes/submissions"));
app.use("/api/audit-logs", require("./routes/auditLogs"));
app.use("/api/support-tickets", require("./routes/supportTickets"));
app.use("/api/institutions", readLimiter, require("./routes/institutions"));
// ── 404 ─────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// ── Error handler ───────────────────────────────────────────
app.use(logger.expressErrorHandler());

// ── Start ────────────────────────────────────────────────────
// On Vercel the file is imported as a module — Vercel owns the HTTP layer,
// so we must NOT call listen(). On a VPS / PM2 we ARE the main module.
if (require.main === module) {
  const PORT = process.env.PORT || 3001;
  const server = app.listen(PORT, () => {
    logger.info('StayKaro LMS API started', { port: PORT, pid: process.pid, nodeEnv: process.env.NODE_ENV || 'development' });
  });
  // Keep-alive timeout must exceed the load-balancer idle timeout (60s on Render)
  // to prevent random 502s under sustained load.
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;
}

module.exports = app;
