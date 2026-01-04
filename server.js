const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { initDatabase } = require('./db/database');
const { verifyTelegramAuth } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
// CORS - разрешаем запросы с фронтенда
const allowedOrigins = [
    'http://localhost:8000',
    'http://localhost:3000',
    'http://127.0.0.1:8000',
    // Добавьте ваш Netlify URL после деплоя
    // 'https://pomoechka-xyz123.netlify.app',
    // 'https://your-custom-domain.com'
];

app.use(cors({
    origin: function (origin, callback) {
        // Разрешаем запросы без origin (например, из Postman или мобильных приложений)
        if (!origin) return callback(null, true);
        
        // В продакшне разрешаем все origin (для MVP это нормально)
        // В будущем можно ограничить конкретными доменами
        if (process.env.NODE_ENV === 'production') {
            return callback(null, true);
        }
        
        // В разработке проверяем список разрешенных
        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            // Разрешаем все для разработки
            callback(null, true);
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Telegram-ID']
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// === Items API ===
const itemsRoutes = require('./routes/items');
app.use('/api/items', itemsRoutes);

// === Users API ===
const usersRoutes = require('./routes/users');
app.use('/api/users', usersRoutes);

// === Reports API ===
const reportsRoutes = require('./routes/reports');
app.use('/api/reports', reportsRoutes);

// === Analytics API ===
const analyticsRoutes = require('./routes/analytics');
app.use('/api/analytics', analyticsRoutes);

// === Admin API ===
const adminRoutes = require('./routes/admin');
app.use('/api/admin', adminRoutes);

// === Auth API ===
const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);

// Error handling
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({ error: 'Internal server error', message: err.message });
});

// Initialize database and start server
initDatabase().then(() => {
    app.listen(PORT, () => {
        console.log(`🚀 Server running on http://localhost:${PORT}`);
        console.log(`📊 Health check: http://localhost:${PORT}/health`);
    });
}).catch(err => {
    console.error('❌ Failed to initialize database:', err);
    process.exit(1);
});

module.exports = app;

