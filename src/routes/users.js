const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const response = (success, data = null, error = null) => ({
  success,
  data,
  error,
});

// ============================================
// PUT /api/users/profile
// 更新用戶個人資料（老師/學生皆可）
// ============================================
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { displayName, studioName, instrument, bio, avatarUrl } = req.body;

    // 欄位長度驗證
    if (displayName !== undefined) {
      if (displayName.trim().length === 0) {
        return res.status(400).json(response(false, null, '姓名/暱稱不能為空白'));
      }
      if (displayName.length > 20) {
        return res.status(400).json(response(false, null, '姓名/暱稱上限 20 字'));
      }
    }

    if (studioName !== undefined && studioName.length > 50) {
      return res.status(400).json(response(false, null, '音樂教室名稱上限 50 字'));
    }

    if (instrument !== undefined && instrument.length > 30) {
      return res.status(400).json(response(false, null, '樂器專長上限 30 字'));
    }

    if (bio !== undefined && bio.length > 150) {
      return res.status(400).json(response(false, null, '自我介紹上限 150 字'));
    }

    // 動態建構 UPDATE 語句
    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (displayName !== undefined) {
      updates.push(`display_name = $${paramIndex++}`);
      values.push(displayName.trim());
    }
    if (studioName !== undefined) {
      updates.push(`studio_name = $${paramIndex++}`);
      values.push(studioName.trim() || null);
    }
    if (instrument !== undefined) {
      updates.push(`instrument = $${paramIndex++}`);
      values.push(instrument.trim() || null);
    }
    if (bio !== undefined) {
      updates.push(`bio = $${paramIndex++}`);
      values.push(bio.trim() || null);
    }
    if (avatarUrl !== undefined) {
      updates.push(`avatar_url = $${paramIndex++}`);
      values.push(avatarUrl.trim() || null);
    }

    if (updates.length === 0) {
      return res.status(400).json(response(false, null, '沒有提供要更新的欄位'));
    }

    // 同時更新 updated_at
    updates.push(`updated_at = NOW()`);

    values.push(userId);

    const result = await db.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING id, email, name, display_name, studio_name, instrument, bio, avatar_url, role, phone, created_at, updated_at`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json(response(false, null, '用戶不存在'));
    }

    res.json(response(true, { user: result.rows[0] }));
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json(response(false, null, '更新個人資料失敗'));
  }
});

// ============================================
// GET /api/users/profile/:id
// 取得公開的用戶資料（供配對確認頁使用）
// ============================================
router.get('/profile/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      'SELECT id, name, display_name, studio_name, instrument, bio, avatar_url, role FROM users WHERE id = $1 AND is_active = true',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json(response(false, null, '用戶不存在'));
    }

    res.json(response(true, { user: result.rows[0] }));
  } catch (err) {
    console.error('Get profile error:', err);
    res.status(500).json(response(false, null, '取得用戶資料失敗'));
  }
});

module.exports = router;
