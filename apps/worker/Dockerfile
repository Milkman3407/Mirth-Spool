FROM node:24.18.0-alpine@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd AS builder

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.9.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json tsconfig.json ./
COPY apps/worker apps/worker
COPY packages/config packages/config
COPY packages/connectors packages/connectors
COPY packages/deduplication packages/deduplication
COPY packages/db packages/db
COPY packages/redis packages/redis
COPY packages/shared packages/shared
COPY packages/storage packages/storage

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @mirthspool/worker... build
RUN pnpm --filter @mirthspool/worker --prod deploy --legacy /prod/worker

FROM node:24.18.0-alpine@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd AS runtime

ENV NODE_ENV=production
WORKDIR /app

RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
    && mkdir -p /var/lib/mirthspool/media \
    && chown node:node /var/lib/mirthspool/media

COPY --from=builder --chown=node:node /prod/worker ./

USER node

CMD ["node", "dist/index.js"]
