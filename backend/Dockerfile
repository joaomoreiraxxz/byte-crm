FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm install && npm cache clean --force
COPY . .
RUN npm run build

FROM node:20-alpine AS runtime

WORKDIR /app
RUN addgroup -g 1001 -S nodejs && adduser -S bytecrm -u 1001
COPY --from=builder --chown=bytecrm:nodejs /app/dist ./dist
COPY --from=builder --chown=bytecrm:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=bytecrm:nodejs /app/package.json ./

USER bytecrm
EXPOSE 3000
ENV NODE_ENV=production

CMD ["node", "dist/server.js"]
