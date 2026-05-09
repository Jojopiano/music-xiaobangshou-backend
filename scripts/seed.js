const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

const seed = fs.readFileSync(path.join(__dirname, '..', 'migrations', '002_seed_data.sql'), 'utf8');

pool.query(seed)
  .then(() => {
    console.log('✅ Seed data inserted successfully!');
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
  });
