# PWA build served by Nginx, which also reverse-proxies /api to the `api` service.
#   docker build -f client/Dockerfile -t resifix-web .
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
COPY prisma prisma
RUN npm ci --workspace client --include-workspace-root --ignore-scripts
COPY client client
ARG VITE_SENTRY_DSN=
ENV VITE_SENTRY_DSN=$VITE_SENTRY_DSN
RUN npm run build -w client

FROM nginx:stable-alpine
COPY deploy/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/client/dist /usr/share/nginx/html
EXPOSE 80
