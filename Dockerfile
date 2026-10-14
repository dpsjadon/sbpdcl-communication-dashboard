# ===============================================================
# SBPDCL Unified Meter Analytics Dashboard
# Production Dockerfile for Render.com Deployment
# ===============================================================

FROM node:20-slim

# Set environment variables
ENV NODE_ENV=production \
    PORT=8098

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production

# Copy application files and seed data
COPY . .

# Expose server port
EXPOSE 8098

# Start application server
CMD ["node", "server.js"]
