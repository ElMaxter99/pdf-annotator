# Stage 1: Build the Angular application
FROM node:22.12.0-alpine AS build

# Install system dependencies required for Node.js native extensions
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Install dependencies and build the project
COPY package*.json ./
RUN npm install --no-fund

COPY . .

# Build the Angular application in production mode
RUN npm run build

# Stage 2: Serve the compiled app with NGINX
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runner

# The unprivileged image runs as the non-root `nginx` user (UID 101) and listens on 8080.
# Switch to root only for the build-time file edits, then back.
USER root

# Remove the default nginx static assets
RUN rm -rf /usr/share/nginx/html/*

# Ensure nginx serves modern JavaScript modules (.mjs) with the correct MIME type
RUN sed -i 's/application\/javascript\(.*\)js;/application\/javascript\1js mjs;/' /etc/nginx/mime.types

# Copy custom nginx configuration for SPA routing
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy the built Angular assets
COPY --from=build /app/dist/pdf-annotator/browser /usr/share/nginx/html

USER nginx

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
