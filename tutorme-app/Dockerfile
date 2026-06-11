# Solocorn production image (Next.js + custom server with Socket.io)
# Build and run: used by docker-compose for production deploys

FROM node:20-slim AS base
RUN apt-get update && apt-get install -y libreoffice-writer libreoffice-impress libreoffice-calc ca-certificates && rm -rf /var/lib/apt/lists/*

# Dependencies
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
# The postinstall script copies pdf.worker.min.mjs into public/. Copy it early
# so npm ci can run it before the rest of the source tree is available.
COPY scripts/copy-pdf-worker.js ./scripts/
RUN npm ci --legacy-peer-deps

# Build
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Ensure the PDF.js worker is present in public/ after the source tree is copied.
RUN node scripts/copy-pdf-worker.js
RUN npm run build

# Production image (full .next + custom server with Socket.io)
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/server.ts ./
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
# Drizzle migrations are in drizzle folder
COPY --from=builder /app/src ./src
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/tsconfig.json ./
COPY --from=builder /app/next.config.mjs ./

RUN mkdir -p /app/public/uploads && chown -R nextjs:nodejs /app/public/uploads

USER nextjs
EXPOSE 3003
ENV PORT=3003
ENV HOSTNAME="0.0.0.0"

# Custom server (Socket.io) + startup migrations
CMD ["node", "scripts/start-prod.js"]
