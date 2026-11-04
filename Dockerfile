# Tasks F14 and Q6: one image that runs the API, the WebSocket and the built web app on ONE origin (so the login cookie just works).
#   docker build -t campus-hop .
#   docker run -p 3000:3000 --env-file .env -e NODE_ENV=production -e COOKIE_SECURE=true -e JWT_SECRET=... -e DATABASE_URL=... campus-hop
# The container applies database migrations when it starts. Seed the fare table and the reviewed catalog once with:
#   docker run --rm --env-file .env campus-hop node server/dist/seed/cli.js
#
# Debian (not Alpine): Prisma's engine needs OpenSSL 3, which matches the `debian-openssl-3.0.x` target in schema.prisma.

FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci
COPY . .
RUN npm run db:generate && npm run build
# Keep only what the running server needs (the Prisma CLI stays: the container runs `migrate deploy`).
RUN npm prune --omit=dev

FROM node:22-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production PORT=3000 CLIENT_DIST=/app/client/dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/shared ./shared
COPY --from=build /app/server/package.json ./server/package.json
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/server/prisma ./server/prisma
COPY --from=build /app/client/dist ./client/dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s CMD node -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["sh", "-c", "node node_modules/prisma/build/index.js migrate deploy --schema server/prisma/schema.prisma && node server/dist/server.js"]
