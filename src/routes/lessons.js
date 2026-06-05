const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');

const response = (success, data = null, error = null) => ({
  success,
  data,
  error,
});

// 取得課程列表
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { studentId, dateFrom, dateTo, status } = req.query;
    let query = `
      SELECT l.*, u.name as student_name
      FROM lessons l
      JOIN students s ON l.student_id = s.id
      JOIN users u ON s.user_id = u.id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (req.user.role === 'student') {
      query += ` AND l.student_id = (SELECT id FROM students WHERE user_id = $${paramIndex})`;
      params.push(req.user.userId);
      paramIndex++;
    } else if (req.user.role === 'teacher') {
      query += ` AND l.teacher_id = (SELECT id FROM teachers WHERE user_id = $${paramIndex})`;
      params.push(req.user.userId);
      paramIndex++;
    }

    if (studentId) {
      query += ` AND l.student_id = $${paramIndex}`;
      params.push(studentId);
      paramIndex++;
    }

    if (dateFrom) {
      query += ` AND l.lesson_date >= $${paramIndex}`;
      params.push(dateFrom);
      paramIndex++;
    }

    if (dateTo) {
      query += ` AND l.lesson_date <= $${paramIndex}`;
      params.push(dateTo);
      paramIndex++;
    }

    if (status) {
      query += ` AND l.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    query += ' ORDER BY l.lesson_date, l.lesson_time';

    const result = await db.query(query, params);
    
    // 格式化日期為 YYYY-MM-DD
    const formattedLessons = result.rows.map(lesson => ({
      ...lesson,
      lesson_date: lesson.lesson_date instanceof Date 
        ? lesson.lesson_date.toISOString().split('T')[0]
        : lesson.lesson_date,
      lesson_time: lesson.lesson_time 
        ? lesson.lesson_time.toString().substring(0, 5)
        : lesson.lesson_time,
    }));
    
    res.json(response(true, { lessons: formattedLessons }));
  } catch (err) {
    console.error('Get lessons error:', err);
    res.status(500).json(response(false, null, '取得課程列表失敗'));
  }
});

// 新增課程
router.post('/', authenticateToken, requireRole('teacher'), async (req, res) => {
  try {
    const { studentId, lessonDate, lessonTime, duration } = req.body;

    if (!studentId || !lessonDate || !lessonTime) {
      return res.status(400).json(response(false, null, '缺少必要欄位'));
    }

    // 取得老師 ID
    const teacherResult = await db.query(
      'SELECT id FROM teachers WHERE user_id = $1',
      [req.user.userId]
    );

    let teacherId;
    if (teacherResult.rows.length === 0) {
      const inserted = await db.query(
        'INSERT INTO teachers (user_id) VALUES ($1) RETURNING id',
        [req.user.userId]
      );
      teacherId = inserted.rows[0].id;
    } else {
      teacherId = teacherResult.rows[0].id;
    }

    // 前端傳 user_id，轉換成 students.id
    const studentRecord = await db.query(
      'SELECT id, lessons_total, lessons_used FROM students WHERE user_id = $1',
      [studentId]
    );

    if (studentRecord.rows.length === 0) {
      return res.status(404).json(response(false, null, '學生不存在'));
    }

    const { id: studentDbId, lessons_total, lessons_used } = studentRecord.rows[0];

    if (lessons_used >= lessons_total) {
      return res.status(400).json(response(false, null, '學生剩餘堂數不足，請先新增堂數'));
    }

    // 建立課程
    const result = await db.query(
      'INSERT INTO lessons (student_id, teacher_id, lesson_date, lesson_time, duration) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [studentDbId, teacherId, lessonDate, lessonTime, duration || 60]
    );

    // 格式化回傳資料
    const lesson = result.rows[0];
    const formattedLesson = {
      ...lesson,
      lesson_date: lesson.lesson_date instanceof Date 
        ? lesson.lesson_date.toISOString().split('T')[0]
        : lesson.lesson_date,
      lesson_time: lesson.lesson_time 
        ? lesson.lesson_time.toString().substring(0, 5)
        : lesson.lesson_time,
    };

    res.status(201).json(response(true, { lesson: formattedLesson }));
  } catch (err) {
    console.error('Create lesson error:', err);
    res.status(500).json(response(false, null, '新增課程失敗'));
  }
});

// 更新課程
router.put('/:id', authenticateToken, requireRole('teacher'), async (req, res) => {
  try {
    const { id } = req.params;
    const { lessonDate, lessonTime, duration, status } = req.body;

    const result = await db.query(
      'UPDATE lessons SET lesson_date = COALESCE($1, lesson_date), lesson_time = COALESCE($2, lesson_time), duration = COALESCE($3, duration), status = COALESCE($4, status) WHERE id = $5 RETURNING *',
      [lessonDate, lessonTime, duration, status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json(response(false, null, '課程不存在'));
    }

    // 格式化回傳資料
    const lesson = result.rows[0];
    const formattedLesson = {
      ...lesson,
      lesson_date: lesson.lesson_date instanceof Date 
        ? lesson.lesson_date.toISOString().split('T')[0]
        : lesson.lesson_date,
      lesson_time: lesson.lesson_time 
        ? lesson.lesson_time.toString().substring(0, 5)
        : lesson.lesson_time,
    };

    res.json(response(true, { lesson: formattedLesson }));
  } catch (err) {
    console.error('Update lesson error:', err);
    res.status(500).json(response(false, null, '更新課程失敗'));
  }
});

// 刪除課程
router.delete('/:id', authenticateToken, requireRole('teacher'), async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      'DELETE FROM lessons WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json(response(false, null, '課程不存在'));
    }

    res.json(response(true, { message: '課程已刪除' }));
  } catch (err) {
    console.error('Delete lesson error:', err);
    res.status(500).json(response(false, null, '刪除課程失敗'));
  }
});

// 新增課程堂數
router.post('/credits', authenticateToken, requireRole('teacher'), async (req, res) => {
  try {
    const { studentId, amount, reason } = req.body;

    if (!studentId || !amount || amount <= 0) {
      return res.status(400).json(response(false, null, '缺少必要欄位或數量不正確'));
    }

    // 取得老師 ID
    const teacherResult = await db.query(
      'SELECT id FROM teachers WHERE user_id = $1',
      [req.user.userId]
    );

    let teacherId;
    if (teacherResult.rows.length === 0) {
      // 自動補建 teachers 記錄
      const inserted = await db.query(
        'INSERT INTO teachers (user_id) VALUES ($1) RETURNING id',
        [req.user.userId]
      );
      teacherId = inserted.rows[0].id;
    } else {
      teacherId = teacherResult.rows[0].id;
    }

    // 前端傳 user_id，需轉換成 students.id
    const studentRecord = await db.query(
      'SELECT id FROM students WHERE user_id = $1',
      [studentId]
    );

    if (studentRecord.rows.length === 0) {
      return res.status(404).json(response(false, null, '找不到學生資料'));
    }

    const studentDbId = studentRecord.rows[0].id;

    // 更新學生堂數
    await db.query(
      'UPDATE students SET lessons_total = lessons_total + $1 WHERE id = $2',
      [amount, studentDbId]
    );

    // 記錄變更
    const result = await db.query(
      'INSERT INTO lesson_credit_changes (student_id, teacher_id, change_amount, reason) VALUES ($1, $2, $3, $4) RETURNING *',
      [studentDbId, teacherId, amount, reason]
    );

    res.status(201).json(response(true, { creditChange: result.rows[0] }));
  } catch (err) {
    console.error('Add credits error:', err);
    res.status(500).json(response(false, null, '新增堂數失敗'));
  }
});

// 取得堂數變更紀錄
router.get('/credits/:studentId', authenticateToken, async (req, res) => {
  try {
    const { studentId } = req.params;

    const result = await db.query(
      'SELECT * FROM lesson_credit_changes WHERE student_id = $1 ORDER BY created_at DESC',
      [studentId]
    );

    res.json(response(true, { creditChanges: result.rows }));
  } catch (err) {
    console.error('Get credits error:', err);
    res.status(500).json(response(false, null, '取得堂數紀錄失敗'));
  }
});

module.exports = router;
