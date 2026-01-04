const express = require('express');
const router = express.Router();
const { requireAdmin, requireCreator } = require('../middleware/auth');
const { getDatabase } = require('../db/database');

// Get admin settings
router.get('/settings', requireAdmin, async (req, res) => {
    try {
        const db = getDatabase();
        const settings = await new Promise((resolve, reject) => {
            db.all(
                'SELECT key, value FROM settings',
                [],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });
        
        const formatted = {};
        settings.forEach(s => {
            formatted[s.key] = s.value;
        });
        
        // Get creator ID
        const creator = await new Promise((resolve, reject) => {
            db.get(
                'SELECT telegram_id FROM admins WHERE is_creator = 1',
                [],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
        
        // Get admin IDs
        const admins = await new Promise((resolve, reject) => {
            db.all(
                'SELECT telegram_id FROM admins WHERE is_creator = 0',
                [],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });
        
        res.json({
            creatorId: creator?.telegram_id || null,
            adminIds: admins.map(a => a.telegram_id),
            itemLifetime: parseInt(formatted.item_lifetime_hours || '6'),
            autoHideReports: parseInt(formatted.auto_hide_reports || '3'),
            requirePhoto: formatted.require_photo === '1',
            preModeration: formatted.pre_moderation === '1',
            karma: {
                publish: parseInt(formatted.karma_publish || '10'),
                taken: parseInt(formatted.karma_taken || '25'),
                extend: parseInt(formatted.karma_extend || '2'),
                thanks: parseInt(formatted.karma_thanks || '5')
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update admin settings
router.post('/settings', requireAdmin, async (req, res) => {
    try {
        const db = getDatabase();
        const now = Date.now();
        
        const updates = {
            item_lifetime_hours: req.body.itemLifetime?.toString(),
            auto_hide_reports: req.body.autoHideReports?.toString(),
            require_photo: req.body.requirePhoto ? '1' : '0',
            pre_moderation: req.body.preModeration ? '1' : '0',
            karma_publish: req.body.karma?.publish?.toString(),
            karma_taken: req.body.karma?.taken?.toString(),
            karma_extend: req.body.karma?.extend?.toString(),
            karma_thanks: req.body.karma?.thanks?.toString()
        };
        
        for (const [key, value] of Object.entries(updates)) {
            if (value !== undefined) {
                await new Promise((resolve, reject) => {
                    db.run(
                        'UPDATE settings SET value = ?, updated_at = ? WHERE key = ?',
                        [value, now, key],
                        (err) => {
                            if (err) reject(err);
                            else resolve();
                        }
                    );
                });
            }
        }
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get admins list (creator only)
router.get('/admins', requireCreator, async (req, res) => {
    try {
        const db = getDatabase();
        const admins = await new Promise((resolve, reject) => {
            db.all(
                'SELECT * FROM admins ORDER BY is_creator DESC, created_at ASC',
                [],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });
        
        const formatted = admins.map(a => ({
            id: a.id,
            telegramId: a.telegram_id,
            isCreator: a.is_creator === 1,
            createdAt: a.created_at
        }));
        
        res.json(formatted);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Add admin (creator only)
router.post('/admins', requireCreator, async (req, res) => {
    try {
        const db = getDatabase();
        const { telegramId } = req.body;
        
        if (!telegramId) {
            return res.status(400).json({ error: 'Telegram ID required' });
        }
        
        // Check if already admin
        const existing = await new Promise((resolve, reject) => {
            db.get(
                'SELECT * FROM admins WHERE telegram_id = ?',
                [telegramId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
        
        if (existing) {
            return res.status(400).json({ error: 'User is already an admin' });
        }
        
        const now = Date.now();
        await new Promise((resolve, reject) => {
            db.run(
                'INSERT INTO admins (telegram_id, is_creator, created_by, created_at) VALUES (?, 0, ?, ?)',
                [telegramId, req.adminId, now],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });
        
        res.json({ success: true, message: 'Admin added' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Remove admin (creator only)
router.delete('/admins/:telegramId', requireCreator, async (req, res) => {
    try {
        const db = getDatabase();
        const telegramId = parseInt(req.params.telegramId);
        
        // Don't allow removing creator
        const admin = await new Promise((resolve, reject) => {
            db.get(
                'SELECT * FROM admins WHERE telegram_id = ?',
                [telegramId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
        
        if (!admin) {
            return res.status(404).json({ error: 'Admin not found' });
        }
        
        if (admin.is_creator === 1) {
            return res.status(400).json({ error: 'Cannot remove creator' });
        }
        
        await new Promise((resolve, reject) => {
            db.run(
                'DELETE FROM admins WHERE telegram_id = ? AND is_creator = 0',
                [telegramId],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
        
        res.json({ success: true, message: 'Admin removed' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;

