FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
WORKDIR /app
COPY ../../package.json ../../package-lock.json* ../../tsconfig.base.json ../../npm-shrinkwrap.json* ./
COPY ../../packages ./packages
COPY ../../services ./services
RUN npm ci --workspaces --include-workspace-root || npm install --workspaces --include-workspace-root

FROM deps AS build
RUN npm run -w @chronos/shared build && npm run -w @chronos/repository build && npm run -w @chronos/scheduler build

FROM node:20-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/services/scheduler/dist ./dist
COPY --from=build /app/services/scheduler/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/repository/package.json ./packages/repository/package.json
COPY --from=build /app/packages/repository/dist ./packages/repository/dist
CMD ["node", "dist/main.js"]


