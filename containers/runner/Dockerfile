FROM node:24-bookworm-slim AS build
WORKDIR /src
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
COPY package.json package-lock.json ./
COPY apps/mac/package.json apps/mac/package.json
COPY apps/mobile/package.json apps/mobile/package.json
COPY packages/design-system/package.json packages/design-system/package.json
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY apps/mac/src/main apps/mac/src/main
COPY apps/mac/runner.vite.config.ts apps/mac/runner.vite.config.ts
RUN npx vite build --config apps/mac/runner.vite.config.ts

FROM node:24-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates git openssh-client gh tini curl bash \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /var/lib/quuu-runner /run/quuu-runner \
    && chown node:node /var/lib/quuu-runner /run/quuu-runner
COPY --from=build /src/out/runner/ /opt/quuu-runner/
ENV QUUU_RUNNER_DATA=/var/lib/quuu-runner \
    QUUU_RUNNER_SECRETS=/run/quuu-runner \
    PATH=/home/node/.local/bin:/usr/local/bin:/usr/bin:/bin
USER node
WORKDIR /home/node
ENTRYPOINT ["/usr/bin/tini", "--", "node", "/opt/quuu-runner/quuu-runner.mjs"]
