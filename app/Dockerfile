# Site (front-end) do Digital Twin Industrial: compila com o Node e serve com o nginx.
#   docker build -t digital-twin-site ./app        (normalmente é o docker-compose da raiz que faz isso)
FROM node:22-alpine AS build
WORKDIR /site
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_API_URL=
ENV VITE_API_URL=$VITE_API_URL
RUN npx vite build

FROM nginx:1.27-alpine
COPY --from=build /site/dist /usr/share/nginx/html
EXPOSE 80
