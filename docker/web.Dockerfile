# Frontend (build estático do Vite) servido pelo nginx, que também é o proxy reverso da API.
FROM node:26.13.1-alpine AS build
RUN npm i -g pnpm@12.23.0
WORKDIR /repo
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/frontend/package.json apps/frontend/
RUN pnpm install --frozen-lockfile --filter frontend...
COPY apps/frontend apps/frontend
RUN pnpm --filter frontend build

FROM nginx:1.30.8-alpine
COPY docker/nginx/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/frontend/dist /usr/share/nginx/html
EXPOSE 80
