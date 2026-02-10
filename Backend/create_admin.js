const pool = require('./db');
const bcrypt = require('bcryptjs');

async function usage() {
  console.log('Usage: node create_admin.js <email> <password> "Full Name"');
  process.exit(1);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 3) return usage();
  const [email, password, fullname] = args;

    try {
    const hashed = await bcrypt.hash(password, 12);

    // Check if user exists
    const [rows] = await pool.execute('SELECT id FROM users WHERE email = ?', [email]);
    if (rows.length > 0) {
      const id = rows[0].id;
      await pool.execute('UPDATE users SET password = ?, fullname = ?, role = ?, is_admin = ? WHERE id = ?', [hashed, fullname, 'admin', 1, id]);
      console.log(`Updated existing user id=${id} as admin (${email}).`);
    } else {
      const [res] = await pool.execute('INSERT INTO users (fullname, email, password, role, is_admin) VALUES (?, ?, ?, ?, ?)', [fullname, email, hashed, 'admin', 1]);
      console.log(`Created admin user id=${res.insertId} (${email}).`);
    }

    process.exit(0);
  } catch (err) {
    console.error('Error creating admin:', err);
    process.exit(2);
  }
}

main();
