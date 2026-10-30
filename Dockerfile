FROM node:22-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci

FROM base AS builder
COPY --from=deps /app ./
COPY . .
RUN npm run db:generate
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
WORKDIR /app
COPY --from=builder /app ./
EXPOSE 3000
CMD ["sh", "-c", "npm run db:deploy && npm run start"]
