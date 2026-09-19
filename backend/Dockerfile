# Debian-based (not alpine) so better-sqlite3's prebuilt binary works without
# a musl/glibc mismatch, and so npm's node-gyp fallback build has what it needs.
FROM node:20-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

ENV NODE_ENV=production
EXPOSE 4000

CMD ["node", "src/server.js"]
