# FireX — ek hi container HTML + /api dono serve karta hai.
FROM node:20-alpine
WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY server ./server
COPY web ./web

ENV PORT=3000
ENV NODE_ENV=production
EXPOSE 3000
HEALTHCHECK CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "server/index.js"]
