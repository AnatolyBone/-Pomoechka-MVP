// routes/items.js
const express = require('express');
const router = express.Router();
const { getDatabase } = require('../db/database');

function getTelegramId(req) {
    return req.headers['x-telegram-id'] || req.query.telegram_id || req.body?.telegram_id || null;
}

// GET /api/items - список объявлений
router.get('/', (req, res) => {
    const db = getDatabase();
    const { status = 'active', category, limit = 50 } = req.query;
    
    let sql = 'SELECT * FROM items WHERE 1=1';
    const params = [];
    
    if (status) {
        sql += ' AND status = ?';
        params.push(status);
    }
    
    if (category && category !== 'all') {
        sql += ' AND category = ?';
        params.push(category);
    }
    
    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(parseInt(limit));
    
    db.all(sql, params, (err, items) => {
        if (err) {
            console.error('❌ Ошибка получения items:', err);
            return res.status(500).json({ error: 'Ошибка сервера' });
        }
        res.json(items || []);
    });
});

// GET /api/items/:id - одно объявление
router.get('/:id', (req, res) => {
    const db = getDatabase();
    const { id } = req.params;
    
    db.get('SELECT * FROM items WHERE id = ?', [id], (err, item) => {
        if (err) {
            console.error('❌ Ошибка получения item:', err);
            return res.status(500).json({ error: 'Ошибка сервера' });
        }
        if (!item) {
            return res.status(404).json({ error: 'Объявление не найдено' });
        }
        
        // Увеличиваем счётчик просмотров
        db.run('UPDATE items SET views = views + 1 WHERE id = ?', [id], (err) => {
            if (err) console.warn('⚠️ Ошибка обновления views:', err);
        });
        
        res.json(item);
    });
});

// POST /api/items - создание объявления
router.post('/', (req, res) => {
    const db = getDatabase();
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
    
    // Время истечения - 6 часов
    const expiresAt = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();
    
    db.run(
        `INSERT INTO items (telegram_id, title, description, category, condition, latitude, longitude, address, photo_url, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [telegramId, title, description, category, condition, latitude, longitude, address, photo_url, expiresAt],
        function(err) {
            if (err) {
                console.error('❌ Ошибка создания item:', err);
                return res.status(500).json({ error: 'Ошибка сервера' });
            }
            
            const itemId = this.lastID;
            
            // Увеличиваем счётчик объявлений пользователя
            db.run('UPDATE users SET items_count = items_count + 1 WHERE telegram_id = ?', [telegramId], (err) => {
                if (err) console.warn('⚠️ Ошибка обновления items_count:', err);
            });
            
            // Добавляем карму
            db.run('UPDATE users SET karma = karma + 10 WHERE telegram_id = ?', [telegramId], (err) => {
                if (err) console.warn('⚠️ Ошибка обновления karma:', err);
            });
            
            db.get('SELECT * FROM items WHERE id = ?', [itemId], (err, item) => {
                if (err) {
                    console.error('❌ Ошибка получения созданного item:', err);
                    return res.status(500).json({ error: 'Ошибка сервера' });
                }
                console.log('✅ Создано объявление:', itemId);
                res.status(201).json(item);
            });
        }
    );
});

// PATCH /api/items/:id - обновление
router.patch('/:id', (req, res) => {
    const db = getDatabase();
    const telegramId = getTelegramId(req);
    const { id } = req.params;
    const updates = req.body;
    
    if (!telegramId) {
        return res.status(401).json({ error: 'Требуется авторизация' });
    }
    
    // Проверяем владельца
    db.get('SELECT * FROM items WHERE id = ?', [id], (err, item) => {
        if (err) {
            console.error('❌ Ошибка получения item:', err);
            return res.status(500).json({ error: 'Ошибка сервера' });
        }
        if (!item) return res.status(404).json({ error: 'Не найдено' });
        if (item.telegram_id !== telegramId) {
            return res.status(403).json({ error: 'Нет прав' });
        }
        
        const allowed = ['title', 'description', 'category', 'condition', 'status'];
        const fields = [];
        const values = [];
        
        for (const key of allowed) {
            if (updates[key] !== undefined) {
                fields.push(`${key} = ?`);
                values.push(updates[key]);
            }
        }
        
        if (fields.length === 0) {
            return res.json(item);
        }
        
        fields.push('updated_at = datetime("now")');
        values.push(id);
        
        db.run(`UPDATE items SET ${fields.join(', ')} WHERE id = ?`, values, (err) => {
            if (err) {
                console.error('❌ Ошибка обновления item:', err);
                return res.status(500).json({ error: 'Ошибка сервера' });
            }
            
            db.get('SELECT * FROM items WHERE id = ?', [id], (err, updated) => {
                if (err) {
                    console.error('❌ Ошибка получения обновленного item:', err);
                    return res.status(500).json({ error: 'Ошибка сервера' });
                }
                res.json(updated);
            });
        });
    });
});

// DELETE /api/items/:id
router.delete('/:id', (req, res) => {
    const db = getDatabase();
    const telegramId = getTelegramId(req);
    const { id } = req.params;
    
    if (!telegramId) {
        return res.status(401).json({ error: 'Требуется авторизация' });
    }
    
    db.get('SELECT * FROM items WHERE id = ?', [id], (err, item) => {
        if (err) {
            console.error('❌ Ошибка получения item:', err);
            return res.status(500).json({ error: 'Ошибка сервера' });
        }
        if (!item) return res.status(404).json({ error: 'Не найдено' });
        if (item.telegram_id !== telegramId) {
            return res.status(403).json({ error: 'Нет прав' });
        }
        
        db.run('DELETE FROM items WHERE id = ?', [id], (err) => {
            if (err) {
                console.error('❌ Ошибка удаления item:', err);
                return res.status(500).json({ error: 'Ошибка сервера' });
            }
            res.json({ success: true });
        });
    });
});

// POST /api/items/:id/taken - отметить как забранное
router.post('/:id/taken', (req, res) => {
    const db = getDatabase();
    const telegramId = getTelegramId(req);
    const { id } = req.params;
    
    if (!telegramId) {
        return res.status(401).json({ error: 'Требуется авторизация' });
    }
    
    db.run(
        `UPDATE items SET status = 'taken', taken_by = ?, taken_at = datetime('now') WHERE id = ?`,
        [telegramId, id],
        function(err) {
            if (err) {
                console.error('❌ Ошибка обновления статуса item:', err);
                return res.status(500).json({ error: 'Ошибка сервера' });
            }
            
            // Добавляем карму владельцу
            db.get('SELECT telegram_id FROM items WHERE id = ?', [id], (err, item) => {
                if (err) {
                    console.warn('⚠️ Ошибка получения telegram_id для кармы:', err);
                } else if (item) {
                    db.run('UPDATE users SET karma = karma + 25 WHERE telegram_id = ?', [item.telegram_id], (err) => {
                        if (err) console.warn('⚠️ Ошибка обновления karma:', err);
                    });
                }
            });
            
            db.get('SELECT * FROM items WHERE id = ?', [id], (err, item) => {
                if (err) {
                    console.error('❌ Ошибка получения обновленного item:', err);
                    return res.status(500).json({ error: 'Ошибка сервера' });
                }
                res.json(item);
            });
        }
    );
});

// POST /api/items/:id/extend - продлить
router.post('/:id/extend', (req, res) => {
    const db = getDatabase();
    const telegramId = getTelegramId(req);
    const { id } = req.params;
    
    if (!telegramId) {
        return res.status(401).json({ error: 'Требуется авторизация' });
    }
    
    const newExpires = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();
    
    db.run(
        `UPDATE items SET expires_at = ?, updated_at = datetime('now') WHERE id = ? AND telegram_id = ?`,
        [newExpires, id, telegramId],
        function(err) {
            if (err) {
                console.error('❌ Ошибка продления item:', err);
                return res.status(500).json({ error: 'Ошибка сервера' });
            }
            
            if (this.changes === 0) {
                return res.status(403).json({ error: 'Нет прав или объявление не найдено' });
            }
            
            // Добавляем карму
            db.run('UPDATE users SET karma = karma + 2 WHERE telegram_id = ?', [telegramId], (err) => {
                if (err) console.warn('⚠️ Ошибка обновления karma:', err);
            });
            
            db.get('SELECT * FROM items WHERE id = ?', [id], (err, item) => {
                if (err) {
                    console.error('❌ Ошибка получения продленного item:', err);
                    return res.status(500).json({ error: 'Ошибка сервера' });
                }
                res.json(item);
            });
        }
    );
});

module.exports = router;
