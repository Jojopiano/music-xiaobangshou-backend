-- ============================================
-- Migration 003: 師生配對與邀請系統 + 課程附件 + 老師個人資料
-- 建立時間: 2026-05-23
-- ============================================

-- ============================================
-- 1. 更新 users 表：新增老師個人資料欄位
-- ============================================
ALTER TABLE users
    ADD COLUMN display_name   VARCHAR(20),
    ADD COLUMN studio_name    VARCHAR(50),
    ADD COLUMN instrument     VARCHAR(30),
    ADD COLUMN bio            VARCHAR(150),
    ADD COLUMN avatar_url     TEXT;

-- ============================================
-- 2. 新增 invite_codes 表：邀請代碼
-- ============================================
CREATE TABLE invite_codes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code        VARCHAR(6) UNIQUE NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    is_active   BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 3. 新增 teacher_student_relationships 表：師生關係
-- ============================================
CREATE TYPE relationship_status AS ENUM ('pending', 'active', 'dissolved');

CREATE TABLE teacher_student_relationships (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    student_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status       relationship_status DEFAULT 'pending',
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    activated_at TIMESTAMPTZ,
    UNIQUE(teacher_id, student_id)
);

-- ============================================
-- 4. 新增 lesson_attachments 表：課程附件
-- ============================================
CREATE TABLE lesson_attachments (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lesson_id    INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    uploader_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    file_name    TEXT NOT NULL,
    file_url     TEXT NOT NULL,
    file_type    VARCHAR(10) NOT NULL CHECK (file_type IN ('pdf', 'jpeg', 'png', 'heic')),
    file_size_kb INTEGER,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 5. 索引設計
-- ============================================
CREATE INDEX idx_invite_codes_code ON invite_codes(code);
CREATE INDEX idx_invite_codes_teacher ON invite_codes(teacher_id, is_active);
CREATE INDEX idx_invite_codes_expires ON invite_codes(expires_at);
CREATE INDEX idx_relationships_teacher ON teacher_student_relationships(teacher_id, status);
CREATE INDEX idx_relationships_student ON teacher_student_relationships(student_id, status);
CREATE INDEX idx_lesson_attachments_lesson ON lesson_attachments(lesson_id);
CREATE INDEX idx_lesson_attachments_uploader ON lesson_attachments(uploader_id);
