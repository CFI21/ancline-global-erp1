FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY apps/web/package*.json apps/web/
RUN npm install
COPY . .
RUN npm run build -w apps/web
CMD ["npm","run","start","-w","apps/web"]
