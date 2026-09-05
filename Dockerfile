FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/package.json
COPY backend/package.json ./backend/package.json
RUN npm ci --include-workspace-root=false
COPY frontend ./frontend
COPY backend ./backend
ENV NEXT_TELEMETRY_DISABLED=1 NEXT_PUBLIC_AUTH_MODE=guest NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=true NEXT_PUBLIC_USE_FIREBASE_EMULATORS=false
RUN npm run build --workspaces --if-present

FROM node:22-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/package.json
COPY backend/package.json ./backend/package.json
RUN npm ci --omit=dev --include-workspace-root=false
RUN mkdir -p backend/node_modules frontend/node_modules

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production APP_ENV=production PORT=8080 NEXT_TELEMETRY_DISABLED=1
COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=dependencies --chown=node:node /app/backend/node_modules ./backend/node_modules
COPY --from=dependencies --chown=node:node /app/frontend/node_modules ./frontend/node_modules
COPY --from=build --chown=node:node /app/backend/dist ./backend/dist
COPY --from=build --chown=node:node /app/backend/package.json ./backend/package.json
COPY --from=build --chown=node:node /app/frontend/.next ./frontend/.next
COPY --from=build --chown=node:node /app/frontend/public ./frontend/public
COPY --from=build --chown=node:node /app/frontend/package.json ./frontend/package.json
COPY --chown=node:node scripts/start-production.mjs ./scripts/start-production.mjs
USER node
EXPOSE 8080
CMD ["node", "scripts/start-production.mjs"]
