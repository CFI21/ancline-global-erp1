FROM node:22-alpine
WORKDIR /app

COPY package*.json ./
COPY apps/api/package*.json apps/api/
COPY packages/db/package*.json packages/db/
RUN npm install --include=dev

COPY . .
RUN npm run db:generate && npm run build -w apps/api

ENV NODE_ENV=production
EXPOSE 3001
CMD ["sh","-c","npx prisma db push --schema=packages/db/prisma/schema.prisma && node apps/api/dist/main.js"]
