# syntax=docker/dockerfile:1

FROM node:22-alpine AS deps
WORKDIR /app

# При медленном registry.npmjs.org: NPM_REGISTRY=https://registry.npmmirror.com
ARG NPM_REGISTRY=

RUN npm config set fetch-timeout 600000 \
    && npm config set fetch-retry-mintimeout 20000 \
    && npm config set fetch-retry-maxtimeout 120000 \
    && npm config set fetch-retries 10 \
    && if [ -n "$NPM_REGISTRY" ]; then npm config set registry "$NPM_REGISTRY"; fi

COPY package.json package-lock.json .npmrc ./

RUN --mount=type=cache,target=/root/.npm \
    sh -c 'for attempt in 1 2 3; do \
      echo "npm ci attempt ${attempt}/3"; \
      npm ci && exit 0; \
      echo "npm ci failed, retry in 20s..."; \
      sleep 20; \
    done; \
    exit 1'

FROM node:22-alpine AS build
WORKDIR /app

ARG VITE_KEYCLOAK_URL=http://localhost:8180
ARG VITE_KEYCLOAK_REALM=mis
ARG VITE_KEYCLOAK_CLIENT_ID=mis-frontend

ENV VITE_KEYCLOAK_URL=$VITE_KEYCLOAK_URL
ENV VITE_KEYCLOAK_REALM=$VITE_KEYCLOAK_REALM
ENV VITE_KEYCLOAK_CLIENT_ID=$VITE_KEYCLOAK_CLIENT_ID

COPY --from=deps /app/node_modules ./node_modules
COPY package.json .npmrc ./
COPY index.html vite.config.ts tsconfig.json tsconfig.app.json ./
COPY src ./src
RUN npm run build

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
