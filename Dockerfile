ARG BASE_IMAGE=node:24.18.1-alpine

FROM ${BASE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

FROM ${BASE_IMAGE} AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

FROM ${BASE_IMAGE} AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM ${BASE_IMAGE} AS migrator
WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY package.json ./
COPY migrations ./migrations
USER 1000
CMD ["node", "node_modules/db-migrate/bin/db-migrate", "up"]

FROM ${BASE_IMAGE} AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3012
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY config ./config
USER 1000
EXPOSE 3012
CMD ["node", "dist/index.js"]
