// db/database.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Путь к БД
const dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'pomoechka.db');
const dbDir = path.dirname(dbPath);

// Создаем директорию если не существует
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

console.log('📁 Database path:', dbPath);

let db = null;

function getDatabase() {
    if (!db) {
        db = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                console.error('❌ Ошибка подключения к БД:', err);
                process.exit(1);
            } else {
                console.log('✅ SQLite подключен');
            }
        });
    }
    return db;
}

async function initDatabase() {
    return new Promise((resolve, reject) => {
        const database = getDatabase();
        
        database.serialize(() => {
            console.log('🔄 Инициализация базы данных...');
            
            // Включаем foreign keys
            database.run('PRAGMA foreign_keys = ON');
            
            // Таблица пользователей
            database.run(`
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
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
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL
                )
            `, (err) => {
                if (err) {
                    console.error('❌ Ошибка создания users:', err);
                    reject(err);
                } else {
                    console.log('✅ Таблица users создана');
                }
            });
            
            // Таблица объявлений (упрощенная схема с telegram_id)
            database.run(`
                CREATE TABLE IF NOT EXISTS items (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
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
                    expires_at TEXT,
                    created_at TEXT DEFAULT (datetime('now')),
                    updated_at TEXT DEFAULT (datetime('now')),
                    taken_by TEXT,
                    taken_at TEXT
                )
            `, (err) => {
                if (err) {
                    console.error('❌ Ошибка создания items:', err);
                    reject(err);
                } else {
                    console.log('✅ Таблица items создана');
                }
            });
            
            // Таблица админов
            database.run(`
                CREATE TABLE IF NOT EXISTS admins (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    telegram_id TEXT UNIQUE NOT NULL,
                    is_creator INTEGER DEFAULT 0,
                    created_by INTEGER,
                    created_at INTEGER NOT NULL,
                    FOREIGN KEY (created_by) REFERENCES admins(id)
                )
            `, (err) => {
                if (err) {
                    console.error('❌ Ошибка создания admins:', err);
                    reject(err);
                } else {
                    console.log('✅ Таблица admins создана');
                }
            });
            
            // Таблица жалоб (совместима с routes/reports.js)
            database.run(`
                CREATE TABLE IF NOT EXISTS reports (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    item_id INTEGER NOT NULL,
                    reporter_id INTEGER NOT NULL,
                    reason TEXT NOT NULL,
                    status TEXT DEFAULT 'pending',
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL,
                    FOREIGN KEY (item_id) REFERENCES items(id),
                    FOREIGN KEY (reporter_id) REFERENCES users(id)
                )
            `, (err) => {
                if (err) {
                    console.error('❌ Ошибка создания reports:', err);
                    reject(err);
                } else {
                    console.log('✅ Таблица reports создана');
                }
            });
            
            // Таблица настроек
            database.run(`
                CREATE TABLE IF NOT EXISTS settings (
                    key TEXT PRIMARY KEY,
                    value TEXT,
                    updated_at INTEGER NOT NULL
                )
            `, (err) => {
                if (err) {
                    console.error('❌ Ошибка создания settings:', err);
                    reject(err);
                } else {
                    console.log('✅ Таблица settings создана');
                }
            });
            
            // Создаём индексы для производительности
            database.run('CREATE INDEX IF NOT EXISTS idx_items_status ON items(status)', (err) => {
                if (err) console.warn('⚠️ Ошибка создания индекса idx_items_status:', err);
            });
            database.run('CREATE INDEX IF NOT EXISTS idx_items_category ON items(category)', (err) => {
                if (err) console.warn('⚠️ Ошибка создания индекса idx_items_category:', err);
            });
            database.run('CREATE INDEX IF NOT EXISTS idx_items_expires_at ON items(expires_at)', (err) => {
                if (err) console.warn('⚠️ Ошибка создания индекса idx_items_expires_at:', err);
            });
            database.run('CREATE INDEX IF NOT EXISTS idx_items_telegram_id ON items(telegram_id)', (err) => {
                if (err) console.warn('⚠️ Ошибка создания индекса idx_items_telegram_id:', err);
            });
            database.run('CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status)', (err) => {
                if (err) console.warn('⚠️ Ошибка создания индекса idx_reports_status:', err);
            });
            database.run('CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id)', (err) => {
                if (err) console.warn('⚠️ Ошибка создания индекса idx_users_telegram_id:', err);
            });
            database.run('CREATE INDEX IF NOT EXISTS idx_admins_telegram_id ON admins(telegram_id)', (err) => {
                if (err) console.warn('⚠️ Ошибка создания индекса idx_admins_telegram_id:', err);
            });
            
            // Инициализация настроек по умолчанию
            const now = Date.now();
            database.run(`
                INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES
                ('item_lifetime_hours', '6', ?),
                ('karma_publish', '10', ?),
                ('karma_taken', '25', ?),
                ('karma_extend', '2', ?),
                ('karma_thanks', '5', ?),
                ('auto_hide_reports', '3', ?),
                ('require_photo', '0', ?),
                ('pre_moderation', '0', ?)
            `, [now, now, now, now, now, now, now, now], (err) => {
                if (err) {
                    console.error('❌ Ошибка инициализации настроек:', err);
                } else {
                    console.log('✅ Настройки по умолчанию инициализированы');
                }
                
                console.log('✅ База данных инициализирована');
                resolve();
            });
        });
    });
}

function closeDatabase() {
    if (db) {
        db.close((err) => {
            if (err) {
                console.error('❌ Ошибка закрытия БД:', err);
            } else {
                console.log('✅ Соединение с БД закрыто');
            }
        });
        db = null;
    }
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
    closeDatabase
};
