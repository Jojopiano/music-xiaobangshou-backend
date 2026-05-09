const pool = require('../config/database');
const { success, error } = require('../utils/response');
const { isNonEmptyString, isPositiveInteger } = require('../utils/validators');

// GET /api/students
const getStudents = async (req, res) => {
  try {
    const { teacherId, search, page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let query = `
      SELECT s.id, s.user_id, s.instrument, s.teacher_id, s.lessons_total, s.lessons_used,
             u.name, u.email, u.phone, u.avatar, u.is_active,
             t.user_id as teacher_user_id, tu.name as teacher_name
      FROM students s
      JOIN users u ON s.user_id = u.id
      LEFT JOIN teachers t ON s.teacher_id = t.id
      LEFT JOIN users tu ON t.user_id = tu.id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (teacherId) {
      query += ` AND s.teacher_id = $${paramIndex}`;
      params.push(Number(teacherId));
      paramIndex++;
    }

    if (search) {
      query += ` AND (u.name ILIKE $${paramIndex} OR u.email ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    query += ` ORDER BY u.name LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(Number(limit), offset);

    const result = await pool.query(query, params);

    // 取得總數
    let countQuery = `SELECT COUNT(*) FROM students s JOIN users u ON s.user_id = u.id WHERE 1=1`;
    const countParams = [];
    let countIndex = 1;

    if (teacherId) {
      countQuery += ` AND s.teacher_id = $${countIndex}`;
      countParams.push(Number(teacherId));
      countIndex++;
    }
    if (search) {
      countQuery += ` AND (u.name ILIKE $${countIndex} OR u.email ILIKE $${countIndex})`;
      countParams.push(`%${search}%`);
    }

    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count, 10);

    res.json(success({
      students: result.rows,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
    }));
  } catch (err) {
    console.error('Get students error:', err);
    res.status(500).json(error('Failed to fetch students'));
  }
};

// GET /api/students/:id
const getStudent = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isPositiveInteger(id)) {
      return res.status(400).json(error('Invalid student ID'));
    }

    const result = await pool.query(
      `SELECT s.id, s.user_id, s.instrument, s.teacher_id, s.lessons_total, s.lessons_used,
              s.created_at, s.updated_at,
              u.name, u.email, u.phone, u.avatar, u.is_active,
              t.user_id as teacher_user_id, tu.name as teacher_name
       FROM students s
       JOIN users u ON s.user_id = u.id
       LEFT JOIN teachers t ON s.teacher_id = t.id
       LEFT JOIN users tu ON t.user_id = tu.id
       WHERE s.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json(error('Student not found'));
    }

    res.json(success(result.rows[0]));
  } catch (err) {
    console.error('Get student error:', err);
    res.status(500).json(error('Failed to fetch student'));
  }
};

// POST /api/students
const createStudent = async (req, res) => {
  try {
    const { name, email, instrument, phone, teacherId, password } = req.body;

    if (!isNonEmptyString(name)) {
      return res.status(400).json(error('Name is required'));
    }
    if (!isNonEmptyString(instrument)) {
      return res.status(400).json(error('Instrument is required'));
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 建立用戶
      const userPassword = password || 'changeme123';
      const bcrypt = require('bcrypt');
      const passwordHash = await bcrypt.hash(userPassword, 10);

      let userEmail = email;
      if (!userEmail) {
        // 產生臨時 email
        userEmail = `student_${Date.now()}@temp.local`;
      }

      const userResult = await client.query(
        `INSERT INTO users (email, password_hash, name, role, phone, avatar)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [userEmail, passwordHash, name, 'student', phone || null, name.charAt(0).toUpperCase()]
      );

      const userId = userResult.rows[0].id;

      // 建立學生記錄
      const studentResult = await client.query(
        `INSERT INTO students (user_id, instrument, teacher_id)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [userId, instrument, teacherId || null]
      );

      await client.query('COMMIT');

      res.status(201).json(success({
        id: studentResult.rows[0].id,
        userId,
        name,
        email: userEmail,
        instrument,
        teacherId: teacherId || null,
      }));
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Create student error:', err);
    if (err.code === '23505') {
      return res.status(409).json(error('Email already exists'));
    }
    res.status(500).json(error('Failed to create student'));
  }
};

// PUT /api/students/:id
const updateStudent = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, instrument, phone, teacherId, isActive } = req.body;

    if (!isPositiveInteger(id)) {
      return res.status(400).json(error('Invalid student ID'));
    }

    // 取得學生對應的 user_id
    const studentResult = await pool.query(
      'SELECT user_id FROM students WHERE id = $1',
      [id]
    );

    if (studentResult.rows.length === 0) {
      return res.status(404).json(error('Student not found'));
    }

    const userId = studentResult.rows[0].user_id;

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 更新 users 表
      const userUpdates = [];
      const userParams = [];
      let paramIndex = 1;

      if (isNonEmptyString(name)) {
        userUpdates.push(`name = $${paramIndex}`);
        userParams.push(name);
        paramIndex++;
      }
      if (email !== undefined) {
        userUpdates.push(`email = $${paramIndex}`);
        userParams.push(email);
        paramIndex++;
      }
      if (phone !== undefined) {
        userUpdates.push(`phone = $${paramIndex}`);
        userParams.push(phone);
        paramIndex++;
      }
      if (isActive !== undefined) {
        userUpdates.push(`is_active = $${paramIndex}`);
        userParams.push(isActive);
        paramIndex++;
      }

      if (userUpdates.length > 0) {
        userParams.push(userId);
        await client.query(
          `UPDATE users SET ${userUpdates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${paramIndex}`,
          userParams
        );
      }

      // 更新 students 表
      const studentUpdates = [];
      const studentParams = [];
      let sParamIndex = 1;

      if (isNonEmptyString(instrument)) {
        studentUpdates.push(`instrument = $${sParamIndex}`);
        studentParams.push(instrument);
        sParamIndex++;
      }
      if (teacherId !== undefined) {
        studentUpdates.push(`teacher_id = $${sParamIndex}`);
        studentParams.push(teacherId);
        sParamIndex++;
      }

      if (studentUpdates.length > 0) {
        studentParams.push(id);
        await client.query(
          `UPDATE students SET ${studentUpdates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${sParamIndex}`,
          studentParams
        );
      }

      await client.query('COMMIT');

      res.json(success({ message: 'Student updated successfully' }));
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Update student error:', err);
    if (err.code === '23505') {
      return res.status(409).json(error('Email already exists'));
    }
    res.status(500).json(error('Failed to update student'));
  }
};

// DELETE /api/students/:id
const deleteStudent = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isPositiveInteger(id)) {
      return res.status(400).json(error('Invalid student ID'));
    }

    const result = await pool.query(
      'DELETE FROM students WHERE id = $1 RETURNING user_id',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json(error('Student not found'));
    }

    // 連帶刪除用戶（CASCADE 會自動處理相關資料）
    await pool.query('DELETE FROM users WHERE id = $1', [result.rows[0].user_id]);

    res.json(success({ message: 'Student deleted successfully' }));
  } catch (err) {
    console.error('Delete student error:', err);
    res.status(500).json(error('Failed to delete student'));
  }
};

module.exports = {
  getStudents,
  getStudent,
  createStudent,
  updateStudent,
  deleteStudent,
};
