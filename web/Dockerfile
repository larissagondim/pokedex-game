# Web app (Next.js standalone server). Build from the repo root, because the
# build needs the scraped data and images that live outside web/:
#
#   docker build -f web/Dockerfile -t pokedex-web .

FROM node:22-alpine AS deps
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
# Scraped assets read by scripts/sync-assets.mjs. animated/ is git-ignored, so
# it's optional: without it the app loads the GIFs from their remote URLs.
RUN --mount=type=bind,target=/repo \
    mkdir data \
    && cp /repo/data/pokemon.json data/ \
    && cp -r /repo/sprites sprites \
    && if [ -d /repo/animated ]; then cp -r /repo/animated animated; fi
COPY web web
COPY --from=deps /app/web/node_modules web/node_modules
WORKDIR /app/web
# NEXT_PUBLIC_* values are inlined at build time. Empty = model runs in the browser.
ARG NEXT_PUBLIC_ML_API_URL=""
ENV NEXT_PUBLIC_ML_API_URL=$NEXT_PUBLIC_ML_API_URL \
    NEXT_OUTPUT=standalone \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/web/.next/standalone ./
COPY --from=build --chown=node:node /app/web/.next/static ./.next/static
COPY --from=build --chown=node:node /app/web/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]
