// db/database.js - PostgreSQL версия
const { Pool } = require('pg');

// Подключение к PostgreSQL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

console.log('📁 Database: PostgreSQL');
console.log('🔗 Connection:', process.env.DATABASE_URL ? 'configured' : 'NOT CONFIGURED!');

// Хелпер для выполнения запросов (совместимость с SQLite API)
function getDatabase() {
    return {
        run: (sql, params, callback) => {
            // Конвертируем ? в $1, $2, etc для PostgreSQL
            let pgSql = sql;
            let paramIndex = 0;
            pgSql = pgSql.replace(/\?/g, () => `$${++paramIndex}`);
            
            // Убираем SQLite специфичные вещи
            pgSql = pgSql.replace(/INTEGER PRIMARY KEY AUTOINCREMENT/g, 'SERIAL PRIMARY KEY');
            pgSql = pgSql.replace(/datetime\('now'\)/g, 'NOW()');
            pgSql = pgSql.replace(/INSERT OR IGNORE/g, 'INSERT');
            pgSql = pgSql.replace(/INSERT OR REPLACE/g, 'INSERT');
            
            pool.query(pgSql, params)
                .then(result => {
                    if (callback) {
                        callback.call({ lastID: result.rows[0]?.id, changes: result.rowCount }, null);
                    }
                })
                .catch(err => {
                    console.error('❌ DB run error:', err.message);
                    if (callback) callback(err);
                });
        },
        
        get: (sql, params, callback) => {
            let pgSql = sql;
            let paramIndex = 0;
            pgSql = pgSql.replace(/\?/g, () => `$${++paramIndex}`);
            
            pool.query(pgSql, params)
                .then(result => {
                    if (callback) callback(null, result.rows[0]);
                })
                .catch(err => {
                    console.error('❌ DB get error:', err.message);
                    if (callback) callback(err);
                });
        },
        
        all: (sql, params, callback) => {
            let pgSql = sql;
            let paramIndex = 0;
            pgSql = pgSql.replace(/\?/g, () => `$${++paramIndex}`);
            
            pool.query(pgSql, params)
                .then(result => {
                    if (callback) callback(null, result.rows);
                })
                .catch(err => {
                    console.error('❌ DB all error:', err.message);
                    if (callback) callback(err);
                });
        },
        
        serialize: (fn) => fn()
    };
}

async function initDatabase() {
    console.log('🔄 Инициализация PostgreSQL...');
    
    try {
        // Проверяем подключение
        await pool.query('SELECT NOW()');
        console.log('✅ PostgreSQL подключен');
        
        // Создаём таблицы
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                telegram_id TEXT UNIQUE NOT NULL,
                name TEXT DEFAULT 'Пользователь',
                username TEXT DEFAULT '',
                initial TEXT DEFAULT 'П',
                karma INTEGER DEFAULT 0,
                stats_published INTEGER DEFAULT 0,
                stats_taken INTEGER DEFAULT 0,
                stats_saved_kg INTEGER DEFAULT 0,
                stats_fast_pickups INTEGER DEFAULT 0,
                stats_thanks INTEGER DEFAULT 0,
                stats_reliability INTEGER DEFAULT 100,
                achievements TEXT DEFAULT '[]',
                items_count INTEGER DEFAULT 0,
                created_at BIGINT NOT NULL,
                updated_at BIGINT NOT NULL
            )
        `);
        console.log('✅ Таблица users создана');
        
        await pool.query(`
            CREATE TABLE IF NOT EXISTS items (
                id SERIAL PRIMARY KEY,
                telegram_id TEXT NOT NULL,
                title TEXT NOT NULL,
                description TEXT DEFAULT '',
                category TEXT DEFAULT 'other',
                condition TEXT DEFAULT 'good',
                latitude REAL,
                longitude REAL,
                address TEXT DEFAULT '',
                photo_url TEXT DEFAULT '',
                status TEXT DEFAULT 'active',
                views INTEGER DEFAULT 0,
                reports_count INTEGER DEFAULT 0,
                expires_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW(),
                taken_by TEXT,
                taken_at TIMESTAMP
            )
        `);
        console.log('✅ Таблица items создана');
        
        await pool.query(`
            CREATE TABLE IF NOT EXISTS admins (
                id SERIAL PRIMARY KEY,
                telegram_id TEXT UNIQUE NOT NULL,
                is_creator INTEGER DEFAULT 0,
                created_by INTEGER,
                created_at BIGINT NOT NULL
            )
        `);
        console.log('✅ Таблица admins создана');
        
        await pool.query(`
            CREATE TABLE IF NOT EXISTS reports (
                id SERIAL PRIMARY KEY,
                item_id INTEGER NOT NULL,
                reporter_id INTEGER NOT NULL,
                reason TEXT NOT NULL,
                status TEXT DEFAULT 'pending',
                created_at BIGINT NOT NULL,
                updated_at BIGINT NOT NULL
            )
        `);
        console.log('✅ Таблица reports создана');
        
        await pool.query(`
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT,
                updated_at BIGINT NOT NULL
            )
        `);
        console.log('✅ Таблица settings создана');
        
        // Настройки по умолчанию
        const now = Date.now();
        const defaultSettings = [
            ['item_lifetime_hours', '6'],
            ['karma_publish', '10'],
            ['karma_taken', '25'],
            ['karma_extend', '2'],
            ['karma_thanks', '5'],
            ['auto_hide_reports', '3'],
            ['require_photo', '0'],
            ['pre_moderation', '0']
        ];
        
        for (const [key, value] of defaultSettings) {
            await pool.query(
                `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, $3) ON CONFLICT (key) DO NOTHING`,
                [key, value, now]
            );
        }
        console.log('✅ Настройки по умолчанию инициализированы');
        
        // Создаём индексы
        await pool.query('CREATE INDEX IF NOT EXISTS idx_items_status ON items(status)').catch(() => {});
        await pool.query('CREATE INDEX IF NOT EXISTS idx_items_telegram_id ON items(telegram_id)').catch(() => {});
        await pool.query('CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id)').catch(() => {});
        await pool.query('CREATE INDEX IF NOT EXISTS idx_admins_telegram_id ON admins(telegram_id)').catch(() => {});
        
        console.log('✅ PostgreSQL инициализирован');
        
    } catch (error) {
        console.error('❌ Ошибка инициализации PostgreSQL:', error);
        throw error;
    }
}

function closeDatabase() {
    pool.end()
        .then(() => console.log('✅ PostgreSQL отключен'))
        .catch(err => console.error('❌ Ошибка отключения:', err));
}

// Graceful shutdown
process.on('SIGINT', () => {
    closeDatabase();
    process.exit(0);
});

process.on('SIGTERM', () => {
    closeDatabase();
    process.exit(0);
});

module.exports = {
    getDatabase,
    initDatabase,
    closeDatabase,
    pool // Экспортируем pool для прямых запросов если нужно
};
