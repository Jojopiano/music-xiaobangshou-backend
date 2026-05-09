const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const { success, error } = require('../utils/response');
const { isValidEmail, isNonEmptyString, isValidRole } = require('../utils/validators');
const { JWT_SECRET } = require('../middleware/auth');

const SALT_ROUNDS = 10;
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';

// 產生 JWT token
const generateTokens = (user) => {
  const payload = {
    userId: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
  };
  const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
  const refreshToken = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRY });
  return { accessToken, refreshToken };
};

// POST /api/auth/register
const register = async (req, res) => {
  try {
    const { email, password, name, role, phone } = req.body;

    if (!isValidEmail(email)) {
      return res.status(400).json(error('Invalid email format'));
    }
    if (!isNonEmptyString(password) || password.length < 6) {
      return res.status(400).json(error('Password must be at least 6 characters'));
    }
    if (!isNonEmptyString(name)) {
      return res.status(400).json(error('Name is required'));
    }
    if (!isValidRole(role)) {
      return res.status(400).json(error('Role must be teacher, student, or admin'));
    }

    // 檢查 email 是否已存在
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json(error('Email already registered'));
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const result = await pool.query(
      `INSERT INTO users (email, password_hash, name, role, phone, avatar)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, email, name, role, phone, avatar, created_at`,
      [email, passwordHash, name, role, phone || null, name.charAt(0).toUpperCase()]
    );

    const user = result.rows[0];

    // 若是老師或學生，建立對應資料表記錄
    if (role === 'teacher') {
      await pool.query('INSERT INTO teachers (user_id) VALUES ($1)', [user.id]);
    } else if (role === 'student') {
      await pool.query(
        'INSERT INTO students (user_id, instrument) VALUES ($1, $2)',
        [user.id, req.body.instrument || 'piano']
      );
    }

    const { accessToken, refreshToken } = generateTokens(user);

    res.status(201).json(success({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatar: user.avatar,
      },
      accessToken,
      refreshToken,
    }));
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json(error('Registration failed'));
  }
};

// POST /api/auth/login
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!isValidEmail(email) || !isNonEmptyString(password)) {
      return res.status(400).json(error('Email and password are required'));
    }

    const result = await pool.query(
      'SELECT id, email, name, role, password_hash, avatar, is_active FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json(error('Invalid email or password'));
    }

    const user = result.rows[0];

    if (!user.is_active) {
      return res.status(403).json(error('Account is deactivated'));
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json(error('Invalid email or password'));
    }

    // 更新最後登入時間
    await pool.query('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);

    // 記錄登入日誌
    await pool.query(
      'INSERT INTO login_logs (user_id, ip_address, user_agent, login_method, success) VALUES ($1, $2, $3, $4, $5)',
      [user.id, req.ip, req.headers['user-agent'], 'password', true]
    );

    const { accessToken, refreshToken } = generateTokens(user);

    res.json(success({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatar: user.avatar,
      },
      accessToken,
      refreshToken,
    }));
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json(error('Login failed'));
  }
};

// POST /api/auth/logout
const logout = async (req, res) => {
  // JWT 無狀態，前端刪除 token 即可
  // 可選：將 token 加入黑名單（此處簡化處理）
  res.json(success({ message: 'Logged out successfully' }));
};

// POST /api/auth/refresh
const refresh = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!isNonEmptyString(refreshToken)) {
      return res.status(400).json(error('Refresh token is required'));
    }

    const decoded = jwt.verify(refreshToken, JWT_SECRET);

    const result = await pool.query(
      'SELECT id, email, name, role, avatar, is_active FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      return res.status(401).json(error('User not found'));
    }

    const user = result.rows[0];

    if (!user.is_active) {
      return res.status(403).json(error('Account is deactivated'));
    }

    const tokens = generateTokens(user);

    res.json(success({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    }));
  } catch (err) {
    if (err.name === 'TokenExpiredError' || err.name === 'JsonWebTokenError') {
      return res.status(403).json(error('Invalid or expired refresh token'));
    }
    console.error('Refresh error:', err);
    res.status(500).json(error('Token refresh failed'));
  }
};

// POST /api/auth/apple
const appleLogin = async (req, res) => {
  try {
    const { appleUserId, email, name } = req.body;

    if (!isNonEmptyString(appleUserId)) {
      return res.status(400).json(error('Apple user ID is required'));
    }

    // 查找是否已有綁定
    const oauthResult = await pool.query(
      'SELECT user_id FROM user_oauth_accounts WHERE provider = $1 AND provider_user_id = $2',
      ['apple', appleUserId]
    );

    let user;

    if (oauthResult.rows.length > 0) {
      // 已綁定，直接登入
      const userResult = await pool.query(
        'SELECT id, email, name, role, avatar, is_active FROM users WHERE id = $1',
        [oauthResult.rows[0].user_id]
      );
      user = userResult.rows[0];
    } else {
      // 新用戶，建立帳號
      const userEmail = isValidEmail(email) ? email : `${appleUserId}@apple.private`;
      const userName = isNonEmptyString(name) ? name : 'Apple User';

      const newUser = await pool.query(
        `INSERT INTO users (email, password_hash, name, role, avatar)
         VALUES ($1, NULL, $2, $3, $4)
         RETURNING id, email, name, role, avatar, is_active`,
        [userEmail, userName, 'student', userName.charAt(0).toUpperCase()]
      );
      user = newUser.rows[0];

      // 建立 OAuth 綁定
      await pool.query(
        'INSERT INTO user_oauth_accounts (user_id, provider, provider_user_id) VALUES ($1, $2, $3)',
        [user.id, 'apple', appleUserId]
      );

      // 建立學生記錄
      await pool.query(
        'INSERT INTO students (user_id, instrument) VALUES ($1, $2)',
        [user.id, 'piano']
      );
    }

    if (!user.is_active) {
      return res.status(403).json(error('Account is deactivated'));
    }

    // 更新最後登入時間
    await pool.query('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);

    // 記錄登入日誌
    await pool.query(
      'INSERT INTO login_logs (user_id, ip_address, user_agent, login_method, success) VALUES ($1, $2, $3, $4, $5)',
      [user.id, req.ip, req.headers['user-agent'], 'apple', true]
    );

    const tokens = generateTokens(user);

    res.json(success({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatar: user.avatar,
      },
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    }));
  } catch (err) {
    console.error('Apple login error:', err);
    res.status(500).json(error('Apple login failed'));
  }
};

// POST /api/auth/google
const googleLogin = async (req, res) => {
  try {
    const { googleUserId, email, name, picture } = req.body;

    if (!isNonEmptyString(googleUserId)) {
      return res.status(400).json(error('Google user ID is required'));
    }

    // 查找是否已有綁定
    const oauthResult = await pool.query(
      'SELECT user_id FROM user_oauth_accounts WHERE provider = $1 AND provider_user_id = $2',
      ['google', googleUserId]
    );

    let user;

    if (oauthResult.rows.length > 0) {
      // 已綁定，直接登入
      const userResult = await pool.query(
        'SELECT id, email, name, role, avatar, is_active FROM users WHERE id = $1',
        [oauthResult.rows[0].user_id]
      );
      user = userResult.rows[0];
    } else {
      // 新用戶，建立帳號
      const userEmail = isValidEmail(email) ? email : `${googleUserId}@google.private`;
      const userName = isNonEmptyString(name) ? name : 'Google User';

      const newUser = await pool.query(
        `INSERT INTO users (email, password_hash, name, role, avatar)
         VALUES ($1, NULL, $2, $3, $4)
         RETURNING id, email, name, role, avatar, is_active`,
        [userEmail, userName, 'student', userName.charAt(0).toUpperCase()]
      );
      user = newUser.rows[0];

      // 建立 OAuth 綁定
      await pool.query(
        'INSERT INTO user_oauth_accounts (user_id, provider, provider_user_id) VALUES ($1, $2, $3)',
        [user.id, 'google', googleUserId]
      );

      // 建立學生記錄
      await pool.query(
        'INSERT INTO students (user_id, instrument) VALUES ($1, $2)',
        [user.id, 'piano']
      );
    }

    if (!user.is_active) {
      return res.status(403).json(error('Account is deactivated'));
    }

    // 更新最後登入時間
    await pool.query('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);

    // 記錄登入日誌
    await pool.query(
      'INSERT INTO login_logs (user_id, ip_address, user_agent, login_method, success) VALUES ($1, $2, $3, $4, $5)',
      [user.id, req.ip, req.headers['user-agent'], 'google', true]
    );

    const tokens = generateTokens(user);

    res.json(success({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatar: user.avatar,
      },
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    }));
  } catch (err) {
    console.error('Google login error:', err);
    res.status(500).json(error('Google login failed'));
  }
};

module.exports = {
  register,
  login,
  logout,
  refresh,
  appleLogin,
  googleLogin,
};
