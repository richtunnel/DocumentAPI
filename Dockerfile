#Azure Functions official Node.js image
FROM mcr.microsoft.com/azure-functions/node:4-node18

WORKDIR /app

COPY package*.json ./
COPY host.json ./
COPY local.settings.json ./
COPY tsconfig.json ./


# Install dependencies
RUN npm ci --only=production

RUN npm install -g azure-functions-core-tools@4 --unsafe-perm true

# Copy source code
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# Create logs directory
RUN mkdir -p logs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:7071/api/health || exit 1

# Default command (can be overridden)
CMD ["func", "start", "--host", "0.0.0.0"]


