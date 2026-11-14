# syntax=docker/dockerfile:1

# Stage build: full Node image on Debian 13 (trixie) so better-sqlite3 can
# compile its native binding, then produce a pruned production tree.
FROM node:24-trixie-slim AS build
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build \
  && npm prune --omit=dev \
  && chmod -R go-w dist node_modules package.json scripts/healthcheck.mjs
# ^ A build context on a Windows/drvfs mount (/mnt/c) arrives with mode 777;
#   strip group/other write so no shipped file is writable by the app user.
# Data directory owned by the runtime UID (65532); copied into the final image
# so the named volume is writable by the non-root user. The data dir is nested
# one level inside the volume mount (/data/app, not /data) because the
# instance lock is created as a sibling of the data dir (<dataDir>.lock):
# /data.lock would land in the read-only root filesystem and could not be
# created by the non-root user.
RUN mkdir -p /data/app && chown 65532:65532 /data /data/app

# Stage runtime: distroless Node 24 on Debian 13 (trixie, same release as the
# build stage). No shell, no package manager, non-root user 65532.
# The Node binary lives at /nodejs/bin/node in distroless nodejs images.
FROM gcr.io/distroless/nodejs24-debian13:nonroot AS runtime
LABEL org.opencontainers.image.source="https://github.com/msafla/centurion" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.title="CENTURION"
WORKDIR /app
ENV NODE_ENV=production \
    CENTURION_DATA_DIR=/data/app \
    CENTURION_LISTEN_HOST=0.0.0.0
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/scripts/healthcheck.mjs ./scripts/healthcheck.mjs
COPY --from=build --chown=65532:65532 /data /data
USER 65532:65532
EXPOSE 4317
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["/nodejs/bin/node", "/app/scripts/healthcheck.mjs"]
ENTRYPOINT ["/nodejs/bin/node"]
CMD ["dist/server/index.js"]
