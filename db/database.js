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
            } else {
                console.log('✅ SQLite подключен');
            }
        });
    }
    return db;
}

function initTables() {
    const database = getDatabase();
    
    database.serialize(() => {
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
        `);
        
        // Таблица объявлений
        database.run(`
            CREATE TABLE IF NOT EXISTS items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                description TEXT,
                category TEXT NOT NULL,
                emoji TEXT,
                photo_url TEXT,
                location_address TEXT NOT NULL,
                location_details TEXT,
                location_lat REAL NOT NULL,
                location_lng REAL NOT NULL,
                author_id INTEGER NOT NULL,
                status TEXT DEFAULT 'active',
                chat_enabled INTEGER DEFAULT 1,
                views INTEGER DEFAULT 0,
                reports_count INTEGER DEFAULT 0,
                expires_at INTEGER NOT NULL,
                taken_at INTEGER,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                FOREIGN KEY (author_id) REFERENCES users(id)
            )
        `);
        
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
        `);
        
        // Таблица жалоб
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
        `);
        
        // Таблица настроек
        database.run(`
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT,
                updated_at INTEGER NOT NULL
            )
        `);
        
        // Индексы для производительности
        database.run(`CREATE INDEX IF NOT EXISTS idx_items_status ON items(status)`);
        database.run(`CREATE INDEX IF NOT EXISTS idx_items_category ON items(category)`);
        database.run(`CREATE INDEX IF NOT EXISTS idx_items_expires_at ON items(expires_at)`);
        database.run(`CREATE INDEX IF NOT EXISTS idx_items_author ON items(user_id)`);
        database.run(`CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status)`);
        database.run(`CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id)`);
        database.run(`CREATE INDEX IF NOT EXISTS idx_admins_telegram_id ON admins(telegram_id)`);
        
        console.log('✅ Таблицы инициализированы');
        
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
        });
    });
}

// Функция инициализации (для обратной совместимости)
function initDatabase() {
    return new Promise((resolve, reject) => {
        const database = getDatabase();
        
        database.serialize(() => {
            initTables();
            
            // Даем время на создание таблиц
            setTimeout(() => {
                resolve();
            }, 100);
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

// Инициализируем таблицы при первой загрузке
initTables();

module.exports = {
    getDatabase,
    initDatabase,
    closeDatabase
};
