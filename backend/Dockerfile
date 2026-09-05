FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/package.json
COPY backend/package.json ./backend/package.json
RUN npm ci --workspace @vibeestimate/backend --include-workspace-root=false
COPY backend ./backend
RUN npm run build --workspace @vibeestimate/backend

FROM node:22-bookworm-slim AS production-dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/package.json
COPY backend/package.json ./backend/package.json
RUN npm ci --omit=dev --workspace @vibeestimate/backend --include-workspace-root=false
RUN mkdir -p backend/node_modules

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production APP_ENV=production PORT=8080
WORKDIR /app
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=production-dependencies --chown=node:node /app/backend/node_modules ./backend/node_modules
COPY --from=build --chown=node:node /app/backend/package.json ./backend/package.json
COPY --from=build --chown=node:node /app/backend/dist ./backend/dist
USER node
EXPOSE 8080
CMD ["node", "backend/dist/index.js"]
