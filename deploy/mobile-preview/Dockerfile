FROM node:24-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

FROM postgres:16.14-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends python3 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY ux ./ux
COPY scripts/serve.py scripts/atlas_data.py scripts/view_settings.py scripts/feedback_sources.py ./scripts/
COPY deploy/mobile-preview/preview_server.py deploy/mobile-preview/preview_catalog.py deploy/mobile-preview/start.sh ./
EXPOSE 4180
ENTRYPOINT ["/bin/sh", "/app/start.sh"]
