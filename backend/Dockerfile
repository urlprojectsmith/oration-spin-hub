FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY schema.sql ./schema.sql

EXPOSE 4000

CMD ["npm", "start"]
