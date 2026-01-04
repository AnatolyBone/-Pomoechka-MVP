// js/config.js
(function() {
    'use strict';
    
    console.log('📋 Загрузка config.js...');
    
    try {
        const CONFIG = {
            // === App Info ===
            APP_NAME: 'Помоечка кормит',
            APP_VERSION: '1.0.0',
            
            // === Creator/Admin ===
            CREATOR_ID: null,
            ADMIN_IDS: [],
            
            // === API ===
            API_URL: (function() {
                try {
                    if (window.location.hostname === 'localhost' || 
                        window.location.hostname === '127.0.0.1') {
                        return 'http://localhost:3000';
                    }
                    return 'https://pomoechka-mvp.onrender.com';
                } catch (e) {
                    return 'https://pomoechka-mvp.onrender.com';
                }
            })(),
            
            // === Settings ===
            DEFAULT_ITEM_LIFETIME: 6 * 60 * 60 * 1000,
            MAX_ITEM_LIFETIME: 24 * 60 * 60 * 1000,
            DEFAULT_RADIUS: 2,
            MAX_RADIUS: 50,
            
            // === Karma ===
            KARMA_FOR_PUBLISH: 10,
            KARMA_FOR_TAKEN: 25,
            KARMA_FOR_EXTEND: 2,
            KARMA_FOR_THANKS: 5,
            
            // === Karma (для совместимости) ===
            KARMA: {
                PUBLISH: 10,
                TAKEN: 25,
                EXTEND: 2,
                THANKS: 5
            },
            
            // === Moderation ===
            AUTO_HIDE_REPORTS: 3,
            REQUIRE_PHOTO: false,
            PRE_MODERATION: false,
            
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
            isTelegram: function() {
                try {
                    return !!(window.Telegram && window.Telegram.WebApp);
                } catch (e) {
                    return false;
                }
            },
            isAdmin: function() {
                try {
                    const tg = window.Telegram?.WebApp;
                    if (!tg?.initDataUnsafe?.user?.id) return false;
                    const userId = tg.initDataUnsafe.user.id;
                    return userId === CONFIG.CREATOR_ID || CONFIG.ADMIN_IDS.includes(userId);
                } catch (e) {
                    return false;
                }
            },
            isCreator: function() {
                try {
                    const tg = window.Telegram?.WebApp;
                    if (!tg?.initDataUnsafe?.user?.id) return false;
                    return tg.initDataUnsafe.user.id === CONFIG.CREATOR_ID;
                } catch (e) {
                    return false;
                }
            },
            getUserId: function() {
                try {
                    return window.Telegram?.WebApp?.initDataUnsafe?.user?.id || null;
                } catch (e) {
                    return null;
                }
            },
            getUser: function() {
                try {
                    return window.Telegram?.WebApp?.initDataUnsafe?.user || null;
                } catch (e) {
                    return null;
                }
            }
        };

        // === Check if we have a backend ===
        const hasBackend = function() {
            return !!CONFIG.API_URL;
        };

        // Экспортируем глобально
        window.CONFIG = CONFIG;
        window.ENV = ENV;
        window.hasBackend = hasBackend;
        
        // Маркер готовности
        window.CONFIG_READY = true;

        console.log('✅ config.js загружен:', {
            API_URL: CONFIG.API_URL,
            APP_NAME: CONFIG.APP_NAME,
            VERSION: CONFIG.APP_VERSION
        });
        
    } catch (error) {
        console.error('❌ Критическая ошибка в config.js:', error);
        
        // Аварийный fallback
        window.CONFIG = {
            APP_NAME: 'Помоечка кормит',
            APP_VERSION: '1.0.0',
            CREATOR_ID: null,
            ADMIN_IDS: [],
            API_URL: 'https://pomoechka-mvp.onrender.com',
            DEFAULT_ITEM_LIFETIME: 6 * 60 * 60 * 1000,
            MAX_ITEM_LIFETIME: 24 * 60 * 60 * 1000,
            DEFAULT_RADIUS: 2,
            MAX_RADIUS: 50,
            KARMA_FOR_PUBLISH: 10,
            KARMA_FOR_TAKEN: 25,
            KARMA_FOR_EXTEND: 2,
            KARMA_FOR_THANKS: 5,
            KARMA: { PUBLISH: 10, TAKEN: 25, EXTEND: 2, THANKS: 5 },
            AUTO_HIDE_REPORTS: 3,
            REQUIRE_PHOTO: false,
            PRE_MODERATION: false,
            STORAGE_KEYS: {
                items: 'pomoechka_items',
                user: 'pomoechka_user',
                settings: 'pomoechka_settings',
                reports: 'pomoechka_reports',
                analytics: 'pomoechka_analytics',
                adminAuth: 'pomoechka_admin_auth'
            },
            CLOUD_KEYS: {
                userData: 'user_data',
                userItems: 'user_items',
                userSettings: 'user_settings'
            }
        };
        
        window.ENV = {
            isTelegram: function() { return false; },
            isAdmin: function() { return false; },
            isCreator: function() { return false; },
            getUserId: function() { return null; },
            getUser: function() { return null; }
        };
        
        window.hasBackend = function() { return true; };
        
        // Маркер готовности даже для fallback
        window.CONFIG_READY = true;
        
        console.log('⚠️ Использован fallback CONFIG');
    }
})();
