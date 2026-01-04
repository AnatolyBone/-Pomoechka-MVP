const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/auth');
const { getDatabase } = require('../db/database');

// Get analytics (admin only)
router.get('/', requireAdmin, async (req, res) => {
    try {
        const db = getDatabase();
        const now = Date.now();
        
        // Auto-expire items first
        await new Promise((resolve, reject) => {
            db.run(
                'UPDATE items SET status = ?, updated_at = ? WHERE status = ? AND expires_at < ?',
                ['expired', now, 'active', now],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
        
        // Get counts
        const stats = await new Promise((resolve, reject) => {
            db.get(
                `SELECT 
                    COUNT(*) as totalItems,
                    SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as activeItems,
                    SUM(CASE WHEN status = 'taken' THEN 1 ELSE 0 END) as takenItems,
                    SUM(CASE WHEN status = 'expired' THEN 1 ELSE 0 END) as expiredItems,
                    SUM(CASE WHEN status = 'hidden' THEN 1 ELSE 0 END) as hiddenItems
                FROM items`,
                [],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
        
        // Get reports count
        const reports = await new Promise((resolve, reject) => {
            db.get(
                `SELECT 
                    COUNT(*) as totalReports,
                    SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pendingReports
                FROM reports`,
                [],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
        
        // Get users count
        const users = await new Promise((resolve, reject) => {
            db.get(
                'SELECT COUNT(*) as totalUsers FROM users',
                [],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
        
        res.json({
            totalItems: stats.totalItems || 0,
            activeItems: stats.activeItems || 0,
            takenItems: stats.takenItems || 0,
            expiredItems: stats.expiredItems || 0,
            hiddenItems: stats.hiddenItems || 0,
            totalReports: reports.totalReports || 0,
            pendingReports: reports.pendingReports || 0,
            totalUsers: users.totalUsers || 0
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;

