const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');

const response = (success, data = null, error = null) => ({
  success,
  data,
  error,
});

// ============================================
// POST /api/relationships
// 學生確認配對（使用邀請代碼）
// ============================================
router.post('/', authenticateToken, requireRole('student'), async (req, res) => {
  try {
    const { code } = req.body;
    const studentId = req.user.userId;

    if (!code || code.length !== 6) {
      return res.status(400).json(response(false, null, '請提供有效的邀請代碼'));
    }

    // 查詢邀請代碼
    const inviteResult = await db.query(
      `SELECT ic.*, u.id as teacher_user_id
       FROM invite_codes ic
       JOIN users u ON ic.teacher_id = u.id
       WHERE ic.code = $1 AND ic.is_active = true`,
      [code.toUpperCase()]
    );

    if (inviteResult.rows.length === 0) {
      return res.status(404).json(response(false, null, '此邀請代碼不存在或已失效'));
    }

    const invite = inviteResult.rows[0];

    // 檢查是否過期
    if (new Date(invite.expires_at) < new Date()) {
      await db.query('UPDATE invite_codes SET is_active = false WHERE id = $1', [invite.id]);
      return res.status(410).json(response(false, null, '此邀請已過期，請向老師索取新代碼'));
    }

    const teacherId = invite.teacher_user_id;

    // 防止自我配對
    if (teacherId === studentId) {
      return res.status(400).json(response(false, null, '無法與自己建立配對關係'));
    }

    // 檢查是否已與該老師配對
    const existingResult = await db.query(
      `SELECT id, status FROM teacher_student_relationships
       WHERE teacher_id = $1 AND student_id = $2`,
      [teacherId, studentId]
    );

    if (existingResult.rows.length > 0) {
      const existing = existingResult.rows[0];
      if (existing.status === 'active') {
        return res.status(409).json(response(false, null, '你已經是這位老師的學生了'));
      }
      if (existing.status === 'pending') {
        // 更新為 active
        await db.query(
          `UPDATE teacher_student_relationships
           SET status = 'active', activated_at = NOW()
           WHERE id = $1`,
          [existing.id]
        );
        return res.json(response(true, { message: '配對成功', relationshipId: existing.id }));
      }
      // dissolved 的話，建立新的
    }

    // 建立新配對關係
    const result = await db.query(
      `INSERT INTO teacher_student_relationships (teacher_id, student_id, status, activated_at)
       VALUES ($1, $2, 'active', NOW()) RETURNING *`,
      [teacherId, studentId]
    );

    res.status(201).json(response(true, { relationship: result.rows[0] }));
  } catch (err) {
    console.error('Create relationship error:', err);
    if (err.code === '23505') {
      return res.status(409).json(response(false, null, '你已經與這位老師建立了關係'));
    }
    res.status(500).json(response(false, null, '建立配對關係失敗'));
  }
});

// ============================================
// GET /api/relationships
// 取得配對關係列表
// 老師：看到自己的學生
// 學生：看到自己的老師
// ============================================
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const userRole = req.user.role;

    let query;
    let params;

    if (userRole === 'teacher') {
      query = `
        SELECT tsr.*,
               u.id as related_user_id,
               u.name as related_name,
               u.display_name as related_display_name,
               u.email as related_email,
               u.avatar_url as related_avatar_url,
               s.lessons_total,
               s.lessons_used
        FROM teacher_student_relationships tsr
        JOIN users u ON tsr.student_id = u.id
        LEFT JOIN students s ON s.user_id = u.id
        WHERE tsr.teacher_id = $1 AND tsr.status = 'active'
        ORDER BY tsr.activated_at DESC
      `;
      params = [userId];
    } else {
      query = `
        SELECT tsr.*,
               u.id as related_user_id,
               u.name as related_name,
               u.display_name as related_display_name,
               u.studio_name as related_studio_name,
               u.instrument as related_instrument,
               u.bio as related_bio,
               u.avatar_url as related_avatar_url
        FROM teacher_student_relationships tsr
        JOIN users u ON tsr.teacher_id = u.id
        WHERE tsr.student_id = $1 AND tsr.status = 'active'
        ORDER BY tsr.activated_at DESC
      `;
      params = [userId];
    }

    const result = await db.query(query, params);

    res.json(response(true, { relationships: result.rows }));
  } catch (err) {
    console.error('Get relationships error:', err);
    res.status(500).json(response(false, null, '取得配對關係失敗'));
  }
});

// ============================================
// DELETE /api/relationships/:id
// 解除配對（軟刪除：status 改為 dissolved）
// ============================================
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const userRole = req.user.role;

    // 確認關係存在且用戶有權限
    let checkQuery;
    if (userRole === 'teacher') {
      checkQuery = 'SELECT * FROM teacher_student_relationships WHERE id = $1 AND teacher_id = $2';
    } else {
      checkQuery = 'SELECT * FROM teacher_student_relationships WHERE id = $1 AND student_id = $2';
    }

    const checkResult = await db.query(checkQuery, [id, userId]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json(response(false, null, '找不到該配對關係或無權限'));
    }

    const relationship = checkResult.rows[0];

    if (relationship.status === 'dissolved') {
      return res.status(400).json(response(false, null, '此配對關係已解除'));
    }

    // 軟刪除：更新狀態為 dissolved
    await db.query(
      "UPDATE teacher_student_relationships SET status = 'dissolved' WHERE id = $1",
      [id]
    );

    res.json(response(true, { message: '配對關係已解除' }));
  } catch (err) {
    console.error('Delete relationship error:', err);
    res.status(500).json(response(false, null, '解除配對關係失敗'));
  }
});

module.exports = router;
