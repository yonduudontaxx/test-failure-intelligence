# Builder stage — installs all dependencies and compiles TypeScript
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production stage — minimal runtime image, production dependencies only
FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nodeuser --ingroup nodejs
COPY --from=builder /app/dist ./dist
COPY package*.json ./
RUN npm ci --omit=dev
USER nodeuser
EXPOSE 3001
CMD ["node", "dist/index.js"]
