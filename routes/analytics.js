// routes/analytics.js - PostgreSQL версия
const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/auth');
const { pool } = require('../db/database');

// GET /api/analytics - статистика для админов
router.get('/', requireAdmin, async (req, res) => {
    try {
        // Auto-expire items - сначала обновляем просроченные
        const expireResult = await pool.query(
            "UPDATE items SET status = 'expired', updated_at = NOW() WHERE status = 'active' AND expires_at < NOW()"
        );
        console.log('⏰ Автоматически просрочено объявлений:', expireResult.rowCount);
        
        // Get item stats - считаем ТОЛЬКО реально активные (не просроченные)
        const statsResult = await pool.query(`
            SELECT 
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE status = 'active' AND expires_at >= NOW()) as active,
                COUNT(*) FILTER (WHERE status = 'taken') as taken,
                COUNT(*) FILTER (WHERE status = 'expired' OR (status = 'active' AND expires_at < NOW())) as expired,
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
        
        const result = {
            totalItems: parseInt(stats.total) || 0,
            activeItems: parseInt(stats.active) || 0,
            takenItems: parseInt(stats.taken) || 0,
            expiredItems: parseInt(stats.expired) || 0,
            hiddenItems: parseInt(stats.hidden) || 0,
            totalReports: parseInt(reports.total) || 0,
            pendingReports: parseInt(reports.pending) || 0,
            totalUsers: parseInt(users.total) || 0
        };
        
        console.log('📊 Analytics result:', result);
        res.json(result);
    } catch (error) {
        console.error('❌ Analytics error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
