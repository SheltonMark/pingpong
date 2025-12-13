FROM node:18-alpine

WORKDIR /app

# 复制后端代码
COPY backend/package*.json ./
RUN npm install --production

COPY backend/ ./

EXPOSE 80

CMD ["node", "app.js"]
