const mysql = require('mysql2/promise');
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

if (!process.env.DB_USER) {
    throw new Error('DB_USER is required. Configure it in Backend/.env.');
}

if (process.env.DB_PASSWORD === undefined) {
    throw new Error('DB_PASSWORD is required. Configure it in Backend/.env.');
}

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || '3306',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'eloncred_db',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

module.exports = pool;
