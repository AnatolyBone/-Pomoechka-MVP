// routes/admin.js - PostgreSQL версия
const express = require('express');
const router = express.Router();
const { pool } = require('../db/database');
const { requireAdmin, requireCreator } = require('../middleware/auth');

// GET /api/admin/stats - статистика
router.get('/stats', requireAdmin, async (req, res) => {
    try {
        const [usersResult, itemsResult, activeResult, takenResult] = await Promise.all([
            pool.query('SELECT COUNT(*) as count FROM users'),
            pool.query('SELECT COUNT(*) as count FROM items'),
            pool.query("SELECT COUNT(*) as count FROM items WHERE status = 'active'"),
            pool.query("SELECT COUNT(*) as count FROM items WHERE status = 'taken'")
        ]);
        
        res.json({
            totalUsers: parseInt(usersResult.rows[0]?.count || 0),
            totalItems: parseInt(itemsResult.rows[0]?.count || 0),
            activeItems: parseInt(activeResult.rows[0]?.count || 0),
            takenItems: parseInt(takenResult.rows[0]?.count || 0)
        });
    } catch (err) {
        console.error('❌ Ошибка получения статистики:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// GET /api/admin/items - все объявления для модерации
router.get('/items', requireAdmin, async (req, res) => {
    const { status, limit = 50 } = req.query;
    
    try {
        let sql = 'SELECT * FROM items';
        const params = [];
        let paramIndex = 0;
        
        if (status) {
            sql += ` WHERE status = $${++paramIndex}`;
            params.push(status);
        }
        
        sql += ' ORDER BY created_at DESC';
        sql += ` LIMIT $${++paramIndex}`;
        params.push(parseInt(limit));
        
        const result = await pool.query(sql, params);
        res.json(result.rows);
    } catch (err) {
        console.error('❌ Ошибка получения items для модерации:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// DELETE /api/admin/items/:id - удалить объявление
router.delete('/items/:id', requireAdmin, async (req, res) => {
    const { id } = req.params;
    
    try {
        await pool.query('DELETE FROM items WHERE id = $1', [id]);
        res.json({ success: true });
    } catch (err) {
        console.error('❌ Ошибка удаления item:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// PATCH /api/admin/items/:id - обновить статус
router.patch('/items/:id', requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    
    try {
        await pool.query('UPDATE items SET status = $1, updated_at = NOW() WHERE id = $2', [status, id]);
        const result = await pool.query('SELECT * FROM items WHERE id = $1', [id]);
        res.json(result.rows[0]);
    } catch (err) {
        console.error('❌ Ошибка обновления item:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// GET /api/admin/reports - жалобы
router.get('/reports', requireAdmin, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT r.*, i.title as item_title 
            FROM reports r 
            LEFT JOIN items i ON r.item_id = i.id 
            ORDER BY r.created_at DESC 
            LIMIT 50
        `);
        res.json(result.rows);
    } catch (err) {
        console.error('❌ Ошибка получения reports:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// PATCH /api/admin/reports/:id - обновить статус жалобы
router.patch('/reports/:id', requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    
    try {
        await pool.query(
            'UPDATE reports SET status = $1, updated_at = $2 WHERE id = $3', 
            [status, Date.now(), id]
        );
        const result = await pool.query('SELECT * FROM reports WHERE id = $1', [id]);
        res.json(result.rows[0]);
    } catch (err) {
        console.error('❌ Ошибка обновления report:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// GET /api/admin/admins - список админов
router.get('/admins', requireCreator, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT a.*, u.name, u.username 
            FROM admins a 
            LEFT JOIN users u ON a.telegram_id = u.telegram_id 
            ORDER BY a.is_creator DESC, a.created_at DESC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error('❌ Ошибка получения admins:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// POST /api/admin/admins - добавить админа
router.post('/admins', requireCreator, async (req, res) => {
    const { telegram_id, name } = req.body;
    const creatorId = req.headers['x-telegram-id'];
    
    if (!telegram_id) {
        return res.status(400).json({ error: 'telegram_id обязателен' });
    }
    
    try {
        // Проверяем не существует ли уже
        const existingResult = await pool.query(
            'SELECT * FROM admins WHERE telegram_id = $1', 
            [telegram_id]
        );
        
        if (existingResult.rows.length > 0) {
            return res.status(400).json({ error: 'Уже является админом' });
        }
        
        // Добавляем
        const result = await pool.query(
            'INSERT INTO admins (telegram_id, is_creator, created_by, created_at) VALUES ($1, 0, $2, $3) RETURNING *',
            [telegram_id, creatorId, Date.now()]
        );
        
        // Создаём пользователя если не существует
        await pool.query(
            `INSERT INTO users (telegram_id, name, karma, items_count, created_at, updated_at)
             VALUES ($1, $2, 0, 0, $3, $4) ON CONFLICT (telegram_id) DO NOTHING`,
            [telegram_id, name || 'Админ', Date.now(), Date.now()]
        );
        
        console.log('✅ Добавлен админ:', telegram_id);
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('❌ Ошибка добавления админа:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// DELETE /api/admin/admins/:id - удалить админа
router.delete('/admins/:id', requireCreator, async (req, res) => {
    const { id } = req.params;
    
    try {
        // Проверяем что это не создатель
        const adminResult = await pool.query('SELECT * FROM admins WHERE id = $1', [id]);
        const admin = adminResult.rows[0];
        
        if (!admin) {
            return res.status(404).json({ error: 'Админ не найден' });
        }
        
        if (admin.is_creator) {
            return res.status(403).json({ error: 'Нельзя удалить создателя' });
        }
        
        await pool.query('DELETE FROM admins WHERE id = $1', [id]);
        console.log('✅ Удалён админ:', id);
        res.json({ success: true });
    } catch (err) {
        console.error('❌ Ошибка удаления админа:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// GET /api/admin/settings - получить настройки
router.get('/settings', requireAdmin, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM settings');
        const settings = {};
        for (const row of result.rows) {
            settings[row.key] = row.value;
        }
        res.json(settings);
    } catch (err) {
        console.error('❌ Ошибка получения настроек:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// PATCH /api/admin/settings - обновить настройки
router.patch('/settings', requireCreator, async (req, res) => {
    const updates = req.body;
    
    try {
        for (const [key, value] of Object.entries(updates)) {
            await pool.query(
                `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, $3) 
                 ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = $3`,
                [key, String(value), Date.now()]
            );
        }
        
        const result = await pool.query('SELECT * FROM settings');
        const settings = {};
        for (const row of result.rows) {
            settings[row.key] = row.value;
        }
        
        console.log('✅ Настройки обновлены');
        res.json(settings);
    } catch (err) {
        console.error('❌ Ошибка обновления настроек:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

module.exports = router;
