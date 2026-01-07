// routes/reports.js - PostgreSQL версия
const express = require('express');
const router = express.Router();
const { pool } = require('../db/database');

function getTelegramId(req) {
    return req.headers['x-telegram-id'] || req.query.telegram_id || req.body?.telegram_id || null;
}

// POST /api/reports - создать жалобу
router.post('/', async (req, res) => {
    const telegramId = getTelegramId(req);
    const { item_id, reason } = req.body;
    
    if (!telegramId) {
        return res.status(401).json({ error: 'Требуется авторизация' });
    }
    
    if (!item_id || !reason) {
        return res.status(400).json({ error: 'item_id и reason обязательны' });
    }
    
    try {
        // Проверяем существует ли объявление
        const itemResult = await pool.query('SELECT * FROM items WHERE id = $1', [item_id]);
        const item = itemResult.rows[0];
        
        if (!item) {
            return res.status(404).json({ error: 'Объявление не найдено' });
        }
        
        // Создаём жалобу
        const result = await pool.query(
            `INSERT INTO reports (item_id, reporter_id, reason, status, created_at, updated_at)
             VALUES ($1, $2, $3, 'pending', $4, $5) RETURNING *`,
            [item_id, telegramId, reason, Date.now(), Date.now()]
        );
        
        // Увеличиваем счётчик жалоб на объявлении
        await pool.query(
            'UPDATE items SET reports_count = reports_count + 1 WHERE id = $1',
            [item_id]
        );
        
        // Если жалоб больше 3, скрываем объявление
        if (item.reports_count >= 2) {
            await pool.query(
                "UPDATE items SET status = 'hidden' WHERE id = $1",
                [item_id]
            );
        }
        
        console.log('✅ Создана жалоба на объявление:', item_id);
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('❌ Ошибка создания жалобы:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// GET /api/reports - получить жалобы (для админов)
router.get('/', async (req, res) => {
    const { status, limit = 50 } = req.query;
    
    try {
        let sql = `
            SELECT r.*, i.title as item_title, i.telegram_id as item_owner 
            FROM reports r 
            LEFT JOIN items i ON r.item_id = i.id
        `;
        const params = [];
        let paramIndex = 0;
        
        if (status) {
            sql += ` WHERE r.status = $${++paramIndex}`;
            params.push(status);
        }
        
        sql += ' ORDER BY r.created_at DESC';
        sql += ` LIMIT $${++paramIndex}`;
        params.push(parseInt(limit));
        
        const result = await pool.query(sql, params);
        res.json(result.rows);
    } catch (err) {
        console.error('❌ Ошибка получения жалоб:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

module.exports = router;
