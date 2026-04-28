FROM node:20-bookworm-slim AS deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

FROM oven/bun:1.1.42-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src

EXPOSE 8080

CMD ["bun", "src/server.ts"]
