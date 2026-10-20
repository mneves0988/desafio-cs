FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/order-api/package.json ./apps/order-api/package.json
COPY apps/agent-service/package.json ./apps/agent-service/package.json

RUN npm ci

COPY apps/agent-service ./apps/agent-service
RUN npm run build -w @contato-seguro/agent-service
RUN npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app

COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps/agent-service/dist ./apps/agent-service/dist

USER node
EXPOSE 3001
CMD ["node", "apps/agent-service/dist/channels/server.js"]
