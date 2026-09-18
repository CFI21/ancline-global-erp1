FROM node:22-alpine
WORKDIR /app

COPY package*.json ./
COPY apps/web/package*.json apps/web/
RUN npm install --include=dev

COPY . .
RUN npm run build -w apps/web

ENV NODE_ENV=production
EXPOSE 3000
CMD ["sh","-c","npm run start -w apps/web -- -p ${PORT:-3000} -H 0.0.0.0"]
