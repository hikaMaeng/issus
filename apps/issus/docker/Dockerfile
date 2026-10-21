FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --chown=node:node apps/issus/dist/ ./dist/
USER node
CMD ["node", "dist/server/entry/broker/index.js"]
