const express = require('express');
const router = express.Router();
const { verifyTelegramAuth, getOrCreateUser } = require('../middleware/auth');
const { getDatabase } = require('../db/database');

// Check if user is admin
router.get('/check-admin', verifyTelegramAuth, async (req, res) => {
    try {
        const db = getDatabase();
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
        
        res.json({
            isAdmin: !!admin,
            isCreator: admin?.is_creator === 1
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Initialize creator (first time setup)
router.post('/setup-creator', verifyTelegramAuth, async (req, res) => {
    try {
        const db = getDatabase();
        
        // Check if creator already exists
        const existingCreator = await new Promise((resolve, reject) => {
            db.get(
                'SELECT * FROM admins WHERE is_creator = 1',
                [],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
        
        if (existingCreator) {
            return res.status(400).json({ 
                error: 'Creator already exists',
                creatorId: existingCreator.telegram_id
            });
        }
        
        // Create creator
        const now = Date.now();
        await new Promise((resolve, reject) => {
            db.run(
                'INSERT INTO admins (telegram_id, is_creator, created_at) VALUES (?, 1, ?)',
                [req.telegramId, now],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });
        
        // Create or get user
        const user = await getOrCreateUser(req.telegramId, req.body);
        
        res.json({
            success: true,
            message: 'Creator initialized',
            creatorId: req.telegramId,
            user
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get current user
router.get('/me', verifyTelegramAuth, async (req, res) => {
    try {
        const user = await getOrCreateUser(req.telegramId, req.body);
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;

