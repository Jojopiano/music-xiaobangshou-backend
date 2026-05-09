# 音樂小幫手 部署指南

## Render 部署步驟

### 1. 註冊 Render 帳號
- 前往 https://render.com
- 用 GitHub 帳號登入

### 2. 建立 PostgreSQL 資料庫
1. 點擊 "New" → "PostgreSQL"
2. 設定名稱：`music-xiaobangshou-db`
3. 選擇 Free 方案
4. 點擊 "Create Database"
5. 複製 **Internal Database URL**（稍後會用到）

### 3. 部署 Web Service
1. 點擊 "New" → "Web Service"
2. 選擇 "Build and deploy from a Git repository"
3. 連接你的 GitHub 帳號
4. 選擇 `music-xiaobangshou-backend` 專案
5. 設定：
   - **Name**: `music-xiaobangshou-api`
   - **Runtime**: `Docker`
   - **Plan**: Free
6. 點擊 "Create Web Service"

### 4. 設定環境變數
在 Render Dashboard → Web Service → Environment：

```
DATABASE_URL=postgresql://music_user:password@host:5432/music_xiaobangshou
JWT_SECRET=your-super-secret-key-here
NODE_ENV=production
PORT=3001
```

### 5. 執行資料庫遷移
在 Render Dashboard → Shell：

```bash
# 執行遷移
psql $DATABASE_URL -f migrations/001_initial_schema.sql

# 插入測試資料
psql $DATABASE_URL -f migrations/002_seed_data.sql
```

### 6. 完成！
你的 API 將會在：
```
https://music-xiaobangshou-api.onrender.com
```

---

## 前端設定

修改 `MusicXiaobangshou/src/api/client.ts`：

```typescript
const API_BASE_URL = 'https://music-xiaobangshou-api.onrender.com/api';
```

---

## 測試帳號

| 角色 | 帳號 | 密碼 |
|------|------|------|
| 老師 | teacher@test.com | 123456 |
| 學生 | lin@test.com | 123456 |
| 學生 | zhang@test.com | 123456 |

---

## 常見問題

### Q: 部署後 API 回傳 502？
A: 等 1-2 分鐘，Render Free 方案啟動較慢

### Q: 資料庫連線失敗？
A: 確認 DATABASE_URL 環境變數正確

### Q: 如何更新部署？
A: 推送程式碼到 GitHub，Render 會自動重新部署
