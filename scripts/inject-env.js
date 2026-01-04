// Скрипт для инжекции переменных окружения в конфиг
// Запускается при сборке на Netlify

const fs = require('fs');
const path = require('path');

// Читаем переменные окружения
const API_URL = process.env.API_URL || null;

if (!API_URL) {
    console.warn('⚠️  API_URL не установлен в переменных окружения Netlify');
    console.warn('   Используется значение по умолчанию (null - будет fallback на localStorage)');
}

// Читаем config.js
const configPath = path.join(__dirname, '../js/config.js');
let configContent = fs.readFileSync(configPath, 'utf8');

// Заменяем плейсхолдер на значение из переменной окружения
if (API_URL) {
    configContent = configContent.replace(
        /API_URL:\s*['"`]{{API_URL}}['"`]/,
        `API_URL: '${API_URL}'`
    );
    console.log(`✅ Injected API_URL: ${API_URL}`);
} else {
    // Если переменная не установлена, оставляем null для fallback
    configContent = configContent.replace(
        /API_URL:\s*['"`]{{API_URL}}['"`]/,
        `API_URL: null`
    );
    console.log('⚠️  API_URL не установлен, используется fallback на localStorage');
}

// Записываем обратно
fs.writeFileSync(configPath, configContent, 'utf8');

