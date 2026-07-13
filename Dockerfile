# ---- Build Stage ----
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --only=production && npm ci --only=development

COPY tsconfig.json ./
COPY src/ ./src/
RUN npx tsc

# ---- Production Stage ----
FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache tini

COPY package.json package-lock.json ./
RUN npm ci --only=production --ignore-scripts

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/lua ./dist/lua
COPY --from=builder /app/public ./public

USER node

EXPOSE 3000

ENV NODE_ENV=production

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]
