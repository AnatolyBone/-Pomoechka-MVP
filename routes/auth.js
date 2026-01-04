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
        // Используем встроенный fetch (Node.js 18+) или https модуль
        let fetchFunc;
        if (global.fetch) {
            fetchFunc = global.fetch;
        } else {
            // Fallback на https для старых версий Node.js
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
                            console.warn('⚠️ Ошибка парсинга ответа Telegram API');
                            resolve(true); // В MVP разрешаем
                        }
                    });
                }).on('error', (err) => {
                    console.error('❌ Ошибка проверки токена:', err);
                    resolve(true); // В MVP разрешаем
                });
            });
        }
        
        const response = await fetchFunc(`https://api.telegram.org/bot${token}/getMe`);
        const data = await response.json();
        
        console.log('🤖 Проверка токена:', data.ok ? '✅ Валиден' : '❌ Невалиден');
        
        return data.ok === true;
    } catch (error) {
        console.error('❌ Ошибка проверки токена:', error);
        // В MVP разрешаем даже при ошибке проверки (для разработки)
        console.warn('⚠️ Пропускаем проверку токена (MVP режим)');
        return true;
    }
}

// === Роуты ===

// GET /api/auth/check-creator - проверить, есть ли создатель (публичный!)
router.get('/check-creator', async (req, res) => {
    try {
        const exists = await hasCreator();
        console.log('🔍 check-creator:', exists);
        res.json({ hasCreator: exists });
    } catch (error) {
        console.error('❌ check-creator error:', error);
        res.json({ hasCreator: false }); // При ошибке считаем что нет
    }
});

// GET /api/auth/check-admin - проверить права (публичный, не требует auth!)
router.get('/check-admin', async (req, res) => {
    const telegramId = getTelegramId(req);
    
    console.log('🔍 check-admin для:', telegramId);
    
    if (!telegramId) {
        // Не ошибка! Просто возвращаем false
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
        
        // Добавляем права
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
        console.error('❌ /auth/me error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// POST /api/auth/setup-creator - настройка первого создателя
router.post('/setup-creator', async (req, res) => {
    const telegramId = getTelegramId(req);
    const { botToken } = req.body;
    
    console.log('🔧 setup-creator от:', telegramId);
    
    if (!telegramId) {
        return res.status(400).json({ error: 'Telegram ID не указан' });
    }
    
    if (!botToken) {
        return res.status(400).json({ error: 'Токен бота не указан' });
    }
    
    // Проверяем формат токена
    if (!/^\d+:[A-Za-z0-9_-]+$/.test(botToken)) {
        return res.status(400).json({ error: 'Неверный формат токена' });
    }
    
    try {
        // Проверяем, есть ли уже создатель
        const exists = await hasCreator();
        
        if (exists) {
            return res.status(400).json({ error: 'Создатель уже существует' });
        }
        
        // Опционально: проверяем токен через Telegram API
        const isValid = await validateBotToken(botToken);
        if (!isValid) {
            console.warn('⚠️ Токен не прошел валидацию, но продолжаем (MVP режим)');
            // В MVP разрешаем даже при ошибке проверки
        }
        
        const db = getDatabase();
        
        // Убеждаемся что пользователь существует
        const telegramUser = getTelegramUser(req);
        await getOrCreateUser(telegramId, telegramUser || {});
        
        // Добавляем как создателя
        await new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO admins (telegram_id, is_creator, created_at) VALUES (?, 1, ?)`,
                [telegramId, Date.now()],
                function(err) {
                    if (err) return reject(err);
                    resolve(this.lastID);
                }
            );
        });
        
        // Сохраняем токен
        try {
            await new Promise((resolve, reject) => {
                db.run(
                    `INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('bot_token', ?, ?)`,
                    [botToken, Date.now()],
                    (err) => err ? reject(err) : resolve()
                );
            });
        } catch (e) {
            console.warn('⚠️ Не удалось сохранить токен в настройках:', e);
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
