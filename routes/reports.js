const express = require('express');
const router = express.Router();
const { verifyTelegramAuth, getOrCreateUser } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/auth');
const { getDatabase } = require('../db/database');

// Create report
router.post('/', verifyTelegramAuth, async (req, res) => {
    try {
        const db = getDatabase();
        const user = await getOrCreateUser(req.telegramId);
        const { itemId, reason } = req.body;
        
        if (!itemId || !reason) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        // Check if item exists
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
        
        if (!item) {
            return res.status(404).json({ error: 'Item not found' });
        }
        
        // Check if user already reported this item
        const existingReport = await new Promise((resolve, reject) => {
            db.get(
                'SELECT * FROM reports WHERE item_id = ? AND reporter_id = ?',
                [itemId, user.id],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
        
        if (existingReport) {
            return res.status(400).json({ error: 'Already reported' });
        }
        
        const now = Date.now();
        const reportId = await new Promise((resolve, reject) => {
            db.run(
                'INSERT INTO reports (item_id, reporter_id, reason, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
                [itemId, user.id, reason, 'pending', now, now],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });
        
        // Increment reports count on item
        await new Promise((resolve, reject) => {
            db.run(
                'UPDATE items SET reports_count = reports_count + 1, updated_at = ? WHERE id = ?',
                [now, itemId],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
        
        // Check auto-hide threshold
        const autoHideReports = await new Promise((resolve, reject) => {
            db.get(
                'SELECT value FROM settings WHERE key = ?',
                ['auto_hide_reports'],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
        
        const threshold = parseInt(autoHideReports?.value || '3');
        const newCount = item.reports_count + 1;
        
        if (newCount >= threshold) {
            await new Promise((resolve, reject) => {
                db.run(
                    'UPDATE items SET status = ?, updated_at = ? WHERE id = ?',
                    ['hidden', now, itemId],
                    (err) => {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });
        }
        
        const report = await new Promise((resolve, reject) => {
            db.get(
                'SELECT * FROM reports WHERE id = ?',
                [reportId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
        
        res.status(201).json(formatReport(report));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get reports (admin only)
router.get('/', requireAdmin, async (req, res) => {
    try {
        const db = getDatabase();
        const { status } = req.query;
        
        let query = 'SELECT * FROM reports WHERE 1=1';
        const params = [];
        
        if (status) {
            query += ' AND status = ?';
            params.push(status);
        }
        
        query += ' ORDER BY created_at DESC';
        
        const reports = await new Promise((resolve, reject) => {
            db.all(query, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        
        const formatted = reports.map(r => formatReport(r));
        res.json(formatted);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Resolve report (admin only)
router.patch('/:id/resolve', requireAdmin, async (req, res) => {
    try {
        const db = getDatabase();
        const { hideItem } = req.body;
        const now = Date.now();
        
        const report = await new Promise((resolve, reject) => {
            db.get(
                'SELECT * FROM reports WHERE id = ?',
                [req.params.id],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
        
        if (!report) {
            return res.status(404).json({ error: 'Report not found' });
        }
        
        // Update report status
        await new Promise((resolve, reject) => {
            db.run(
                'UPDATE reports SET status = ?, updated_at = ? WHERE id = ?',
                ['resolved', now, req.params.id],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
        
        // Hide item if requested
        if (hideItem) {
            await new Promise((resolve, reject) => {
                db.run(
                    'UPDATE items SET status = ?, updated_at = ? WHERE id = ?',
                    ['hidden', now, report.item_id],
                    (err) => {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });
        }
        
        const updatedReport = await new Promise((resolve, reject) => {
            db.get(
                'SELECT * FROM reports WHERE id = ?',
                [req.params.id],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
        
        res.json(formatReport(updatedReport));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

function formatReport(report) {
    if (!report) return null;
    
    return {
        id: report.id,
        itemId: report.item_id,
        reporterId: report.reporter_id,
        reason: report.reason,
        status: report.status,
        createdAt: report.created_at,
        updatedAt: report.updated_at
    };
}

module.exports = router;

