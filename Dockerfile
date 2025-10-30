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
FROM nginx:1.27-alpine AS runner

# Remove the default nginx static assets
RUN rm -rf /usr/share/nginx/html/*

# Copy custom nginx configuration for SPA routing
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy the built Angular assets
COPY --from=build /app/dist/pdf-annotator/browser /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
