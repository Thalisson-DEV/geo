# ---- Build ----
FROM node:22-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN node --max-old-space-size=2048 ./node_modules/@angular/cli/bin/ng.js build --configuration=production

# ---- Runtime ----
FROM nginx:alpine
RUN rm /etc/nginx/conf.d/default.conf

# nginx.conf é um template: a imagem roda envsubst nos *.template no startup.
# Defina NGINX_ENVSUBST_FILTER=PORT no ambiente para substituir só ${PORT}.
COPY nginx.conf /etc/nginx/templates/default.conf.template

# Nome interno do projeto Angular: geo-field-app-tmp -> dist/geo-field-app-tmp/browser
COPY --from=build /app/dist/geo-field-app-tmp/browser /usr/share/nginx/html

EXPOSE 80
