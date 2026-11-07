# API and worker image. Build from the repo root:
#   docker build -f server/Dockerfile -t resifix-api .
FROM node:24-alpine AS build
RUN apk add --no-cache openssl
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
COPY prisma prisma
RUN npm ci --workspace server --include-workspace-root
COPY server server
RUN npm run build -w server

FROM node:24-alpine
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production
# Keep node_modules from the build stage: it includes the generated Prisma client and the
# Prisma CLI used by the `migrate` service.
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/prisma prisma
COPY --from=build /app/server/package.json server/package.json
COPY --from=build /app/server/dist server/dist
USER node
EXPOSE 3000
CMD ["node", "server/dist/main.js"]
