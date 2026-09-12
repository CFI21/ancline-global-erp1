FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY apps/api/package*.json apps/api/
COPY packages/db/package*.json packages/db/
RUN npm install
COPY . .
RUN npm run db:generate && npm run build -w apps/api
CMD ["npm","run","start","-w","apps/api"]
