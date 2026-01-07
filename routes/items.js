// routes/items.js - PostgreSQL версия
const express = require('express');
const router = express.Router();
const { pool } = require('../db/database');

function getTelegramId(req) {
    return req.headers['x-telegram-id'] || req.query.telegram_id || req.body?.telegram_id || null;
}

// GET /api/items - список объявлений
router.get('/', async (req, res) => {
    const { status = 'active', category, limit = 50, telegram_id } = req.query;
    
    try {
        let sql = 'SELECT * FROM items WHERE 1=1';
        const params = [];
        let paramIndex = 0;
        
        if (status) {
            sql += ` AND status = $${++paramIndex}`;
            params.push(status);
        }
        
        if (category && category !== 'all') {
            sql += ` AND category = $${++paramIndex}`;
            params.push(category);
        }
        
        if (telegram_id) {
            sql += ` AND telegram_id = $${++paramIndex}`;
            params.push(telegram_id);
        }
        
        sql += ' ORDER BY created_at DESC';
        sql += ` LIMIT $${++paramIndex}`;
        params.push(parseInt(limit));
        
        const result = await pool.query(sql, params);
        res.json(result.rows || []);
    } catch (err) {
        console.error('❌ Ошибка получения items:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// GET /api/items/:id - одно объявление
router.get('/:id', async (req, res) => {
    const { id } = req.params;
    
    try {
        const result = await pool.query('SELECT * FROM items WHERE id = $1', [id]);
        const item = result.rows[0];
        
        if (!item) {
            return res.status(404).json({ error: 'Объявление не найдено' });
        }
        
        // Увеличиваем счётчик просмотров
        await pool.query('UPDATE items SET views = views + 1 WHERE id = $1', [id]);
        
        res.json(item);
    } catch (err) {
        console.error('❌ Ошибка получения item:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// POST /api/items - создание объявления
router.post('/', async (req, res) => {
    const telegramId = getTelegramId(req);
    
    if (!telegramId) {
        return res.status(401).json({ error: 'Требуется авторизация' });
    }
    
    const { 
        title, 
        description = '', 
        category = 'other', 
        condition = 'good',
        latitude, 
        longitude, 
        address = '',
        photo_url = ''
    } = req.body;
    
    if (!title) {
        return res.status(400).json({ error: 'Название обязательно' });
    }
    
    try {
        // Время истечения - 6 часов
        const expiresAt = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();
        
        const result = await pool.query(
            `INSERT INTO items (telegram_id, title, description, category, condition, latitude, longitude, address, photo_url, expires_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
            [telegramId, title, description, category, condition, latitude, longitude, address, photo_url, expiresAt]
        );
        
        const item = result.rows[0];
        
        // Увеличиваем счётчик объявлений и карму пользователя
        await pool.query(
            'UPDATE users SET items_count = items_count + 1, karma = karma + 10 WHERE telegram_id = $1', 
            [telegramId]
        );
        
        console.log('✅ Создано объявление:', item.id);
        res.status(201).json(item);
    } catch (err) {
        console.error('❌ Ошибка создания item:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// PATCH /api/items/:id - обновление
router.patch('/:id', async (req, res) => {
    const telegramId = getTelegramId(req);
    const { id } = req.params;
    const updates = req.body;
    
    if (!telegramId) {
        return res.status(401).json({ error: 'Требуется авторизация' });
    }
    
    try {
        // Проверяем владельца
        const itemResult = await pool.query('SELECT * FROM items WHERE id = $1', [id]);
        const item = itemResult.rows[0];
        
        if (!item) return res.status(404).json({ error: 'Не найдено' });
        if (item.telegram_id !== telegramId) {
            return res.status(403).json({ error: 'Нет прав' });
        }
        
        const allowed = ['title', 'description', 'category', 'condition', 'status'];
        const fields = [];
        const values = [];
        let paramIndex = 0;
        
        for (const key of allowed) {
            if (updates[key] !== undefined) {
                fields.push(`${key} = $${++paramIndex}`);
                values.push(updates[key]);
            }
        }
        
        if (fields.length === 0) {
            return res.json(item);
        }
        
        fields.push(`updated_at = NOW()`);
        values.push(id);
        
        await pool.query(
            `UPDATE items SET ${fields.join(', ')} WHERE id = $${++paramIndex}`, 
            values
        );
        
        const updatedResult = await pool.query('SELECT * FROM items WHERE id = $1', [id]);
        res.json(updatedResult.rows[0]);
    } catch (err) {
        console.error('❌ Ошибка обновления item:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// DELETE /api/items/:id
router.delete('/:id', async (req, res) => {
    const telegramId = getTelegramId(req);
    const { id } = req.params;
    
    if (!telegramId) {
        return res.status(401).json({ error: 'Требуется авторизация' });
    }
    
    try {
        const itemResult = await pool.query('SELECT * FROM items WHERE id = $1', [id]);
        const item = itemResult.rows[0];
        
        if (!item) return res.status(404).json({ error: 'Не найдено' });
        if (item.telegram_id !== telegramId) {
            return res.status(403).json({ error: 'Нет прав' });
        }
        
        await pool.query('DELETE FROM items WHERE id = $1', [id]);
        res.json({ success: true });
    } catch (err) {
        console.error('❌ Ошибка удаления item:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// POST /api/items/:id/taken - отметить как забранное
router.post('/:id/taken', async (req, res) => {
    const telegramId = getTelegramId(req);
    const { id } = req.params;
    
    if (!telegramId) {
        return res.status(401).json({ error: 'Требуется авторизация' });
    }
    
    try {
        // Обновляем статус
        await pool.query(
            `UPDATE items SET status = 'taken', taken_by = $1, taken_at = NOW() WHERE id = $2`,
            [telegramId, id]
        );
        
        // Добавляем карму владельцу
        const itemResult = await pool.query('SELECT telegram_id FROM items WHERE id = $1', [id]);
        const item = itemResult.rows[0];
        
        if (item) {
            await pool.query(
                'UPDATE users SET karma = karma + 25 WHERE telegram_id = $1', 
                [item.telegram_id]
            );
        }
        
        const updatedResult = await pool.query('SELECT * FROM items WHERE id = $1', [id]);
        res.json(updatedResult.rows[0]);
    } catch (err) {
        console.error('❌ Ошибка обновления статуса item:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// POST /api/items/:id/extend - продлить
router.post('/:id/extend', async (req, res) => {
    const telegramId = getTelegramId(req);
    const { id } = req.params;
    
    if (!telegramId) {
        return res.status(401).json({ error: 'Требуется авторизация' });
    }
    
    try {
        const newExpires = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();
        
        const result = await pool.query(
            `UPDATE items SET expires_at = $1, status = 'active', updated_at = NOW() 
             WHERE id = $2 AND telegram_id = $3 RETURNING *`,
            [newExpires, id, telegramId]
        );
        
        if (result.rowCount === 0) {
            return res.status(403).json({ error: 'Нет прав или объявление не найдено' });
        }
        
        // Добавляем карму
        await pool.query(
            'UPDATE users SET karma = karma + 2 WHERE telegram_id = $1', 
            [telegramId]
        );
        
        res.json(result.rows[0]);
    } catch (err) {
        console.error('❌ Ошибка продления item:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

module.exports = router;
