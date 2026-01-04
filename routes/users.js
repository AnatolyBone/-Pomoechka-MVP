const express = require('express');
const router = express.Router();
const { verifyTelegramAuth, getOrCreateUser } = require('../middleware/auth');
const { getDatabase } = require('../db/database');

// Get current user
router.get('/me', verifyTelegramAuth, async (req, res) => {
    try {
        const user = await getOrCreateUser(req.telegramId, req.body);
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update user
router.patch('/me', verifyTelegramAuth, async (req, res) => {
    try {
        const db = getDatabase();
        const user = await getOrCreateUser(req.telegramId);
        
        const updates = [];
        const values = [];
        const allowedFields = ['name', 'username', 'initial'];
        
        Object.keys(req.body).forEach(key => {
            if (allowedFields.includes(key)) {
                updates.push(`${key} = ?`);
                values.push(req.body[key]);
            }
        });
        
        if (updates.length === 0) {
            return res.status(400).json({ error: 'No valid fields to update' });
        }
        
        updates.push('updated_at = ?');
        values.push(Date.now());
        values.push(user.id);
        
        await new Promise((resolve, reject) => {
            db.run(
                `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
                values,
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
        
        // Reload user
        const updatedUser = await new Promise((resolve, reject) => {
            db.get(
                'SELECT * FROM users WHERE id = ?',
                [user.id],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
        
        const formatted = formatUser(updatedUser);
        res.json(formatted);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Add karma
router.post('/karma', verifyTelegramAuth, async (req, res) => {
    try {
        const db = getDatabase();
        const user = await getOrCreateUser(req.telegramId);
        const { amount } = req.body;
        
        if (!amount || amount <= 0) {
            return res.status(400).json({ error: 'Invalid karma amount' });
        }
        
        const now = Date.now();
        await new Promise((resolve, reject) => {
            db.run(
                'UPDATE users SET karma = karma + ?, updated_at = ? WHERE id = ?',
                [amount, now, user.id],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
        
        // Reload user
        const updatedUser = await new Promise((resolve, reject) => {
            db.get(
                'SELECT * FROM users WHERE id = ?',
                [user.id],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
        
        res.json({ karma: updatedUser.karma });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

function formatUser(user) {
    if (!user) return null;
    
    return {
        id: user.id,
        telegramId: user.telegram_id,
        name: user.name,
        username: user.username,
        initial: user.initial,
        karma: user.karma,
        stats: {
            published: user.stats_published,
            taken: user.stats_taken,
            savedKg: user.stats_saved_kg,
            fastPickups: user.stats_fast_pickups,
            thanks: user.stats_thanks,
            reliability: user.stats_reliability
        },
        achievements: JSON.parse(user.achievements || '[]'),
        createdAt: user.created_at,
        updatedAt: user.updated_at
    };
}

module.exports = router;

