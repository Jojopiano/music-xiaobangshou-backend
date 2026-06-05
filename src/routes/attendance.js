const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const response = (success, data = null, error = null) => ({
  success,
  data,
  error,
});

// 取得出席紀錄
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { studentId, dateFrom, dateTo } = req.query;
    let query = `
      SELECT a.*, s.user_id as student_user_id, u.name as student_name
      FROM attendance_records a
      JOIN students s ON a.student_id = s.id
      JOIN users u ON s.user_id = u.id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (req.user.role === 'student') {
      query += ` AND a.student_id = (SELECT id FROM students WHERE user_id = $${paramIndex})`;
      params.push(req.user.userId);
      paramIndex++;
    } else if (req.user.role === 'teacher' && studentId) {
      query += ` AND a.student_id = $${paramIndex}`;
      params.push(studentId);
      paramIndex++;
    }

    if (dateFrom) {
      query += ` AND a.record_date >= $${paramIndex}`;
      params.push(dateFrom);
      paramIndex++;
    }

    if (dateTo) {
      query += ` AND a.record_date <= $${paramIndex}`;
      params.push(dateTo);
      paramIndex++;
    }

    query += ' ORDER BY a.record_date DESC';

    const result = await db.query(query, params);
    res.json(response(true, { attendance: result.rows }));
  } catch (err) {
    console.error('Get attendance error:', err);
    res.status(500).json(response(false, null, '取得出席紀錄失敗'));
  }
});

// 新增/更新出席紀錄
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { studentId, recordDate, teacherAction, studentAction } = req.body;

    if (!studentId || !recordDate) {
      return res.status(400).json(response(false, null, '缺少必要欄位'));
    }

    // 前端傳 user_id，轉換成 students.id
    const studentRecord = await db.query(
      'SELECT id FROM students WHERE user_id = $1',
      [studentId]
    );
    if (studentRecord.rows.length === 0) {
      return res.status(404).json(response(false, null, '找不到學生資料'));
    }
    const studentDbId = studentRecord.rows[0].id;

    // 檢查是否已存在
    const existingResult = await db.query(
      'SELECT id FROM attendance_records WHERE student_id = $1 AND record_date = $2',
      [studentDbId, recordDate]
    );

    let result;
    if (existingResult.rows.length > 0) {
      // 更新
      const updateFields = [];
      const values = [];
      let paramIndex = 1;

      if (teacherAction !== undefined) {
        updateFields.push(`teacher_action = $${paramIndex}`);
        values.push(teacherAction);
        paramIndex++;
      }

      if (studentAction !== undefined) {
        updateFields.push(`student_action = $${paramIndex}`);
        values.push(studentAction);
        paramIndex++;
      }

      values.push(existingResult.rows[0].id);

      result = await db.query(
        `UPDATE attendance_records SET ${updateFields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
        values
      );
    } else {
      // 新增
      result = await db.query(
        'INSERT INTO attendance_records (student_id, record_date, teacher_action, student_action) VALUES ($1, $2, $3, $4) RETURNING *',
        [studentDbId, recordDate, teacherAction, studentAction]
      );
    }

    res.json(response(true, { attendance: result.rows[0] }));
  } catch (err) {
    console.error('Create/Update attendance error:', err);
    res.status(500).json(response(false, null, '新增/更新出席紀錄失敗'));
  }
});

module.exports = router;
