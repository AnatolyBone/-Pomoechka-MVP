// js/api.js
(function() {
    'use strict';
    
    // === ЗАЩИТА ОТ ПОВТОРНОЙ ЗАГРУЗКИ ===
    if (window.API) {
        console.log('⚠️ api.js уже загружен, пропускаем');
        return;
    }
    
    console.log('📋 Загрузка api.js...');
    
    var API = {
        baseUrl: null,
        telegramId: null,
        telegramUser: null,
        
        init: function(user) {
            var self = this;
            self.baseUrl = window.CONFIG?.API_URL || 'https://pomoechka-mvp.onrender.com';
            self.telegramUser = user || window.currentUser;
            self.telegramId = self.telegramUser?.id ? String(self.telegramUser.id) : '';
            
            console.log('🔌 API.init:', { 
                baseUrl: self.baseUrl, 
                telegramId: self.telegramId 
            });
            
            // Проверяем бэкенд
            return fetch(self.baseUrl + '/health')
                .then(function(resp) { 
                    return resp.json(); 
                })
                .then(function(data) {
                    console.log('✅ Backend health:', data);
                    return true;
                })
                .catch(function(e) {
                    console.warn('⚠️ Backend недоступен:', e.message);
                    return false;
                });
        },
        
        getHeaders: function() {
            var headers = { 'Content-Type': 'application/json' };
            
            if (this.telegramId) {
                headers['X-Telegram-ID'] = this.telegramId;
            }
            
            if (this.telegramUser) {
                try {
                    headers['X-Telegram-Data'] = JSON.stringify(this.telegramUser);
                } catch (e) {}
            }
            
            return headers;
        },
        
        request: function(endpoint, options) {
            var self = this;
            options = options || {};
            
            var url = self.baseUrl + endpoint;
            
            var config = {
                method: options.method || 'GET',
                headers: self.getHeaders()
            };
            
            if (options.body) {
                config.body = options.body;
            }
            
            console.log('📤', config.method, endpoint);
            
            return fetch(url, config)
                .then(function(response) {
                    return response.json().then(function(data) {
                        if (!response.ok) {
                            var error = new Error(data.error || 'HTTP ' + response.status);
                            throw error;
                        }
                        return data;
                    });
                });
        },
        
        getCurrentUser: function() {
            return this.request('/api/auth/me');
        },
        
        getItems: function(filters) {
            filters = filters || {};
            var params = new URLSearchParams(filters).toString();
            var endpoint = '/api/items' + (params ? '?' + params : '');
            return this.request(endpoint);
        },
        
        createItem: function(data) {
            return this.request('/api/items', {
                method: 'POST',
                body: JSON.stringify(data)
            });
        },
        
        markItemTaken: function(id) {
            return this.request('/api/items/' + id + '/taken', {
                method: 'POST'
            });
        }
    };
    
    window.API = API;
    console.log('✅ api.js загружен');
})();