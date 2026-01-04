/* ===================================
   Помоечка кормит - Configuration
   =================================== */

console.log('📋 Загрузка config.js...');

const CONFIG = {
    // === App Info ===
    APP_NAME: 'Помоечка кормит',
    APP_VERSION: '1.0.0',
    
    // === Creator/Admin ===
    // Telegram User ID создателя (получишь при первом запуске)
    // Только этот пользователь имеет доступ к админке
    CREATOR_ID: null, // Установи свой Telegram ID после первого запуска
    
    // Список админов (Telegram User IDs)
    // Создатель может добавлять сюда других админов через админку
    ADMIN_IDS: [],
    
    // === API ===
    // URL бэкенда инжектируется из переменной окружения Netlify при деплое
    // Для локальной разработки: 'http://localhost:3000'
    // Для продакшна: значение из переменной окружения API_URL на Netlify
    // ВАЖНО: Установите переменную API_URL на Netlify = https://pomoechka-mvp.onrender.com
    API_URL: window.location.hostname === 'localhost' 
        ? 'http://localhost:3000' 
        : 'https://pomoechka-mvp.onrender.com', // Временно хардкод для проверки. После настройки переменных окружения верните '{{API_URL}}'
    
    // === Settings ===
    DEFAULT_ITEM_LIFETIME: 6 * 60 * 60 * 1000, // 6 часов
    MAX_ITEM_LIFETIME: 24 * 60 * 60 * 1000, // 24 часа
    DEFAULT_RADIUS: 2, // км
    MAX_RADIUS: 50, // км
    
    // === Karma ===
    KARMA_FOR_PUBLISH: 10,
    KARMA_FOR_TAKEN: 25,
    KARMA_FOR_EXTEND: 2,
    KARMA_FOR_THANKS: 5,
    
    // === Moderation ===
    AUTO_HIDE_REPORTS: 3, // скрыть после N жалоб
    REQUIRE_PHOTO: false, // требовать фото (для MVP отключено)
    PRE_MODERATION: false, // премодерация объявлений
    
    // === Storage Keys ===
    STORAGE_KEYS: {
        items: 'pomoechka_items',
        user: 'pomoechka_user',
        settings: 'pomoechka_settings',
        reports: 'pomoechka_reports',
        analytics: 'pomoechka_analytics',
        adminAuth: 'pomoechka_admin_auth'
    },

    // === Telegram CloudStorage Keys ===
    CLOUD_KEYS: {
        userData: 'user_data',
        userItems: 'user_items',
        userSettings: 'user_settings'
    }
};

// === Environment Detection ===
const ENV = {
    isTelegram: () => !!window.Telegram?.WebApp?.initData,
    isAdmin: () => {
        const tg = window.Telegram?.WebApp;
        if (!tg?.initDataUnsafe?.user?.id) return false;
        const userId = tg.initDataUnsafe.user.id;
        return userId === CONFIG.CREATOR_ID || CONFIG.ADMIN_IDS.includes(userId);
    },
    isCreator: () => {
        const tg = window.Telegram?.WebApp;
        if (!tg?.initDataUnsafe?.user?.id) return false;
        return tg.initDataUnsafe.user.id === CONFIG.CREATOR_ID;
    },
    getUserId: () => {
        return window.Telegram?.WebApp?.initDataUnsafe?.user?.id || null;
    },
    getUser: () => {
        return window.Telegram?.WebApp?.initDataUnsafe?.user || null;
    }
};

// === Check if we have a backend ===
const hasBackend = () => !!CONFIG.API_URL;

// Экспортируем CONFIG глобально для доступа из HTML
window.CONFIG = CONFIG;
window.ENV = ENV;
window.hasBackend = hasBackend;

console.log('✅ config.js загружен, CONFIG экспортирован:', {
    API_URL: CONFIG.API_URL,
    APP_NAME: CONFIG.APP_NAME
});
