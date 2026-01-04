// js/api.js
(function() {
    'use strict';
    
    console.log('📋 Загрузка api.js...');
    
    const API = {
        baseUrl: null,
        telegramId: null,
        telegramUser: null,
        
        async init(user) {
            this.baseUrl = window.CONFIG?.API_URL || 'https://pomoechka-mvp.onrender.com';
            this.telegramUser = user || window.currentUser;
            this.telegramId = this.telegramUser?.id?.toString();
            
            console.log('🔌 API.init:', { baseUrl: this.baseUrl, telegramId: this.telegramId });
            
            // Проверяем бэкенд
            try {
                const resp = await fetch(this.baseUrl + '/health', { method: 'GET' });
                const data = await resp.json();
                console.log('✅ Backend health:', data);
                return true;
            } catch (e) {
                console.warn('⚠️ Backend недоступен:', e.message);
                return false;
            }
        },
        
        getHeaders() {
            const headers = { 'Content-Type': 'application/json' };
            if (this.telegramId) {
                headers['X-Telegram-ID'] = this.telegramId;
            }
            if (this.telegramUser) {
                headers['X-Telegram-Data'] = JSON.stringify(this.telegramUser);
            }
            return headers;
        },
        
        async request(endpoint, options = {}) {
            const url = this.baseUrl + endpoint;
            
            const config = {
                method: options.method || 'GET',
                headers: this.getHeaders(),
                ...options
            };
            
            // Не перезаписываем headers если они уже есть в options
            if (options.headers) {
                config.headers = { ...config.headers, ...options.headers };
            }
            
            console.log('📤 Request:', config.method, endpoint);
            
            const response = await fetch(url, config);
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || `HTTP ${response.status}`);
            }
            
            return data;
        },
        
        async getCurrentUser() {
            return await this.request('/api/auth/me');
        },
        
        async getItems(filters = {}) {
            const params = new URLSearchParams(filters).toString();
            return await this.request('/api/items' + (params ? '?' + params : ''));
        },
        
        async createItem(data) {
            return await this.request('/api/items', {
                method: 'POST',
                body: JSON.stringify(data)
            });
        }
    };
    
    window.API = API;
    console.log('✅ api.js загружен');
})();
