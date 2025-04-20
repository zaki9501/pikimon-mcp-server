# Use Node.js 18 as the base image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Create logs directory with proper permissions
RUN mkdir -p /app/logs && \
    chown -R node:node /app/logs

# Copy project files
COPY . .

# Set proper ownership for application files
RUN chown -R node:node /app

# Switch to non-root user
USER node

# Expose ports
EXPOSE 3000
EXPOSE 8080

# Set environment variables
ENV NODE_ENV=production

# Create volume for logs
VOLUME ["/app/logs"]

# Start the server
CMD ["npm", "start"] 