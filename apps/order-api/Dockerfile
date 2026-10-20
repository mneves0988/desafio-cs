FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/order-api/package.json ./apps/order-api/package.json
COPY apps/agent-service/package.json ./apps/agent-service/package.json

RUN npm ci

COPY apps/order-api ./apps/order-api

RUN npm run build:order
RUN npm prune --omit=dev

FROM node:22-alpine

WORKDIR /app

COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps/order-api/dist ./apps/order-api/dist

USER node

EXPOSE 3000

CMD ["node", "apps/order-api/dist/server.js"]
