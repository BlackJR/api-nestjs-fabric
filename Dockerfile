# Étape 1 : Build
FROM node:20-slim AS builder
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm run build
# On ne garde que les dépendances de production pour l'étape finale
RUN pnpm prune --prod

# Étape 2 : Production (Distroless - Ultra léger et sécurisé)
FROM gcr.io/distroless/nodejs20-debian12
WORKDIR /app

# On copie uniquement les artefacts nécessaires depuis l'étape de build
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# Cloud Run injecte automatiquement la variable d'environnement PORT
ENV PORT=8080
EXPOSE 8080

CMD ["dist/main.js"]