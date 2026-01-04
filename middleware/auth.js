const { getDatabase } = require('../db/database');

/**
 * Verify Telegram WebApp authentication
 * Checks if the request has valid Telegram initData
 */
function verifyTelegramAuth(req, res, next) {
    // In production, verify Telegram initData signature
    // For now, we'll accept telegram_id from headers or body
    
    const telegramId = req.headers['x-telegram-id'] || req.body.telegram_id || req.query.telegram_id;
    
    if (!telegramId) {
        return res.status(401).json({ error: 'Telegram authentication required' });
    }
    
    req.telegramId = parseInt(telegramId);
    next();
}

/**
 * Check if user is admin
 */
async function requireAdmin(req, res, next) {
    const telegramId = req.telegramId;
    
    if (!telegramId) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    
    const db = getDatabase();
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
        return res.status(403).json({ error: 'Admin access required' });
    }
    
    req.isCreator = admin.is_creator === 1;
    req.adminId = admin.id;
    next();
}

/**
 * Check if user is creator
 */
async function requireCreator(req, res, next) {
    const telegramId = req.telegramId;
    
    if (!telegramId) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    
    const db = getDatabase();
    const admin = await new Promise((resolve, reject) => {
        db.get(
            'SELECT * FROM admins WHERE telegram_id = ? AND is_creator = 1',
            [telegramId],
            (err, row) => {
                if (err) reject(err);
                else resolve(row);
            }
        );
    });
    
    if (!admin) {
        return res.status(403).json({ error: 'Creator access required' });
    }
    
    req.isCreator = true;
    req.adminId = admin.id;
    next();
}

/**
 * Get or create user from Telegram ID
 */
async function getOrCreateUser(telegramId, userData = {}) {
    const db = getDatabase();
    
    // Try to get existing user
    let user = await new Promise((resolve, reject) => {
        db.get(
            'SELECT * FROM users WHERE telegram_id = ?',
            [telegramId],
            (err, row) => {
                if (err) reject(err);
                else resolve(row);
            }
        );
    });
    
    if (user) {
        // Update user data if provided
        if (userData.name || userData.username) {
            const updates = [];
            const values = [];
            
            if (userData.name) {
                updates.push('name = ?');
                values.push(userData.name);
                updates.push('initial = ?');
                values.push(userData.name.charAt(0).toUpperCase());
            }
            if (userData.username !== undefined) {
                updates.push('username = ?');
                values.push(userData.username);
            }
            
            if (updates.length > 0) {
                updates.push('updated_at = ?');
                values.push(Date.now());
                values.push(telegramId);
                
                await new Promise((resolve, reject) => {
                    db.run(
                        `UPDATE users SET ${updates.join(', ')} WHERE telegram_id = ?`,
                        values,
                        (err) => {
                            if (err) reject(err);
                            else resolve();
                        }
                    );
                });
                
                // Reload user
                user = await new Promise((resolve, reject) => {
                    db.get(
                        'SELECT * FROM users WHERE telegram_id = ?',
                        [telegramId],
                        (err, row) => {
                            if (err) reject(err);
                            else resolve(row);
                        }
                    );
                });
            }
        }
        
        return formatUser(user);
    }
    
    // Create new user
    const now = Date.now();
    const name = userData.name || userData.first_name || 'Пользователь';
    const initial = name.charAt(0).toUpperCase();
    
    const userId = await new Promise((resolve, reject) => {
        db.run(
            `INSERT INTO users (
                telegram_id, name, username, initial, karma,
                stats_published, stats_taken, stats_saved_kg,
                stats_fast_pickups, stats_thanks, stats_reliability,
                achievements, created_at, updated_at
            ) VALUES (?, ?, ?, ?, 0, 0, 0, 0, 0, 0, 100, '[]', ?, ?)`,
            [
                telegramId,
                name,
                userData.username || null,
                initial,
                now,
                now
            ],
            function(err) {
                if (err) reject(err);
                else resolve(this.lastID);
            }
        );
    });
    
    // Get created user
    user = await new Promise((resolve, reject) => {
        db.get(
            'SELECT * FROM users WHERE id = ?',
            [userId],
            (err, row) => {
                if (err) reject(err);
                else resolve(row);
            }
        );
    });
    
    return formatUser(user);
}

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

module.exports = {
    verifyTelegramAuth,
    requireAdmin,
    requireCreator,
    getOrCreateUser,
    formatUser
};

