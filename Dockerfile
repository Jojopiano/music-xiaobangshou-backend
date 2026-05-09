# 音樂小幫手 後端 Dockerfile
FROM node:18-alpine

# 安裝 PostgreSQL 客戶端（用於資料庫遷移）
RUN apk add --no-cache postgresql-client

# 設定工作目錄
WORKDIR /app

# 複製 package.json
COPY package*.json ./

# 安裝依賴
RUN npm ci --only=production

# 複製原始碼
COPY . .

# 暴露 port
EXPOSE 3001

# 啟動指令
CMD ["node", "src/server.js"]
