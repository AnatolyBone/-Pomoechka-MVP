// js/config.js
(function() {
    'use strict';
    
    // === ЗАЩИТА ОТ ПОВТОРНОЙ ЗАГРУЗКИ ===
    if (window.CONFIG) {
        console.log('⚠️ config.js уже загружен, пропускаем');
        return;
    }
    
    console.log('📋 Загрузка config.js...');
    
    try {
        var CONFIG = {
            APP_NAME: 'Помоечка кормит',
            APP_VERSION: '1.0.0',
            CREATOR_ID: null,
            ADMIN_IDS: [],
            
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
            
            DEFAULT_ITEM_LIFETIME: 6 * 60 * 60 * 1000,
            MAX_ITEM_LIFETIME: 24 * 60 * 60 * 1000,
            DEFAULT_RADIUS: 2,
            MAX_RADIUS: 50,
            
            KARMA: {
                PUBLISH: 10,
                TAKEN: 25,
                EXTEND: 2,
                THANKS: 5
            },
            
            KARMA_FOR_PUBLISH: 10,
            KARMA_FOR_TAKEN: 25,
            KARMA_FOR_EXTEND: 2,
            KARMA_FOR_THANKS: 5,
            
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

        var ENV = {
            isTelegram: function() {
                try {
                    return !!(window.Telegram && window.Telegram.WebApp);
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

        // Экспортируем глобально
        window.CONFIG = CONFIG;
        window.ENV = ENV;
        window.CONFIG_READY = true;

        console.log('✅ config.js загружен:', {
            API_URL: CONFIG.API_URL,
            APP_NAME: CONFIG.APP_NAME
        });
        
    } catch (error) {
        console.error('❌ Ошибка config.js:', error);
        
        // Fallback
        window.CONFIG = {
            APP_NAME: 'Помоечка кормит',
            APP_VERSION: '1.0.0',
            API_URL: 'https://pomoechka-mvp.onrender.com',
            KARMA: { PUBLISH: 10, TAKEN: 25, EXTEND: 2, THANKS: 5 },
            STORAGE_KEYS: { items: 'pomoechka_items', user: 'pomoechka_user' }
        };
        window.ENV = {
            isTelegram: function() { return false; },
            getUserId: function() { return null; },
            getUser: function() { return null; }
        };
        window.CONFIG_READY = true;
        
        console.log('⚠️ Использован fallback CONFIG');
    }
})();