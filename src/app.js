const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/students', require('./routes/students'));
app.use('/api/lessons', require('./routes/lessons'));
app.use('/api/reschedule', require('./routes/reschedule'));
app.use('/api/attendance', require('./routes/attendance'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/invite-codes', require('./routes/inviteCodes'));
app.use('/api/relationships', require('./routes/relationships'));
app.use('/api/users', require('./routes/users'));

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, error: '找不到該資源' });
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  res.status(500).json({ success: false, error: '伺服器內部錯誤' });
});

module.exports = app;
