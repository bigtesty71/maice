const mysql = require('mysql2/promise');
require('dotenv').config();

async function testDB() {
    console.log('--- DB Handshake Test ---');
    console.log(`Host: ${process.env.MYSQL_HOST || '82.197.82.158'}`);
    console.log(`User: ${process.env.MYSQL_USER}`);
    console.log(`DB: ${process.env.MYSQL_DATABASE}`);

    const pool = mysql.createPool({
        host: process.env.MYSQL_HOST || '82.197.82.158',
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASSWORD,
        database: process.env.MYSQL_DATABASE,
        waitForConnections: true,
        connectionLimit: 1,
        connectTimeout: 5000
    });

    try {
        const start = Date.now();
        const [rows] = await pool.execute('SHOW TABLES');
        const end = Date.now();
        console.log(`Connection successful in ${end - start}ms!`);
        console.log('Tables found:');
        rows.forEach(r => console.log(` - ${Object.values(r)[0]}`));

        const [[count]] = await pool.execute('SELECT COUNT(*) as count FROM experience_memory');
        console.log(`\nExperience Memory Count: ${count.count}`);

    } catch (err) {
        console.log('\n❌ CONNECTION FAILED:');
        console.error(err);
    } finally {
        await pool.end();
    }
}

testDB();
