FROM node:24.18.0-alpine AS builder

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.9.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json tsconfig.json ./
COPY apps/worker apps/worker
COPY packages/config packages/config
COPY packages/connectors packages/connectors
COPY packages/db packages/db
COPY packages/redis packages/redis
COPY packages/shared packages/shared

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @mirthspool/worker... build
RUN pnpm --filter @mirthspool/worker --prod deploy --legacy /prod/worker

FROM node:24.18.0-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY --from=builder --chown=node:node /prod/worker ./

USER node

CMD ["node", "dist/index.js"]
