# Build context: repository root (so database/migrations is available).
# Railway: set the service root to the repo root and RAILWAY_DOCKERFILE_PATH=backend/Dockerfile.
FROM node:22-alpine AS build
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./
RUN npm run build

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/backend/dist ./dist
COPY backend/src ./src
COPY database /app/database
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:${PORT:-4000}/health || exit 1
CMD ["node", "dist/server.js"]
