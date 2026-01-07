// routes/users.js - PostgreSQL версия
const express = require('express');
const router = express.Router();
const { pool } = require('../db/database');

function getTelegramId(req) {
    return req.headers['x-telegram-id'] || req.query.telegram_id || null;
}

// GET /api/users/leaderboard - топ пользователей
router.get('/leaderboard', async (req, res) => {
    const { limit = 10 } = req.query;
    
    try {
        const result = await pool.query(
            'SELECT id, name, username, karma, items_count FROM users ORDER BY karma DESC LIMIT $1',
            [parseInt(limit)]
        );
        res.json(result.rows);
    } catch (err) {
        console.error('❌ Ошибка получения leaderboard:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// GET /api/users/:telegram_id - профиль пользователя
router.get('/:telegram_id', async (req, res) => {
    const { telegram_id } = req.params;
    
    try {
        const result = await pool.query(
            'SELECT * FROM users WHERE telegram_id = $1',
            [telegram_id]
        );
        
        const user = result.rows[0];
        
        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }
        
        res.json({
            id: user.id,
            telegram_id: user.telegram_id,
            name: user.name,
            username: user.username,
            karma: user.karma || 0,
            items_count: user.items_count || 0,
            stats: {
                published: user.stats_published || 0,
                taken: user.stats_taken || 0,
                saved_kg: user.stats_saved_kg || 0
            }
        });
    } catch (err) {
        console.error('❌ Ошибка получения пользователя:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// POST /api/users/:telegram_id/karma - добавить карму
router.post('/:telegram_id/karma', async (req, res) => {
    const { telegram_id } = req.params;
    const { amount = 5, reason = 'thanks' } = req.body;
    
    try {
        const result = await pool.query(
            'UPDATE users SET karma = karma + $1 WHERE telegram_id = $2 RETURNING *',
            [parseInt(amount), telegram_id]
        );
        
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }
        
        console.log('✅ Карма добавлена:', telegram_id, '+', amount);
        res.json(result.rows[0]);
    } catch (err) {
        console.error('❌ Ошибка добавления кармы:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

module.exports = router;
