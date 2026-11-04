# nuvadesk-core. Build context is the repo root (it needs config/ and webchat/ too):
#   docker build -f core/Dockerfile .
# Node 26 runs the TypeScript sources directly (type stripping), so there is no build step.
FROM node:26.13.0-alpine3.24

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
COPY core/package.json core/
RUN npm ci --omit=dev --workspace core --no-audit --no-fund && npm cache clean --force

COPY core/src core/src
COPY config/client.schema.json config/
COPY webchat webchat

USER node
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD ["node", "-e", "require('http').get('http://127.0.0.1:8080/healthz',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"]
CMD ["node", "core/src/main.ts"]
