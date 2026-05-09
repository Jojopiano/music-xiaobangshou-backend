const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');

const response = (success, data = null, error = null) => ({
  success,
  data,
  error,
});

// 取得學生列表（老師權限）
router.get('/', authenticateToken, requireRole('teacher'), async (req, res) => {
  try {
    const result = await db.query(`
      SELECT s.id, s.user_id, s.instrument, s.lessons_total, s.lessons_used,
             u.name, u.avatar, u.email
      FROM students s
      JOIN users u ON s.user_id = u.id
      WHERE s.teacher_id = (SELECT id FROM teachers WHERE user_id = $1)
      ORDER BY u.name
    `, [req.user.userId]);

    res.json(response(true, { students: result.rows }));
  } catch (err) {
    console.error('Get students error:', err);
    res.status(500).json(response(false, null, '取得學生列表失敗'));
  }
});

// 取得單一學生
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(`
      SELECT s.id, s.user_id, s.instrument, s.lessons_total, s.lessons_used,
             u.name, u.avatar, u.email, u.phone
      FROM students s
      JOIN users u ON s.user_id = u.id
      WHERE s.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json(response(false, null, '學生不存在'));
    }

    res.json(response(true, { student: result.rows[0] }));
  } catch (err) {
    console.error('Get student error:', err);
    res.status(500).json(response(false, null, '取得學生資訊失敗'));
  }
});

// 新增學生（老師權限）
router.post('/', authenticateToken, requireRole('teacher'), async (req, res) => {
  try {
    const { name, email, instrument, lessonsTotal, phone } = req.body;

    if (!name || !email || !instrument) {
      return res.status(400).json(response(false, null, '缺少必要欄位'));
    }

    // 取得老師 ID
    const teacherResult = await db.query(
      'SELECT id FROM teachers WHERE user_id = $1',
      [req.user.userId]
    );

    if (teacherResult.rows.length === 0) {
      return res.status(403).json(response(false, null, '找不到老師資料'));
    }

    const teacherId = teacherResult.rows[0].id;

    // 建立用戶
    const userResult = await db.query(
      'INSERT INTO users (email, name, role, avatar, phone) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [email, name, 'student', name.charAt(0), phone]
    );

    const userId = userResult.rows[0].id;

    // 建立學生資料
    const studentResult = await db.query(
      'INSERT INTO students (user_id, teacher_id, instrument, lessons_total) VALUES ($1, $2, $3, $4) RETURNING *',
      [userId, teacherId, instrument, lessonsTotal || 0]
    );

    res.status(201).json(response(true, { student: studentResult.rows[0] }));
  } catch (err) {
    console.error('Create student error:', err);
    if (err.code === '23505') {
      return res.status(409).json(response(false, null, 'Email 已被使用'));
    }
    res.status(500).json(response(false, null, '新增學生失敗'));
  }
});

// 更新學生
router.put('/:id', authenticateToken, requireRole('teacher'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, instrument, lessonsTotal, phone } = req.body;

    // 取得學生的 user_id
    const studentResult = await db.query(
      'SELECT user_id FROM students WHERE id = $1',
      [id]
    );

    if (studentResult.rows.length === 0) {
      return res.status(404).json(response(false, null, '學生不存在'));
    }

    const userId = studentResult.rows[0].user_id;

    // 更新用戶資料
    if (name || phone) {
      await db.query(
        'UPDATE users SET name = COALESCE($1, name), phone = COALESCE($2, phone) WHERE id = $3',
        [name, phone, userId]
      );
    }

    // 更新學生資料
    const updatedResult = await db.query(
      'UPDATE students SET instrument = COALESCE($1, instrument), lessons_total = COALESCE($2, lessons_total) WHERE id = $3 RETURNING *',
      [instrument, lessonsTotal, id]
    );

    res.json(response(true, { student: updatedResult.rows[0] }));
  } catch (err) {
    console.error('Update student error:', err);
    res.status(500).json(response(false, null, '更新學生失敗'));
  }
});

// 刪除學生
router.delete('/:id', authenticateToken, requireRole('teacher'), async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      'DELETE FROM students WHERE id = $1 RETURNING user_id',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json(response(false, null, '學生不存在'));
    }

    // 軟刪除用戶
    await db.query(
      'UPDATE users SET is_active = false WHERE id = $1',
      [result.rows[0].user_id]
    );

    res.json(response(true, { message: '學生已刪除' }));
  } catch (err) {
    console.error('Delete student error:', err);
    res.status(500).json(response(false, null, '刪除學生失敗'));
  }
});

module.exports = router;
