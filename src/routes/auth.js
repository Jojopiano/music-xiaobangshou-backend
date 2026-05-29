const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

// 統一回傳格式
const response = (success, data = null, error = null) => ({
  success,
  data,
  error,
});

// 註冊
router.post('/register', async (req, res) => {
  try {
    const { email, password, name, role, avatar, phone } = req.body;

    if (!email || !password || !name || !role) {
      return res.status(400).json(response(false, null, '缺少必要欄位'));
    }

    if (!['teacher', 'student'].includes(role)) {
      return res.status(400).json(response(false, null, '角色必須是 teacher 或 student'));
    }

    // 檢查 email 是否已存在
    const existingUser = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(409).json(response(false, null, 'Email 已被使用'));
    }

    // 加密密碼
    const passwordHash = await bcrypt.hash(password, 10);

    // 建立用戶
    const userResult = await db.query(
      'INSERT INTO users (email, password_hash, name, role, avatar, phone) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, email, name, role, avatar',
      [email, passwordHash, name, role, avatar || name.charAt(0), phone]
    );

    const user = userResult.rows[0];

    // 建立對應角色資料
    if (role === 'teacher') {
      await db.query('INSERT INTO teachers (user_id) VALUES ($1)', [user.id]);
    } else {
      await db.query(
        'INSERT INTO students (user_id, instrument) VALUES ($1, $2)',
        [user.id, req.body.instrument || '未指定']
      );
    }

    // 產生 JWT
    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json(response(true, { user, token }));
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json(response(false, null, '註冊失敗'));
  }
});

// 登入
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json(response(false, null, '請輸入 Email 和密碼'));
    }

    // 查詢用戶
    const userResult = await db.query(
      'SELECT id, email, name, display_name, role, avatar, password_hash FROM users WHERE email = $1 AND is_active = true',
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json(response(false, null, '帳號或密碼錯誤'));
    }

    const user = userResult.rows[0];

    // 驗證密碼
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json(response(false, null, '帳號或密碼錯誤'));
    }

    // 更新最後登入時間
    await db.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

    // 產生 JWT
    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // 移除 password_hash 後回傳
    const { password_hash, ...userWithoutPassword } = user;

    res.json(response(true, { user: userWithoutPassword, token }));
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json(response(false, null, '登入失敗'));
  }
});

// 取得目前用戶資訊
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const userResult = await db.query(
      'SELECT id, email, name, display_name, role, avatar, phone, created_at FROM users WHERE id = $1',
      [req.user.userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json(response(false, null, '用戶不存在'));
    }

    res.json(response(true, { user: userResult.rows[0] }));
  } catch (err) {
    console.error('Get me error:', err);
    res.status(500).json(response(false, null, '取得用戶資訊失敗'));
  }
});

// 第三方登入 (Apple/Google)
router.post('/oauth', async (req, res) => {
  try {
    const { provider, providerUserId, email, name, role } = req.body;
    const userRole = ['teacher', 'student'].includes(role) ? role : 'student';

    if (!provider || !providerUserId) {
      return res.status(400).json(response(false, null, '缺少必要欄位'));
    }

    // 檢查是否已綁定
    const oauthResult = await db.query(
      'SELECT user_id FROM user_oauth_accounts WHERE provider = $1 AND provider_user_id = $2',
      [provider, providerUserId]
    );

    let userId;

    if (oauthResult.rows.length > 0) {
      // 已綁定，直接登入
      userId = oauthResult.rows[0].user_id;
    } else {
      // 新用戶，建立帳號
      const userResult = await db.query(
        'INSERT INTO users (email, name, role, avatar) VALUES ($1, $2, $3, $4) RETURNING id',
        [email || `${provider}_${providerUserId}@example.com`, name || '新用戶', userRole, name ? name.charAt(0) : '用']
      );

      userId = userResult.rows[0].id;

      // 依角色建立對應資料
      if (userRole === 'teacher') {
        await db.query('INSERT INTO teachers (user_id) VALUES ($1)', [userId]);
      } else {
        await db.query(
          'INSERT INTO students (user_id, instrument) VALUES ($1, $2)',
          [userId, '未指定']
        );
      }

      // 綁定 OAuth
      await db.query(
        'INSERT INTO user_oauth_accounts (user_id, provider, provider_user_id) VALUES ($1, $2, $3)',
        [userId, provider, providerUserId]
      );
    }

    // 取得用戶資訊
    const userResult = await db.query(
      'SELECT id, email, name, display_name, role, avatar FROM users WHERE id = $1',
      [userId]
    );

    const user = userResult.rows[0];

    // 產生 JWT
    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json(response(true, { user, token }));
  } catch (err) {
    console.error('OAuth error:', err);
    res.status(500).json(response(false, null, '第三方登入失敗'));
  }
});

module.exports = router;
