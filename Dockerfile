FROM node:22-slim AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/eslint-config/package.json ./packages/eslint-config/
COPY packages/logger/package.json ./packages/logger/
COPY packages/types/package.json ./packages/types/
COPY packages/typescript-config/package.json ./packages/typescript-config/
COPY packages/utils/package.json ./packages/utils/
COPY packages/validators/package.json ./packages/validators/
RUN pnpm install --filter @biztrack/api... --frozen-lockfile

FROM base AS build
COPY --from=deps /app ./
COPY . .
RUN pnpm --filter @biztrack/logger --filter @biztrack/types --filter @biztrack/utils --filter @biztrack/http-client build
RUN pnpm --filter @biztrack/validators build
RUN pnpm --filter @biztrack/api build

FROM node:22-slim AS runtime
WORKDIR /app/apps/api
ENV NODE_ENV=production

COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/apps/api/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/package.json ./package.json
COPY --from=build /app/apps/api/src/i18n ./src/i18n
COPY --from=build /app/packages/logger /app/packages/logger
COPY --from=build /app/packages/types /app/packages/types
COPY --from=build /app/packages/utils /app/packages/utils
COPY --from=build /app/packages/validators /app/packages/validators

EXPOSE 3001
CMD ["node", "dist/main.js"]
