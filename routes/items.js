const express = require('express');
const router = express.Router();
const { verifyTelegramAuth, getOrCreateUser } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/auth');
const { getDatabase } = require('../db/database');

// Get all items with filters
router.get('/', async (req, res) => {
    try {
        const db = getDatabase();
        const {
            status,
            category,
            maxDistance,
            search,
            authorId,
            limit = 100,
            offset = 0
        } = req.query;
        
        let query = 'SELECT * FROM items WHERE 1=1';
        const params = [];
        
        if (status) {
            query += ' AND status = ?';
            params.push(status);
        }
        
        if (category) {
            query += ' AND category = ?';
            params.push(category);
        }
        
        if (search) {
            query += ' AND (title LIKE ? OR description LIKE ?)';
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm);
        }
        
        if (authorId) {
            query += ' AND author_id = ?';
            params.push(authorId);
        }
        
        // Auto-expire items
        const now = Date.now();
        db.run(
            'UPDATE items SET status = ?, updated_at = ? WHERE status = ? AND expires_at < ?',
            ['expired', now, 'active', now]
        );
        
        query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));
        
        const items = await new Promise((resolve, reject) => {
            db.all(query, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        
        // Format items
        const formattedItems = await Promise.all(
            items.map(item => formatItem(item, db))
        );
        
        res.json(formattedItems);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get single item
router.get('/:id', async (req, res) => {
    try {
        const db = getDatabase();
        const item = await new Promise((resolve, reject) => {
            db.get(
                'SELECT * FROM items WHERE id = ?',
                [req.params.id],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
        
        if (!item) {
            return res.status(404).json({ error: 'Item not found' });
        }
        
        const formatted = await formatItem(item, db);
        res.json(formatted);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create item
router.post('/', verifyTelegramAuth, async (req, res) => {
    try {
        const db = getDatabase();
        const user = await getOrCreateUser(req.telegramId, req.body.userData);
        
        const {
            title,
            description,
            category,
            emoji,
            photoUrl,
            location,
            chatEnabled = true
        } = req.body;
        
        if (!title || !category || !location) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        // Get item lifetime from settings
        const settings = await new Promise((resolve, reject) => {
            db.get(
                'SELECT value FROM settings WHERE key = ?',
                ['item_lifetime_hours'],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
        
        const lifetimeHours = parseInt(settings?.value || '6');
        const now = Date.now();
        const expiresAt = now + (lifetimeHours * 60 * 60 * 1000);
        
        const itemId = await new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO items (
                    title, description, category, emoji, photo_url,
                    location_address, location_details, location_lat, location_lng,
                    author_id, status, chat_enabled, views, reports_count,
                    expires_at, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, 0, 0, ?, ?, ?)`,
                [
                    title,
                    description || '',
                    category,
                    emoji || null,
                    photoUrl || null,
                    location.address,
                    location.details || '',
                    location.lat,
                    location.lng,
                    user.id,
                    chatEnabled ? 1 : 0,
                    expiresAt,
                    now,
                    now
                ],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });
        
        // Update user stats
        db.run(
            'UPDATE users SET stats_published = stats_published + 1, updated_at = ? WHERE id = ?',
            [now, user.id]
        );
        
        // Add karma
        const karmaPublish = await new Promise((resolve, reject) => {
            db.get(
                'SELECT value FROM settings WHERE key = ?',
                ['karma_publish'],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
        
        const karmaAmount = parseInt(karmaPublish?.value || '10');
        db.run(
            'UPDATE users SET karma = karma + ?, updated_at = ? WHERE id = ?',
            [karmaAmount, now, user.id]
        );
        
        // Get created item
        const item = await new Promise((resolve, reject) => {
            db.get(
                'SELECT * FROM items WHERE id = ?',
                [itemId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
        
        const formatted = await formatItem(item, db);
        res.status(201).json(formatted);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update item
router.patch('/:id', verifyTelegramAuth, async (req, res) => {
    try {
        const db = getDatabase();
        const user = await getOrCreateUser(req.telegramId);
        
        // Check if user owns the item or is admin
        const item = await new Promise((resolve, reject) => {
            db.get(
                'SELECT * FROM items WHERE id = ?',
                [req.params.id],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
        
        if (!item) {
            return res.status(404).json({ error: 'Item not found' });
        }
        
        // Check admin
        const admin = await new Promise((resolve, reject) => {
            db.get(
                'SELECT * FROM admins WHERE telegram_id = ?',
                [req.telegramId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
        
        const isAdmin = !!admin;
        const isOwner = item.author_id === user.id;
        
        if (!isOwner && !isAdmin) {
            return res.status(403).json({ error: 'Permission denied' });
        }
        
        // Build update query
        const updates = [];
        const values = [];
        const allowedFields = ['status', 'title', 'description', 'category', 'emoji', 'photo_url', 'chat_enabled', 'reports_count'];
        
        Object.keys(req.body).forEach(key => {
            if (allowedFields.includes(key)) {
                updates.push(`${key} = ?`);
                values.push(req.body[key]);
            }
        });
        
        if (req.body.location) {
            updates.push('location_address = ?', 'location_details = ?', 'location_lat = ?', 'location_lng = ?');
            values.push(
                req.body.location.address,
                req.body.location.details || '',
                req.body.location.lat,
                req.body.location.lng
            );
        }
        
        if (updates.length === 0) {
            return res.status(400).json({ error: 'No valid fields to update' });
        }
        
        updates.push('updated_at = ?');
        values.push(Date.now());
        values.push(req.params.id);
        
        await new Promise((resolve, reject) => {
            db.run(
                `UPDATE items SET ${updates.join(', ')} WHERE id = ?`,
                values,
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
        
        // Get updated item
        const updatedItem = await new Promise((resolve, reject) => {
            db.get(
                'SELECT * FROM items WHERE id = ?',
                [req.params.id],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
        
        const formatted = await formatItem(updatedItem, db);
        res.json(formatted);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete item
router.delete('/:id', verifyTelegramAuth, async (req, res) => {
    try {
        const db = getDatabase();
        const user = await getOrCreateUser(req.telegramId);
        
        const item = await new Promise((resolve, reject) => {
            db.get(
                'SELECT * FROM items WHERE id = ?',
                [req.params.id],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
        
        if (!item) {
            return res.status(404).json({ error: 'Item not found' });
        }
        
        // Check admin
        const admin = await new Promise((resolve, reject) => {
            db.get(
                'SELECT * FROM admins WHERE telegram_id = ?',
                [req.telegramId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
        
        const isAdmin = !!admin;
        const isOwner = item.author_id === user.id;
        
        if (!isOwner && !isAdmin) {
            return res.status(403).json({ error: 'Permission denied' });
        }
        
        await new Promise((resolve, reject) => {
            db.run(
                'DELETE FROM items WHERE id = ?',
                [req.params.id],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Mark item as taken
router.post('/:id/taken', verifyTelegramAuth, async (req, res) => {
    try {
        const db = getDatabase();
        const user = await getOrCreateUser(req.telegramId);
        const now = Date.now();
        
        const item = await new Promise((resolve, reject) => {
            db.get(
                'SELECT * FROM items WHERE id = ?',
                [req.params.id],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
        
        if (!item) {
            return res.status(404).json({ error: 'Item not found' });
        }
        
        // Update item
        await new Promise((resolve, reject) => {
            db.run(
                'UPDATE items SET status = ?, taken_at = ?, updated_at = ? WHERE id = ?',
                ['taken', now, now, req.params.id],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
        
        // Award karma to author
        const karmaTaken = await new Promise((resolve, reject) => {
            db.get(
                'SELECT value FROM settings WHERE key = ?',
                ['karma_taken'],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
        
        const karmaAmount = parseInt(karmaTaken?.value || '25');
        db.run(
            'UPDATE users SET karma = karma + ?, stats_taken = stats_taken + 1, updated_at = ? WHERE id = ?',
            [karmaAmount, now, item.author_id]
        );
        
        // Check for fast pickup achievement
        if (item.created_at && (now - item.created_at < 30 * 60 * 1000)) {
            db.run(
                'UPDATE users SET stats_fast_pickups = stats_fast_pickups + 1 WHERE id = ?',
                [item.author_id]
            );
        }
        
        const updatedItem = await new Promise((resolve, reject) => {
            db.get(
                'SELECT * FROM items WHERE id = ?',
                [req.params.id],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
        
        const formatted = await formatItem(updatedItem, db);
        res.json(formatted);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Extend item lifetime
router.post('/:id/extend', verifyTelegramAuth, async (req, res) => {
    try {
        const db = getDatabase();
        const user = await getOrCreateUser(req.telegramId);
        
        const item = await new Promise((resolve, reject) => {
            db.get(
                'SELECT * FROM items WHERE id = ?',
                [req.params.id],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
        
        if (!item) {
            return res.status(404).json({ error: 'Item not found' });
        }
        
        if (item.author_id !== user.id) {
            return res.status(403).json({ error: 'Permission denied' });
        }
        
        const settings = await new Promise((resolve, reject) => {
            db.get(
                'SELECT value FROM settings WHERE key = ?',
                ['item_lifetime_hours'],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
        
        const lifetimeHours = parseInt(settings?.value || '6');
        const now = Date.now();
        const base = Math.max(item.expires_at, now);
        const newExpiresAt = base + (lifetimeHours * 60 * 60 * 1000);
        
        await new Promise((resolve, reject) => {
            db.run(
                'UPDATE items SET expires_at = ?, status = ?, updated_at = ? WHERE id = ?',
                [newExpiresAt, 'active', now, req.params.id],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
        
        // Add karma for extending
        const karmaExtend = await new Promise((resolve, reject) => {
            db.get(
                'SELECT value FROM settings WHERE key = ?',
                ['karma_extend'],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
        
        const karmaAmount = parseInt(karmaExtend?.value || '2');
        db.run(
            'UPDATE users SET karma = karma + ?, updated_at = ? WHERE id = ?',
            [karmaAmount, now, user.id]
        );
        
        const updatedItem = await new Promise((resolve, reject) => {
            db.get(
                'SELECT * FROM items WHERE id = ?',
                [req.params.id],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
        
        const formatted = await formatItem(updatedItem, db);
        res.json(formatted);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Format item with author info
async function formatItem(item, db) {
    if (!item) return null;
    
    const author = await new Promise((resolve, reject) => {
        db.get(
            'SELECT * FROM users WHERE id = ?',
            [item.author_id],
            (err, row) => {
                if (err) reject(err);
                else resolve(row);
            }
        );
    });
    
    return {
        id: item.id,
        title: item.title,
        description: item.description,
        category: item.category,
        emoji: item.emoji,
        photoUrl: item.photo_url,
        location: {
            address: item.location_address,
            details: item.location_details,
            lat: item.location_lat,
            lng: item.location_lng,
            distance: item.location_distance || 0
        },
        author: author ? {
            id: author.id,
            telegramId: author.telegram_id,
            name: author.name,
            username: author.username,
            initial: author.initial,
            karma: author.karma,
            color: 'emerald' // Default color
        } : null,
        status: item.status,
        chatEnabled: item.chat_enabled === 1,
        views: item.views,
        reports: item.reports_count,
        expiresAt: item.expires_at,
        takenAt: item.taken_at,
        createdAt: item.created_at,
        updatedAt: item.updated_at
    };
}

module.exports = router;

