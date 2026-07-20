# syntax=docker/dockerfile:1.7

FROM node:24.18.0-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@11.14.0 --activate
WORKDIR /app

FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS builder
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM base AS runtime-dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile

FROM base AS runner
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs opentask
COPY --from=runtime-dependencies --chown=opentask:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=opentask:nodejs /app/.next ./.next
COPY --from=builder --chown=opentask:nodejs /app/package.json ./package.json
COPY --from=builder --chown=opentask:nodejs /app/next.config.ts ./next.config.ts
COPY --from=builder --chown=opentask:nodejs /app/public ./public
COPY --from=builder --chown=opentask:nodejs /app/drizzle ./drizzle
COPY --from=builder --chown=opentask:nodejs /app/scripts ./scripts
COPY --from=builder --chown=opentask:nodejs /app/shared ./shared
COPY --from=builder --chown=opentask:nodejs /app/worker ./worker
COPY --from=builder --chown=opentask:nodejs /app/app/fonts/licenses/Inter-OFL.txt ./licenses/fonts/Inter-OFL.txt
COPY --from=builder --chown=opentask:nodejs /app/app/fonts/licenses/EBGaramond-OFL.txt ./licenses/fonts/EBGaramond-OFL.txt
USER opentask
EXPOSE 3000
CMD ["node", "node_modules/next/dist/bin/next", "start"]
