# Zero-database deployment.
#
# Builds the client and runs it from a single long-lived Node process, so the
# in-memory room store persists for as long as the container runs. No Redis, no
# card, nothing to configure.
#
#   docker build -t who-is-more-likely-to .
#   docker run -p 12000:12000 who-is-more-likely-to
#
# Add UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN to keep rooms across
# restarts. Without them, rooms live exactly as long as the container does,
# which for an evening of play is usually what you want.
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
# tsx is a runtime dependency, so a plain install is enough to run the server.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/api ./api
COPY --from=build /app/lib ./lib
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/tsconfig.json ./tsconfig.json

# Run as the non-root user that the base image already provides. The app is
# chowned because source file modes are not something the image can rely on —
# a checkout with a restrictive umask would otherwise be unreadable here.
RUN chown -R node:node /app

USER node
ENV PORT=12000
EXPOSE 12000
CMD ["npm", "start"]
