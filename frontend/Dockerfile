# --- Build stage ---
FROM node:20-bookworm-slim AS build
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
RUN npm ci --no-audit --no-fund \
 || npm install --no-audit --no-fund

COPY . .
RUN npm run build

# --- Serve stage ---
FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
