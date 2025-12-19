FROM node:18-alpine

# Create app directory
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy app source
COPY . .

# Use environment PORT if provided, default to 4000
ENV PORT=4000

EXPOSE 4000

CMD ["node", "server.js"]
