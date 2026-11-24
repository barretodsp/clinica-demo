# API NestJS — build multi-stage (pnpm workspaces). Contexto: raiz do repositório.
FROM node:26.13.1-alpine AS base
RUN npm i -g pnpm@12.23.0
WORKDIR /repo

FROM base AS build
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/backend/package.json apps/backend/
RUN pnpm install --frozen-lockfile --filter backend...
COPY apps/backend apps/backend
RUN pnpm --filter backend build \
 && pnpm --filter backend deploy --prod --legacy /out \
 && cp -r apps/backend/dist /out/dist

FROM node:26.13.1-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --retries=10 CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "dist/main.js"]
