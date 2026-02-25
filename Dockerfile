# Dockerfile
FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# serve-script.js가 있다면 이를 통해 실행, 없다면 정적 파일 서빙
EXPOSE 8080
CMD [ "node", "serve-script.js" ]
