FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY prisma ./prisma/
COPY prisma.config.ts ./
RUN npm ci

FROM deps AS build
COPY tsconfig.json ./
COPY src ./src/
COPY docker-entrypoint.sh ./
# Apenas para `prisma generate` no build (URL real vem do Compose em runtime).
ENV DATABASE_URL="postgresql://postgres:postgres@localhost:5432/sus_prenatal"
RUN npx prisma generate \
  && npm run build \
  && npm prune --omit=dev

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
COPY --from=build --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=nodejs:nodejs /app/dist ./dist
COPY --from=build --chown=nodejs:nodejs /app/prisma ./prisma
COPY --from=build --chown=nodejs:nodejs /app/package.json ./
COPY --from=build --chown=nodejs:nodejs /app/prisma.config.ts ./
COPY --from=build --chown=nodejs:nodejs /app/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh
USER nodejs
EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
