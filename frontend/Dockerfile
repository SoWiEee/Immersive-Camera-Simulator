FROM node:20-slim AS build

WORKDIR /app
RUN npm install -g vite-plus

COPY package.json ./
RUN vp install

COPY . .
RUN vp build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
