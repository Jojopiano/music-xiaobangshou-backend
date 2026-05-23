const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');

const response = (success, data = null, error = null) => ({
  success,
  data,
  error,
});

// 產生 6 位英數混合代碼
function generateCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// ============================================
// POST /api/invite-codes
// 老師產生邀請代碼（每位老師同時只有 1 組有效代碼）
// ============================================
router.post('/', authenticateToken, requireRole('teacher'), async (req, res) => {
  try {
    const teacherId = req.user.userId;

    // 檢查老師是否已有有效代碼
    const existingResult = await db.query(
      'SELECT id, code, expires_at FROM invite_codes WHERE teacher_id = $1 AND is_active = true AND expires_at > NOW()',
      [teacherId]
    );

    // 若已有有效代碼，先將其設為失效（重新產生）
    if (existingResult.rows.length > 0) {
      await db.query(
        'UPDATE invite_codes SET is_active = false WHERE id = $1',
        [existingResult.rows[0].id]
      );
    }

    // 產生新代碼（防碰撞）
    let code;
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      code = generateCode();
      const checkResult = await db.query(
        'SELECT id FROM invite_codes WHERE code = $1',
        [code]
      );
      if (checkResult.rows.length === 0) {
        break;
      }
      attempts++;
    }

    if (attempts >= maxAttempts) {
      return res.status(500).json(response(false, null, '無法產生唯一邀請代碼，請重試'));
    }

    // 有效期限 7 天
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const result = await db.query(
      'INSERT INTO invite_codes (teacher_id, code, expires_at) VALUES ($1, $2, $3) RETURNING *',
      [teacherId, code, expiresAt]
    );

    res.status(201).json(response(true, { inviteCode: result.rows[0] }));
  } catch (err) {
    console.error('Create invite code error:', err);
    res.status(500).json(response(false, null, '產生邀請代碼失敗'));
  }
});

// ============================================
// GET /api/invite-codes/validate/:code
// 驗證邀請代碼（公開端點，供未登入用戶檢查）
// ============================================
router.get('/validate/:code', async (req, res) => {
  try {
    const { code } = req.params;

    if (!code || code.length !== 6) {
      return res.status(400).json(response(false, null, '邀請代碼格式不正確'));
    }

    const result = await db.query(
      `SELECT ic.*, u.id as teacher_user_id, u.display_name, u.name, u.studio_name, u.instrument, u.bio, u.avatar_url
       FROM invite_codes ic
       JOIN users u ON ic.teacher_id = u.id
       WHERE ic.code = $1 AND ic.is_active = true`,
      [code.toUpperCase()]
    );

    if (result.rows.length === 0) {
      return res.status(404).json(response(false, null, '此邀請代碼不存在或已失效'));
    }

    const invite = result.rows[0];

    // 檢查是否過期
    if (new Date(invite.expires_at) < new Date()) {
      // 自動標記為失效
      await db.query('UPDATE invite_codes SET is_active = false WHERE id = $1', [invite.id]);
      return res.status(410).json(response(false, null, '此邀請已過期，請向老師索取新代碼'));
    }

    res.json(response(true, {
      valid: true,
      teacher: {
        id: invite.teacher_user_id,
        displayName: invite.display_name || invite.name,
        studioName: invite.studio_name,
        instrument: invite.instrument,
        bio: invite.bio,
        avatarUrl: invite.avatar_url,
      },
      expiresAt: invite.expires_at,
    }));
  } catch (err) {
    console.error('Validate invite code error:', err);
    res.status(500).json(response(false, null, '驗證邀請代碼失敗'));
  }
});

// ============================================
// GET /api/invite-codes/me
// 取得目前老師的有效邀請代碼
// ============================================
router.get('/me', authenticateToken, requireRole('teacher'), async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM invite_codes WHERE teacher_id = $1 AND is_active = true AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1',
      [req.user.userId]
    );

    res.json(response(true, { inviteCode: result.rows[0] || null }));
  } catch (err) {
    console.error('Get my invite code error:', err);
    res.status(500).json(response(false, null, '取得邀請代碼失敗'));
  }
});

module.exports = router;
