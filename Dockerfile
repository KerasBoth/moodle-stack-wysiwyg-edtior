# syntax=docker/dockerfile:1
# STACK-Editor – Produktions-Image (Next.js standalone, Node 22)

# ---- Abhängigkeiten -------------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app
# Build-Werkzeuge, falls better-sqlite3 kein passendes Binärpaket findet (z. B. andere CPU-Architektur)
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json ./
# postinstall kopiert MathJax/JSXGraph nach public/vendor
COPY scripts ./scripts
RUN npm ci --no-audit --no-fund

# ---- Build ------------------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/public/vendor ./public/vendor
COPY . .
RUN npm run build

# ---- Laufzeit -------------------------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    STACK_XML_DIR=/data/xml \
    STACK_DATA_DIR=/data/db

COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
# natives SQLite-Modul sicherheitshalber vollständig mitnehmen
COPY --from=build --chown=node:node /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3
COPY --from=build --chown=node:node /app/node_modules/bindings ./node_modules/bindings
COPY --from=build --chown=node:node /app/node_modules/file-uri-to-path ./node_modules/file-uri-to-path

RUN mkdir -p /data/xml /data/db && chown -R node:node /data

USER node
EXPOSE 3000
VOLUME ["/data/db", "/data/xml"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health > /dev/null || exit 1

CMD ["node", "server.js"]
