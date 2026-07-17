# backend/Dockerfile
# Multi-stage production image for StayKaro LMS API.
# Final image: node:20-alpine (~160 MB) — no dev tools, no source maps.
#
# Build:  docker build -t staykaro-api ./backend
# Run:    docker run -p 3001:3001 --env-file backend/.env staykaro-api

# ── Stage 1: deps ────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

# Install production deps only — no devDependencies
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --ignore-scripts

# ── Stage 2: production image ────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

# Non-root user for security — mirrors Render's default
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy prod deps from build stage
COPY --from=deps /app/node_modules ./node_modules

# Copy source (everything except what .dockerignore excludes)
COPY . .

# Create log directory owned by the app user
RUN mkdir -p /app/logs && chown -R appuser:appgroup /app

USER appuser

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

# Use PM2 in cluster mode — one worker per CPU core.
# pm2-runtime keeps the container alive and forwards signals correctly.
CMD ["npx", "pm2-runtime", "start", "ecosystem.config.js", "--env", "production"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3001/api/ready || exit 1
