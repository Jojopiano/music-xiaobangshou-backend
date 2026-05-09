const jwt = require('jsonwebtoken');
const db = require('../config/database');

// 驗證 JWT Token
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ success: false, error: '缺少認證令牌' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // 確認用戶仍然存在且啟用
    const userResult = await db.query(
      'SELECT id, email, name, role FROM users WHERE id = $1 AND is_active = true',
      [decoded.userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ success: false, error: '用戶不存在或已停用' });
    }

    req.user = {
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role,
    };

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, error: '令牌已過期' });
    }
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ success: false, error: '無效的令牌' });
    }
    console.error('Auth middleware error:', err);
    return res.status(500).json({ success: false, error: '認證失敗' });
  }
};

// 檢查角色權限
const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: '未認證' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: '權限不足' });
    }

    next();
  };
};

module.exports = {
  authenticateToken,
  requireRole,
};
