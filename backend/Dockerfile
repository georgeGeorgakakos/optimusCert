FROM node:20-bookworm-slim

# Build tools for better-sqlite3's native module (used only if no prebuilt
# binary is available for this platform; the prebuilt is normally downloaded).
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Make npm resilient to slow/flaky networks so installs don't hang forever.
RUN npm config set fetch-retries 5 \
 && npm config set fetch-retry-mintimeout 20000 \
 && npm config set fetch-retry-maxtimeout 600000 \
 && npm config set fetch-timeout 600000

# Copy manifests first so this layer is cached unless dependencies change.
COPY package.json package-lock.json* ./

# Prefer the fast, deterministic `npm ci` (uses the lockfile); fall back to
# `npm install` if the lockfile is missing or out of sync.
RUN npm ci --omit=dev --no-audit --no-fund \
 || npm install --omit=dev --no-audit --no-fund

COPY src ./src

ENV NODE_ENV=production
ENV PORT=4000
ENV DATA_DIR=/app/data
EXPOSE 4000

CMD ["node", "src/index.js"]
