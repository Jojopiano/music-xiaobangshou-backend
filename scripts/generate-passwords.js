const bcrypt = require('bcrypt');

async function generatePasswords() {
  const passwords = [
    { email: 'teacher@test.com', password: '123456' },
    { email: 'lin@test.com', password: '123456' },
    { email: 'zhang@test.com', password: '123456' },
    { email: 'chen@test.com', password: '123456' },
    { email: 'liu@test.com', password: '123456' },
  ];

  console.log('-- 產生的密碼雜湊（請複製到 002_seed_data.sql）\n');
  
  for (const { email, password } of passwords) {
    const hash = await bcrypt.hash(password, 10);
    console.log(`-- ${email} / ${password}`);
    console.log(`UPDATE users SET password_hash = '${hash}' WHERE email = '${email}';`);
    console.log();
  }
}

generatePasswords().catch(console.error);
