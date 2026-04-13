# Use Node.js LTS version
FROM node:18-alpine

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY ecosystem.config.js ./

# Install dependencies
# If using PM2 globally in container
RUN npm install -g pm2
RUN npm ci --only=production

# Copy app source
COPY . .

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Change ownership to non-root user
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose the port your app runs on
EXPOSE 4000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:4000/ || exit 1

# Start command - check if you're using PM2 or plain node
# Option A: If using PM2 (check ecosystem.config.js)
CMD ["pm2-runtime", "start", "ecosystem.config.js"]

# Option B: If using plain Node.js
# CMD ["node", "server.js"]
