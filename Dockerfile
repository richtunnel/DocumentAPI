# Azure Functions official Node.js 20 image
FROM mcr.microsoft.com/azure-functions/node:4.0-node20 AS build

# Install Yarn
RUN npm install -g yarn

WORKDIR /app

# Copy dependency files first (better caching)
COPY package*.json yarn.lock* ./
COPY tsconfig.json ./
COPY host.json ./
COPY local.settings.json ./

# Install ALL dependencies (including dev) for build
RUN yarn install --frozen-lockfile --ignore-engines

# Copy source code
COPY src/ ./src/

# Build TypeScript
RUN yarn build

USER root
COPY src/scripts/init-database.sql /usr/src/app/init-database.sql
COPY src/scripts/init-db.sh /usr/src/app/init-db.sh
RUN chmod +x /usr/src/app/init-db.sh

USER mssql

# Production image
FROM mcr.microsoft.com/azure-functions/node:4.0-node20

# Install Yarn + Azure Functions Core Tools
RUN npm install -g yarn azure-functions-core-tools@4 --unsafe-perm true

WORKDIR /app

# Copy only necessary files from build stage
COPY --from=build /app/package*.json ./
COPY --from=build /app/yarn.lock* ./
COPY --from=build /app/dist ./dist
COPY --from=build /app/host.json ./

# Install only production dependencies
RUN yarn install --production --frozen-lockfile --ignore-engines --prefer-offline

# Create logs directory
RUN mkdir -p logs

# Expose port
EXPOSE 3000

# Health check (Express + Azure Functions hybrid)
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/api/v1/health || exit 1

# Default command (can be overridden)
CMD ["sh", "-c", "node dist/express-app/server.js & func start --host 0.0.0.0 --port 7071"]