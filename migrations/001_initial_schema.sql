-- 音樂小幫手 資料庫初始 Schema
-- 建立時間: 2026-05-04

-- ============================================
-- 1. 用戶表 (支援老師/學生/管理員)
-- ============================================
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255), -- 第三方登入時可能為 null
    name VARCHAR(100) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('teacher', 'student', 'admin')),
    avatar VARCHAR(10), -- 頭像縮寫，如 "林"
    phone VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE
);

-- 第三方登入帳號綁定
CREATE TABLE user_oauth_accounts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(20) NOT NULL CHECK (provider IN ('apple', 'google')),
    provider_user_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(provider, provider_user_id)
);

-- ============================================
-- 2. 老師資料表
-- ============================================
CREATE TABLE teachers (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    bio TEXT,
    specialties VARCHAR(255)[], -- 專長樂器陣列
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 3. 學生資料表
-- ============================================
CREATE TABLE students (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    instrument VARCHAR(50) NOT NULL,
    teacher_id INTEGER REFERENCES teachers(id),
    lessons_total INTEGER DEFAULT 0,
    lessons_used INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 4. 課程排程表
-- ============================================
CREATE TYPE lesson_status AS ENUM ('pending_student', 'confirmed', 'reschedule_requested', 'cancelled');

CREATE TABLE lessons (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    teacher_id INTEGER NOT NULL REFERENCES teachers(id),
    lesson_date DATE NOT NULL,
    lesson_time TIME NOT NULL,
    duration INTEGER NOT NULL DEFAULT 60, -- 分鐘
    status lesson_status DEFAULT 'pending_student',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 5. 改期申請表
-- ============================================
CREATE TYPE reschedule_status AS ENUM ('pending', 'accepted', 'rejected');

CREATE TABLE reschedule_requests (
    id SERIAL PRIMARY KEY,
    lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES students(id),
    requested_date DATE NOT NULL,
    requested_time TIME NOT NULL,
    reason TEXT,
    status reschedule_status DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 6. 出席紀錄表
-- ============================================
CREATE TYPE attendance_action AS ENUM ('present', 'absent', 'confirmed');

CREATE TABLE attendance_records (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    lesson_id INTEGER REFERENCES lessons(id),
    record_date DATE NOT NULL,
    teacher_action attendance_action,
    student_action attendance_action,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(student_id, record_date)
);

-- ============================================
-- 7. 課程堂數變更記錄
-- ============================================
CREATE TABLE lesson_credit_changes (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    teacher_id INTEGER NOT NULL REFERENCES teachers(id),
    change_amount INTEGER NOT NULL, -- 正數為新增，負數為扣減
    reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 8. 通知表
-- ============================================
CREATE TYPE notification_type AS ENUM ('warning', 'schedule', 'info', 'success', 'reschedule');

CREATE TABLE notifications (
    id SERIAL PRIMARY KEY,
    to_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_role VARCHAR(20) NOT NULL CHECK (to_role IN ('teacher', 'student')),
    title VARCHAR(255),
    content TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    type notification_type DEFAULT 'info',
    lesson_id INTEGER REFERENCES lessons(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 9. 登入紀錄表 (安全性)
-- ============================================
CREATE TABLE login_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    ip_address INET,
    user_agent TEXT,
    login_method VARCHAR(20) CHECK (login_method IN ('password', 'apple', 'google')),
    success BOOLEAN NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 索引設計
-- ============================================
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_students_teacher_id ON students(teacher_id);
CREATE INDEX idx_lessons_student_id ON lessons(student_id);
CREATE INDEX idx_lessons_teacher_id ON lessons(teacher_id);
CREATE INDEX idx_lessons_date ON lessons(lesson_date);
CREATE INDEX idx_lessons_status ON lessons(status);
CREATE INDEX idx_reschedule_lesson_id ON reschedule_requests(lesson_id);
CREATE INDEX idx_reschedule_status ON reschedule_requests(status);
CREATE INDEX idx_attendance_student_date ON attendance_records(student_id, record_date);
CREATE INDEX idx_notifications_user ON notifications(to_user_id, is_read);
CREATE INDEX idx_credit_changes_student ON lesson_credit_changes(student_id);
CREATE INDEX idx_login_logs_user ON login_logs(user_id, created_at);

-- ============================================
-- 資料表關係圖 (文字版)
-- ============================================
/*
users (用戶)
  ├── teachers (老師) 1:1
  ├── students (學生) 1:1
  │     ├── lessons (課程排程) 1:N
  │     ├── reschedule_requests (改期申請) 1:N
  │     ├── attendance_records (出席紀錄) 1:N
  │     └── lesson_credit_changes (堂數變更) 1:N
  └── notifications (通知) 1:N

lessons (課程)
  ├── reschedule_requests (改期申請) 1:1
  └── attendance_records (出席紀錄) 1:1
*/
