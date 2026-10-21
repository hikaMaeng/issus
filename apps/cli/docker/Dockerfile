FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --chown=node:node apps/cli/dist/ ./dist/
USER node
CMD ["node", "dist/index.js"]
