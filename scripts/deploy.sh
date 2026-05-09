#!/bin/bash

# 音樂小幫手 部署腳本

echo "🚀 開始部署音樂小幫手後端..."

# 檢查是否在正確目錄
if [ ! -f "package.json" ]; then
    echo "❌ 錯誤：請在專案根目錄執行此腳本"
    exit 1
fi

# 安裝依賴
echo "📦 安裝依賴..."
npm ci --only=production

# 執行資料庫遷移
echo "🗄️ 執行資料庫遷移..."
psql $DATABASE_URL -f migrations/001_initial_schema.sql

# 插入測試資料
echo "📝 插入測試資料..."
psql $DATABASE_URL -f migrations/002_seed_data.sql

echo "✅ 部署完成！"
echo "🌐 API 網址: https://music-xiaobangshou-api.onrender.com"
