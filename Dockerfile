# ---------- Stage 1: build (dev dependencies, Vite) ----------
FROM node:24-alpine AS build
WORKDIR /app
# Manifests first: the npm ci layer is cached until a package.json changes.
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
COPY shared/package.json shared/
RUN npm ci --no-audit --no-fund
COPY tsconfig.json ./
COPY shared/ shared/
COPY client/ client/
RUN npm run build --workspace client

# ---------- Stage 2: production-only dependencies ----------
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
COPY shared/package.json shared/
RUN npm ci --omit=dev --workspace server --workspace shared --no-audit --no-fund \
 && npm cache clean --force

# ---------- Stage 3: runtime ----------
FROM node:24-alpine AS runtime
ARG GIT_SHA=dev
ARG APP_VERSION=0.0.0-dev
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3001 \
    LOG_DIR=/app/logs \
    GIT_SHA=${GIT_SHA} \
    APP_VERSION=${APP_VERSION}
WORKDIR /app
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node shared/ shared/
COPY --chown=node:node server/package.json server/
COPY --chown=node:node server/src server/src
COPY --from=build --chown=node:node /app/client/dist client/dist
# The runtime never needs npm/yarn: drop them (≈ 20 MB) and create the
# writable log directory for match replays.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
      /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
      /opt/yarn-* /usr/local/bin/yarn /usr/local/bin/yarnpkg \
 && mkdir -p /app/logs && chown node:node /app/logs
# Never run as root inside the container.
USER node
EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
# Exec form: node itself is PID 1, so `docker stop`'s SIGTERM reaches it
# (`npm start` would put npm/sh in between and swallow the signal).
# Node runs the TypeScript sources with native type stripping (no tsx).
CMD ["node", "server/src/index.ts"]
