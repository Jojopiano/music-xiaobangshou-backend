-- 音樂小幫手 測試資料
-- 建立時間: 2026-05-04
-- 密碼: 123456

-- 建立老師帳號
INSERT INTO users (email, password_hash, name, role, avatar)
VALUES ('teacher@test.com', '$2b$10$ReYqT76l.JDk9sKLJKXxHeq1Uc/dbbgLw5lsrun9ivfP63sboChW6', '王老師', 'teacher', '王')
ON CONFLICT (email) DO NOTHING;

-- 建立老師資料
INSERT INTO teachers (user_id)
SELECT id FROM users WHERE email = 'teacher@test.com'
ON CONFLICT DO NOTHING;

-- 建立學生帳號
INSERT INTO users (email, password_hash, name, role, avatar, phone)
VALUES 
    ('lin@test.com', '$2b$10$m2FGn69wwqIw1nBPSfR9uuRw/9FZTXhwCl10pNQhOc8HzvfasuaWO', '林小美', 'student', '林', '0912-345-678'),
    ('zhang@test.com', '$2b$10$iqDGOraQkabL2KIPii8MHeof/cPjq6kTDdpqoWQHopXijWl5OdtvO', '張大偉', 'student', '張', '0923-456-789'),
    ('chen@test.com', '$2b$10$b.gb.STlFgLglbxxP1zMN.PRUHFkKzMUGXnhmC1HQsU93x1ZUdX.e', '陳思婷', 'student', '陳', '0934-567-890'),
    ('liu@test.com', '$2b$10$J0I2q67q5ExYCU5sWRJazuYAUlmjbGiqRsrIy1CpX0QBU0KmOwpBW', '劉建宏', 'student', '劉', '0945-678-901')
ON CONFLICT (email) DO NOTHING;

-- 建立學生資料
INSERT INTO students (user_id, teacher_id, instrument, lessons_total, lessons_used)
SELECT 
    u.id,
    t.id,
    CASE u.name
        WHEN '林小美' THEN '鋼琴'
        WHEN '張大偉' THEN '吉他'
        WHEN '陳思婷' THEN '小提琴'
        WHEN '劉建宏' THEN '鼓'
    END,
    CASE u.name
        WHEN '林小美' THEN 20
        WHEN '張大偉' THEN 12
        WHEN '陳思婷' THEN 16
        WHEN '劉建宏' THEN 10
    END,
    0
FROM users u
CROSS JOIN (SELECT id FROM teachers WHERE user_id = (SELECT id FROM users WHERE email = 'teacher@test.com')) t
WHERE u.role = 'student'
ON CONFLICT (user_id) DO NOTHING;

-- 建立課程排程
INSERT INTO lessons (student_id, teacher_id, lesson_date, lesson_time, duration, status)
SELECT 
    s.id,
    s.teacher_id,
    '2026-05-05',
    '10:00',
    60,
    'pending_student'
FROM students s
JOIN users u ON s.user_id = u.id
WHERE u.name = '林小美'
ON CONFLICT DO NOTHING;

INSERT INTO lessons (student_id, teacher_id, lesson_date, lesson_time, duration, status)
SELECT 
    s.id,
    s.teacher_id,
    '2026-05-05',
    '11:30',
    45,
    'pending_student'
FROM students s
JOIN users u ON s.user_id = u.id
WHERE u.name = '陳思婷'
ON CONFLICT DO NOTHING;

INSERT INTO lessons (student_id, teacher_id, lesson_date, lesson_time, duration, status)
SELECT 
    s.id,
    s.teacher_id,
    '2026-05-06',
    '14:00',
    60,
    'pending_student'
FROM students s
JOIN users u ON s.user_id = u.id
WHERE u.name = '張大偉'
ON CONFLICT DO NOTHING;

-- 建立通知
INSERT INTO notifications (to_user_id, to_role, title, content, is_read, type)
SELECT 
    u.id,
    'student',
    '課程提醒',
    '您有一堂課程即將開始，請準時到達',
    false,
    'schedule'
FROM users u
WHERE u.name = '林小美'
ON CONFLICT DO NOTHING;
