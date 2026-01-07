// routes/auth.js
const express = require('express');
const router = express.Router();
const { getDatabase } = require('../db/database');
const { 
    getTelegramId, 
    getOrCreateUser, 
    isAdmin, 
    isCreator, 
    hasCreator 
} = require('../middleware/auth');

// === Вспомогательные функции ===

function getTelegramUser(req) {
    try {
        const data = req.headers['x-telegram-data'];
        if (data) {
            return JSON.parse(data);
        }
    } catch (e) {
        console.warn('⚠️ Ошибка парсинга X-Telegram-Data');
    }
    return null;
}

// Валидация токена бота через Telegram API
async function validateBotToken(token) {
    try {
        const https = require('https');
        return new Promise((resolve) => {
            https.get(`https://api.telegram.org/bot${token}/getMe`, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const json = JSON.parse(data);
                        console.log('🤖 Проверка токена:', json.ok ? '✅ Валиден' : '❌ Невалиден');
                        resolve(json.ok === true);
                    } catch (e) {
                        resolve(true);
                    }
                });
            }).on('error', () => resolve(true));
        });
    } catch (error) {
        return true;
    }
}

// === Роуты ===

// GET /api/auth/check-creator - проверить, есть ли создатель
router.get('/check-creator', async (req, res) => {
    try {
        const exists = await hasCreator();
        console.log('🔍 check-creator:', exists);
        res.json({ hasCreator: exists });
    } catch (error) {
        console.error('❌ check-creator error:', error);
        res.json({ hasCreator: true }); // При ошибке считаем что есть
    }
});

// GET /api/auth/check-admin - проверить права
router.get('/check-admin', async (req, res) => {
    const telegramId = getTelegramId(req);
    
    console.log('🔍 check-admin для:', telegramId);
    
    if (!telegramId) {
        return res.json({ isAdmin: false, isCreator: false });
    }
    
    try {
        const [adminCheck, creatorCheck] = await Promise.all([
            isAdmin(telegramId),
            isCreator(telegramId)
        ]);
        
        console.log('🔐 Права для', telegramId, ':', { isAdmin: adminCheck, isCreator: creatorCheck });
        
        res.json({ isAdmin: adminCheck, isCreator: creatorCheck });
    } catch (error) {
        console.error('❌ check-admin error:', error);
        res.json({ isAdmin: false, isCreator: false });
    }
});

// GET /api/auth/me - получить текущего пользователя
router.get('/me', async (req, res) => {
    const telegramId = getTelegramId(req);
    
    if (!telegramId) {
        return res.status(400).json({ error: 'Telegram ID не указан' });
    }
    
    try {
        const telegramUser = getTelegramUser(req);
        const user = await getOrCreateUser(telegramId, telegramUser || {});
        
        const [adminCheck, creatorCheck] = await Promise.all([
            isAdmin(telegramId),
            isCreator(telegramId)
        ]);
        
        res.json({
            ...user,
            isAdmin: adminCheck,
            isCreator: creatorCheck
        });
    } catch (error) {
        console.error('❌ GET /auth/me error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// POST /api/auth/me - обновить данные пользователя (имя из Telegram)
router.post('/me', async (req, res) => {
    const telegramId = getTelegramId(req);
    
    if (!telegramId) {
        return res.status(400).json({ error: 'Telegram ID не указан' });
    }
    
    const { name, username } = req.body;
    const db = getDatabase();
    
    console.log('📝 POST /auth/me:', { telegramId, name, username });
    
    try {
        // Проверяем существует ли пользователь
        const existingUser = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM users WHERE telegram_id = ?', [telegramId], (err, row) => {
                if (err) return reject(err);
                resolve(row);
            });
        });
        
        if (existingUser) {
            // Обновляем существующего пользователя
            await new Promise((resolve, reject) => {
                db.run(
                    `UPDATE users SET 
                        name = COALESCE(?, name), 
                        username = COALESCE(?, username),
                        updated_at = ?
                     WHERE telegram_id = ?`,
                    [name || existingUser.name, username || existingUser.username, Date.now(), telegramId],
                    function(err) {
                        if (err) return reject(err);
                        console.log('✅ Пользователь обновлён:', telegramId);
                        resolve(this.changes);
                    }
                );
            });
        } else {
            // Создаём нового пользователя
            await new Promise((resolve, reject) => {
                db.run(
                    `INSERT INTO users (telegram_id, name, username, karma, items_count, created_at, updated_at)
                     VALUES (?, ?, ?, 0, 0, ?, ?)`,
                    [telegramId, name || 'Пользователь', username || '', Date.now(), Date.now()],
                    function(err) {
                        if (err) return reject(err);
                        console.log('✅ Пользователь создан:', this.lastID);
                        resolve(this.lastID);
                    }
                );
            });
        }
        
        // Получаем обновлённого пользователя
        const user = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM users WHERE telegram_id = ?', [telegramId], (err, row) => {
                if (err) return reject(err);
                resolve(row);
            });
        });
        
        const [adminCheck, creatorCheck] = await Promise.all([
            isAdmin(telegramId),
            isCreator(telegramId)
        ]);
        
        // Формируем ответ с initial для аватара
        const initial = (user.name || 'U').charAt(0).toUpperCase();
        
        res.json({
            id: user.id,
            telegramId: user.telegram_id,
            name: user.name,
            username: user.username,
            initial: initial,
            karma: user.karma || 0,
            items_count: user.items_count || 0,
            isAdmin: adminCheck,
            isCreator: creatorCheck
        });
        
    } catch (error) {
        console.error('❌ POST /auth/me error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// POST /api/auth/setup-creator - настройка первого создателя
router.post('/setup-creator', async (req, res) => {
    const telegramId = getTelegramId(req);
    const { botToken, name, username } = req.body;
    
    console.log('🔧 setup-creator от:', telegramId);
    
    if (!telegramId) {
        return res.status(400).json({ error: 'Telegram ID не указан' });
    }
    
    try {
        // Проверяем, есть ли уже создатель
        const exists = await hasCreator();
        
        if (exists) {
            // Если создатель уже есть, просто возвращаем успех
            console.log('ℹ️ Создатель уже существует');
            return res.json({ 
                success: true, 
                message: 'Система уже настроена',
                alreadyExists: true
            });
        }
        
        // Токен опционален, валидируем только если передан
        if (botToken && botToken !== 'placeholder:token' && !/^\d+:[A-Za-z0-9_-]+$/.test(botToken)) {
            console.warn('⚠️ Неверный формат токена, игнорируем');
        }
        
        const db = getDatabase();
        
        // Создаём/обновляем пользователя
        const telegramUser = getTelegramUser(req) || { name, username };
        await getOrCreateUser(telegramId, telegramUser);
        
        // Добавляем как создателя
        await new Promise((resolve, reject) => {
            db.run(
                `INSERT OR IGNORE INTO admins (telegram_id, is_creator, created_at) VALUES (?, 1, ?)`,
                [telegramId, Date.now()],
                function(err) {
                    if (err) return reject(err);
                    resolve(this.lastID);
                }
            );
        });
        
        // Сохраняем токен если передан
        if (botToken && botToken !== 'placeholder:token') {
            try {
                await new Promise((resolve, reject) => {
                    db.run(
                        `INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('bot_token', ?, ?)`,
                        [botToken, Date.now()],
                        (err) => err ? reject(err) : resolve()
                    );
                });
            } catch (e) {
                console.warn('⚠️ Не удалось сохранить токен:', e);
            }
        }
        
        console.log('✅ Создатель настроен:', telegramId);
        
        res.json({ 
            success: true, 
            message: 'Вы успешно стали создателем системы!',
            creatorId: telegramId
        });
        
    } catch (error) {
        console.error('❌ setup-creator error:', error);
        res.status(500).json({ error: 'Ошибка: ' + error.message });
    }
});

module.exports = router;