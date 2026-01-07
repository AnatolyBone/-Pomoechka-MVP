// routes/auth.js - PostgreSQL версия
const express = require('express');
const router = express.Router();
const { pool } = require('../db/database');
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

// POST /api/auth/me - обновить данные пользователя
router.post('/me', async (req, res) => {
    const telegramId = getTelegramId(req);
    
    if (!telegramId) {
        return res.status(400).json({ error: 'Telegram ID не указан' });
    }
    
    const { name, username } = req.body;
    
    console.log('📝 POST /auth/me:', { telegramId, name, username });
    
    try {
        // Проверяем существует ли пользователь
        const existingResult = await pool.query(
            'SELECT * FROM users WHERE telegram_id = $1', 
            [telegramId]
        );
        const existingUser = existingResult.rows[0];
        
        if (existingUser) {
            // Обновляем существующего
            await pool.query(
                `UPDATE users SET 
                    name = COALESCE($1, name), 
                    username = COALESCE($2, username),
                    updated_at = $3
                 WHERE telegram_id = $4`,
                [name || existingUser.name, username || existingUser.username, Date.now(), telegramId]
            );
            console.log('✅ Пользователь обновлён:', telegramId);
        } else {
            // Создаём нового
            await pool.query(
                `INSERT INTO users (telegram_id, name, username, karma, items_count, created_at, updated_at)
                 VALUES ($1, $2, $3, 0, 0, $4, $5)`,
                [telegramId, name || 'Пользователь', username || '', Date.now(), Date.now()]
            );
            console.log('✅ Пользователь создан:', telegramId);
        }
        
        // Получаем обновлённого пользователя
        const userResult = await pool.query(
            'SELECT * FROM users WHERE telegram_id = $1', 
            [telegramId]
        );
        const user = userResult.rows[0];
        
        const [adminCheck, creatorCheck] = await Promise.all([
            isAdmin(telegramId),
            isCreator(telegramId)
        ]);
        
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
            console.log('ℹ️ Создатель уже существует');
            return res.json({ 
                success: true, 
                message: 'Система уже настроена',
                alreadyExists: true
            });
        }
        
        // Создаём/обновляем пользователя
        await getOrCreateUser(telegramId, { name, username });
        
        // Добавляем как создателя
        await pool.query(
            `INSERT INTO admins (telegram_id, is_creator, created_at) 
             VALUES ($1, 1, $2) 
             ON CONFLICT (telegram_id) DO UPDATE SET is_creator = 1`,
            [telegramId, Date.now()]
        );
        
        // Сохраняем токен если передан
        if (botToken && botToken !== 'placeholder:token') {
            await pool.query(
                `INSERT INTO settings (key, value, updated_at) 
                 VALUES ('bot_token', $1, $2) 
                 ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = $2`,
                [botToken, Date.now()]
            );
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
