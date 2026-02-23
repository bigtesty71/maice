const mysql = require('mysql2/promise');
require('dotenv').config();

async function check() {
    const pool = mysql.createPool({
        host: process.env.MYSQL_HOST,
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASSWORD,
        database: process.env.MYSQL_DATABASE,
        ssl: { rejectUnauthorized: false }
    });

    try {
        console.log('--- Sifter & Experience Memory Check ---');

        const [experiences] = await pool.execute('SELECT content, timestamp FROM experience_memory ORDER BY timestamp DESC LIMIT 30');
        console.log('\n--- Recent Experience Memory (Full) ---');
        experiences.forEach(e => {
            console.log(`[${e.timestamp.toISOString()}]`);
            console.log(e.content);
            console.log('---');
        });

        const [sifter] = await pool.execute("SELECT content, timestamp FROM experience_memory WHERE content LIKE '%Sifter Pattern%' ORDER BY timestamp DESC LIMIT 10");
        console.log('\n--- Recent Sifter Patterns ---');
        sifter.forEach(s => {
            console.log(`[${s.timestamp.toISOString()}] ${s.content}`);
        });

        const [visitor] = await pool.execute('SELECT name, email, last_seen FROM visitors ORDER BY last_seen DESC LIMIT 5');
        console.log('\nRecent Visitors:');
        visitor.forEach(v => console.log(`[${v.last_seen}] ${v.name} (${v.email})`));

    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

check();
