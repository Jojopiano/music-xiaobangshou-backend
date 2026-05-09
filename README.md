# 🎵 音樂小幫手後端 (Music Xiaobangshou Backend)

Node.js + Express + PostgreSQL 後端 API

## 專案結構

```
music-xiaobangshou-backend/
├── src/
│   ├── app.js              # Express 應用設定
│   ├── server.js           # 伺服器啟動入口
│   ├── config/
│   │   └── database.js     # PostgreSQL 連線設定
│   ├── controllers/        # 控制器 (業務邏輯)
│   ├── middleware/
│   │   └── auth.js         # JWT 認證中介層
│   ├── models/             # 資料模型
│   ├── routes/             # API 路由
│   └── utils/
│       └── logger.js       # 日誌工具
├── migrations/             # 資料庫遷移檔案
├── tests/                  # 測試檔案
├── .env.example            # 環境變數範例
├── package.json
└── README.md
```

## 安裝

```bash
npm install
```

## 設定

1. 複製 `.env.example` 為 `.env`
2. 修改資料庫連線資訊

```bash
cp .env.example .env
```

## 啟動

```bash
# 開發模式 (使用 nodemon)
npm run dev

# 生產模式
npm start
```

## API 端點

| 方法 | 路徑 | 說明 |
|------|------|------|
| GET | `/health` | 健康檢查 |

## 技術棧

- **Node.js** - 執行環境
- **Express** - Web 框架
- **PostgreSQL** - 資料庫
- **pg** - PostgreSQL 驅動
- **JWT** - 認證
- **bcrypt** - 密碼加密
- **CORS** - 跨域支援
