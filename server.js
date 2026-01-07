// server.js
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDatabase } = require('./db/database');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
    origin: '*', // Для MVP разрешаем все. В продакшене укажите домены
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-Telegram-ID', 'X-Telegram-Data']
}));

// Увеличиваем лимит для загрузки фото в base64
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Логирование запросов
app.use((req, res, next) => {
    console.log(`📥 ${req.method} ${req.path}`, {
        telegramId: req.headers['x-telegram-id'] || 'нет',
        query: Object.keys(req.query).length > 0 ? req.query : undefined,
        body: req.method === 'POST' || req.method === 'PATCH' ? 
            (req.body.botToken ? { ...req.body, botToken: '***' } : req.body) : 
            undefined
    });
    next();
});

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        database: 'connected'
    });
});

// Роуты
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/items', require('./routes/items'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/analytics', require('./routes/analytics'));

// 404
app.use((req, res) => {
    console.log('⚠️ 404:', req.method, req.path);
    res.status(404).json({ error: 'Endpoint not found' });
});

// Обработка ошибок
app.use((err, req, res, next) => {
    console.error('❌ Server error:', err);
    res.status(500).json({ 
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// Инициализация базы данных и запуск сервера
initDatabase().then(() => {
    app.listen(PORT, () => {
        console.log(`🚀 Сервер запущен на порту ${PORT}`);
        console.log(`📡 Health check: http://localhost:${PORT}/health`);
        console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    });
}).catch(err => {
    console.error('❌ Ошибка инициализации базы данных:', err);
    process.exit(1);
});
