FROM node:22-slim AS builder

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

FROM node:22-slim

WORKDIR /app
COPY --from=builder /app/build ./build
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./

# Brain directory is mounted at runtime
ENV BRAIN_DIR=/brain

ENTRYPOINT ["node", "build/index.js"]
