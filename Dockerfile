# Single-stage Dockerfile for development.
# Production hardening (multi-stage build, standalone output) lands later.

FROM node:24-alpine

WORKDIR /app

# Install deps separately so the layer caches when only source changes.
COPY package.json package-lock.json ./
RUN npm ci

# Copy the Prisma schema before generate.
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npx prisma generate

# Copy the rest of the source.
COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev"]
