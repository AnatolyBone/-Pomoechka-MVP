// middleware/auth.js
const { getDatabase } = require('../db/database');

// Получение Telegram ID из заголовков
function getTelegramId(req) {
    // Пробуем разные источники
    const fromHeader = req.headers['x-telegram-id'];
    const fromQuery = req.query.telegram_id;
    const fromBody = req.body?.telegram_id;
    
    const telegramId = fromHeader || fromQuery || fromBody;
    
    console.log('🔐 getTelegramId:', { fromHeader, fromQuery, fromBody, result: telegramId });
    
    return telegramId ? String(telegramId) : null;
}

// middleware/auth.js - проверьте что getOrCreateUser обновляет имя

async function getOrCreateUser(telegramId, userData = {}) {
    const db = getDatabase();
    
    return new Promise((resolve, reject) => {
        db.get('SELECT * FROM users WHERE telegram_id = ?', [telegramId], (err, user) => {
            if (err) return reject(err);
            
            if (user) {
                // Обновляем имя если передано и отличается
                if (userData.name && userData.name !== user.name && user.name === 'Пользователь') {
                    db.run(
                        'UPDATE users SET name = ?, username = ? WHERE telegram_id = ?',
                        [userData.name, userData.username || user.username, telegramId]
                    );
                    user.name = userData.name;
                    if (userData.username) user.username = userData.username;
                }
                return resolve(user);
            }
            
            // Создаём нового
            const name = userData.name || userData.first_name || 'Пользователь';
            const username = userData.username || '';
            
            db.run(
                `INSERT INTO users (telegram_id, name, username, karma, items_count, created_at, updated_at)
                 VALUES (?, ?, ?, 0, 0, ?, ?)`,
                [telegramId, name, username, Date.now(), Date.now()],
                function(err) {
                    if (err) return reject(err);
                    
                    db.get('SELECT * FROM users WHERE id = ?', [this.lastID], (err, newUser) => {
                        if (err) return reject(err);
                        console.log('✅ Создан пользователь:', newUser.id, name);
                        resolve(newUser);
                    });
                }
            );
        });
    });
}

// Проверка: является ли пользователь создателем
async function isCreator(telegramId) {
    const db = getDatabase();
    return new Promise((resolve, reject) => {
        db.get(
            'SELECT * FROM admins WHERE telegram_id = ? AND is_creator = 1',
            [telegramId],
            (err, row) => {
                if (err) return reject(err);
                resolve(!!row);
            }
        );
    });
}

// Проверка: является ли пользователь админом
async function isAdmin(telegramId) {
    const db = getDatabase();
    return new Promise((resolve, reject) => {
        db.get(
            'SELECT * FROM admins WHERE telegram_id = ?',
            [telegramId],
            (err, row) => {
                if (err) return reject(err);
                resolve(!!row);
            }
        );
    });
}

// Проверка: есть ли уже создатель в системе
async function hasCreator() {
    const db = getDatabase();
    return new Promise((resolve, reject) => {
        db.get(
            'SELECT * FROM admins WHERE is_creator = 1',
            [],
            (err, row) => {
                if (err) return reject(err);
                resolve(!!row);
            }
        );
    });
}

function formatUser(user) {
    if (!user) return null;
    
    return {
        id: user.id,
        telegramId: user.telegram_id,
        name: user.name,
        username: user.username,
        initial: user.initial,
        karma: user.karma,
        stats: {
            published: user.stats_published,
            taken: user.stats_taken,
            savedKg: user.stats_saved_kg,
            fastPickups: user.stats_fast_pickups,
            thanks: user.stats_thanks,
            reliability: user.stats_reliability
        },
        achievements: JSON.parse(user.achievements || '[]'),
        createdAt: user.created_at,
        updatedAt: user.updated_at
    };
}

// Middleware: требует авторизации (но не админских прав)
function requireAuth(req, res, next) {
    const telegramId = getTelegramId(req);
    
    if (!telegramId) {
        console.log('⚠️ requireAuth: нет telegram_id');
        return res.status(401).json({ error: 'Требуется авторизация Telegram' });
    }
    
    req.telegramId = telegramId;
    next();
}

// Middleware: требует прав админа
async function requireAdmin(req, res, next) {
    const telegramId = getTelegramId(req);
    
    if (!telegramId) {
        console.log('⚠️ requireAdmin: нет telegram_id');
        return res.status(401).json({ error: 'Требуется авторизация Telegram' });
    }
    
    try {
        const adminCheck = await isAdmin(telegramId);
        if (!adminCheck) {
            console.log('⚠️ requireAdmin: нет прав администратора для', telegramId);
            return res.status(403).json({ error: 'Требуются права администратора' });
        }
        
        req.telegramId = telegramId;
        req.isAdmin = true;
        next();
    } catch (error) {
        console.error('❌ Ошибка проверки админа:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
}

// Middleware: требует прав создателя
async function requireCreator(req, res, next) {
    const telegramId = getTelegramId(req);
    
    if (!telegramId) {
        console.log('⚠️ requireCreator: нет telegram_id');
        return res.status(401).json({ error: 'Требуется авторизация Telegram' });
    }
    
    try {
        const creatorCheck = await isCreator(telegramId);
        if (!creatorCheck) {
            console.log('⚠️ requireCreator: нет прав создателя для', telegramId);
            return res.status(403).json({ error: 'Требуются права создателя' });
        }
        
        req.telegramId = telegramId;
        req.isCreator = true;
        next();
    } catch (error) {
        console.error('❌ Ошибка проверки создателя:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
}

// Для обратной совместимости
function verifyTelegramAuth(req, res, next) {
    return requireAuth(req, res, next);
}

module.exports = {
    getTelegramId,
    getOrCreateUser,
    isCreator,
    isAdmin,
    hasCreator,
    requireAuth,
    requireAdmin,
    requireCreator,
    verifyTelegramAuth, // Для обратной совместимости
    formatUser
};
