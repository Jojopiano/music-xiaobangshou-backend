const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');

const response = (success, data = null, error = null) => ({
  success,
  data,
  error,
});

// 取得改期申請
router.get('/', authenticateToken, async (req, res) => {
  try {
    let query = `
      SELECT r.*, u.name as student_name, l.lesson_date as original_date, l.lesson_time as original_time
      FROM reschedule_requests r
      JOIN students s ON r.student_id = s.id
      JOIN users u ON s.user_id = u.id
      JOIN lessons l ON r.lesson_id = l.id
      WHERE 1=1
    `;
    const params = [];

    if (req.user.role === 'student') {
      query += ' AND r.student_id = (SELECT id FROM students WHERE user_id = $1)';
      params.push(req.user.userId);
    } else if (req.user.role === 'teacher') {
      query += ' AND l.teacher_id = (SELECT id FROM teachers WHERE user_id = $1)';
      params.push(req.user.userId);
    }

    query += ' ORDER BY r.created_at DESC';

    const result = await db.query(query, params);
    res.json(response(true, { requests: result.rows }));
  } catch (err) {
    console.error('Get reschedule requests error:', err);
    res.status(500).json(response(false, null, '取得改期申請失敗'));
  }
});

// 提出改期申請
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { lessonId, requestedDate, requestedTime, reason } = req.body;

    if (!lessonId || !requestedDate || !requestedTime) {
      return res.status(400).json(response(false, null, '缺少必要欄位'));
    }

    // 取得學生 ID
    const studentResult = await db.query(
      'SELECT id FROM students WHERE user_id = $1',
      [req.user.userId]
    );

    if (studentResult.rows.length === 0) {
      return res.status(403).json(response(false, null, '找不到學生資料'));
    }

    const studentId = studentResult.rows[0].id;

    const result = await db.query(
      'INSERT INTO reschedule_requests (lesson_id, student_id, requested_date, requested_time, reason) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [lessonId, studentId, requestedDate, requestedTime, reason]
    );

    // 更新課程狀態
    await db.query(
      "UPDATE lessons SET status = 'reschedule_requested' WHERE id = $1",
      [lessonId]
    );

    res.status(201).json(response(true, { request: result.rows[0] }));
  } catch (err) {
    console.error('Create reschedule request error:', err);
    res.status(500).json(response(false, null, '提出改期申請失敗'));
  }
});

// 處理改期申請（接受/拒絕）
router.put('/:id', authenticateToken, requireRole('teacher'), async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['accepted', 'rejected'].includes(status)) {
      return res.status(400).json(response(false, null, '狀態必須是 accepted 或 rejected'));
    }

    const result = await db.query(
      'UPDATE reschedule_requests SET status = $1 WHERE id = $2 RETURNING *',
      [status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json(response(false, null, '改期申請不存在'));
    }

    const request = result.rows[0];

    // 如果接受，更新課程時間
    if (status === 'accepted') {
      await db.query(
        'UPDATE lessons SET lesson_date = $1, lesson_time = $2, status = $3 WHERE id = $4',
        [request.requested_date, request.requested_time, 'confirmed', request.lesson_id]
      );
    }

    res.json(response(true, { request: result.rows[0] }));
  } catch (err) {
    console.error('Update reschedule request error:', err);
    res.status(500).json(response(false, null, '處理改期申請失敗'));
  }
});

module.exports = router;
