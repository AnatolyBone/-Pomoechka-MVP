// routes/analytics.js - PostgreSQL версия
const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/auth');
const { pool } = require('../db/database');

// GET /api/analytics - статистика для админов
router.get('/', requireAdmin, async (req, res) => {
    try {
        // Auto-expire items
        await pool.query(
            "UPDATE items SET status = 'expired', updated_at = NOW() WHERE status = 'active' AND expires_at < NOW()"
        );
        
        // Get item stats
        const statsResult = await pool.query(`
            SELECT 
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE status = 'active') as active,
                COUNT(*) FILTER (WHERE status = 'taken') as taken,
                COUNT(*) FILTER (WHERE status = 'expired') as expired,
                COUNT(*) FILTER (WHERE status = 'hidden') as hidden
            FROM items
        `);
        const stats = statsResult.rows[0];
        
        // Get reports count
        const reportsResult = await pool.query(`
            SELECT 
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE status = 'pending') as pending
            FROM reports
        `);
        const reports = reportsResult.rows[0];
        
        // Get users count
        const usersResult = await pool.query('SELECT COUNT(*) as total FROM users');
        const users = usersResult.rows[0];
        
        res.json({
            totalItems: parseInt(stats.total) || 0,
            activeItems: parseInt(stats.active) || 0,
            takenItems: parseInt(stats.taken) || 0,
            expiredItems: parseInt(stats.expired) || 0,
            hiddenItems: parseInt(stats.hidden) || 0,
            totalReports: parseInt(reports.total) || 0,
            pendingReports: parseInt(reports.pending) || 0,
            totalUsers: parseInt(users.total) || 0
        });
    } catch (error) {
        console.error('❌ Analytics error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
