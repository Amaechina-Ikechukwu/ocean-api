FROM oven/bun:1.1.42-slim

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN bun install --frozen-lockfile || bun install

COPY tsconfig.json ./
COPY src ./src

EXPOSE 8080
CMD ["bun", "src/server.ts"]
