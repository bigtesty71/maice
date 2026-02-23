const mysql = require('mysql2/promise');
require('dotenv').config();

async function upgrade() {
    console.log('--- Database Schema Upgrade ---');
    const pool = mysql.createPool({
        host: process.env.MYSQL_HOST,
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASSWORD,
        database: process.env.MYSQL_DATABASE,
        ssl: { rejectUnauthorized: false }
    });

    try {
        console.log('Upgrading experience_memory.content to LONGTEXT...');
        await pool.execute("ALTER TABLE experience_memory MODIFY COLUMN content LONGTEXT");
        console.log('✅ Upgrade successful.');
    } catch (e) {
        console.error('❌ Upgrade failed:', e.message);
    } finally {
        await pool.end();
    }
}

upgrade();
