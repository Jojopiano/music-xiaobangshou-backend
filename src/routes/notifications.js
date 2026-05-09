const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const response = (success, data = null, error = null) => ({
  success,
  data,
  error,
});

// 取得通知
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { unreadOnly } = req.query;
    let query = `
      SELECT n.*, l.lesson_date, l.lesson_time
      FROM notifications n
      LEFT JOIN lessons l ON n.lesson_id = l.id
      WHERE n.to_user_id = $1
    `;
    const params = [req.user.userId];

    if (unreadOnly === 'true') {
      query += ' AND n.is_read = false';
    }

    query += ' ORDER BY n.created_at DESC';

    const result = await db.query(query, params);
    res.json(response(true, { notifications: result.rows }));
  } catch (err) {
    console.error('Get notifications error:', err);
    res.status(500).json(response(false, null, '取得通知失敗'));
  }
});

// 標記通知為已讀
router.put('/:id/read', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      'UPDATE notifications SET is_read = true WHERE id = $1 AND to_user_id = $2 RETURNING *',
      [id, req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json(response(false, null, '通知不存在'));
    }

    res.json(response(true, { notification: result.rows[0] }));
  } catch (err) {
    console.error('Mark notification read error:', err);
    res.status(500).json(response(false, null, '標記通知已讀失敗'));
  }
});

// 標記所有通知為已讀
router.put('/read-all', authenticateToken, async (req, res) => {
  try {
    await db.query(
      'UPDATE notifications SET is_read = true WHERE to_user_id = $1 AND is_read = false',
      [req.user.userId]
    );

    res.json(response(true, { message: '所有通知已標記為已讀' }));
  } catch (err) {
    console.error('Mark all notifications read error:', err);
    res.status(500).json(response(false, null, '標記所有通知已讀失敗'));
  }
});

module.exports = router;
