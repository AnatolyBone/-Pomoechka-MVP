// js/api.js
(function() {
    'use strict';
    
    console.log('📋 Загрузка api.js...');
    
    const API = {
        baseUrl: null,
        telegramId: null,
        telegramUser: null,
        
        // Инициализация
        async init() {
            console.log('🔄 Initializing API...');
            
            // Получаем URL бэкенда
            this.baseUrl = window.CONFIG?.API_URL || 'https://pomoechka-mvp.onrender.com';
            console.log('📡 Backend mode:', this.baseUrl);
            
            // Получаем данные пользователя Telegram
            this.telegramUser = window.currentUser || window.Telegram?.WebApp?.initDataUnsafe?.user;
            this.telegramId = this.telegramUser?.id?.toString();
            
            console.log('👤 API user:', this.telegramId);
            
            // Проверяем доступность бэкенда
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 5000);
                
                const response = await fetch(`${this.baseUrl}/health`, {
                    method: 'GET',
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                
                if (response.ok) {
                    const data = await response.json();
                    console.log('✅ Backend доступен:', data);
                    return true;
                } else {
                    throw new Error('Backend unavailable');
                }
            } catch (error) {
                if (error.name === 'AbortError') {
                    console.warn('⚠️ Backend timeout (5s)');
                } else {
                    console.warn('⚠️ Backend недоступен:', error.message);
                }
                return false;
            }
        },
        
        // Заголовки для запросов
        getHeaders() {
            const headers = {
                'Content-Type': 'application/json'
            };
            
            if (this.telegramId) {
                headers['X-Telegram-ID'] = this.telegramId;
            }
            
            if (this.telegramUser) {
                headers['X-Telegram-Data'] = JSON.stringify(this.telegramUser);
            }
            
            return headers;
        },
        
        // Базовый запрос
        async request(endpoint, options = {}) {
            if (!this.baseUrl) {
                this.baseUrl = window.CONFIG?.API_URL || 'https://pomoechka-mvp.onrender.com';
            }
            
            const url = `${this.baseUrl}${endpoint}`;
            
            const config = {
                ...options,
                headers: {
                    ...this.getHeaders(),
                    ...options.headers
                }
            };
            
            // Если есть body, преобразуем в JSON
            if (options.body && typeof options.body === 'object') {
                config.body = JSON.stringify(options.body);
            }
            
            console.log('📤 API Request:', options.method || 'GET', endpoint);
            
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 секунд таймаут
                
                const response = await fetch(url, {
                    ...config,
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                
                let data;
                const contentType = response.headers.get('content-type');
                if (contentType && contentType.includes('application/json')) {
                    data = await response.json();
                } else {
                    data = await response.text();
                }
                
                if (!response.ok) {
                    console.error('❌ API Error:', response.status, data);
                    throw new Error(data.error || data.message || `HTTP ${response.status}`);
                }
                
                console.log('✅ API Response:', endpoint, response.status);
                return data;
            } catch (error) {
                if (error.name === 'AbortError') {
                    console.error('❌ Request timeout:', endpoint);
                    throw new Error('Request timeout');
                }
                console.error('❌ Request failed:', endpoint, error);
                throw error;
            }
        },
        
        // === Методы авторизации ===
        
        async getCurrentUser() {
            try {
                return await this.request('/api/auth/me');
            } catch (error) {
                console.warn('⚠️ getCurrentUser failed:', error.message);
                // Fallback на локальные данные
                if (this.telegramUser) {
                    return {
                        id: this.telegramUser.id,
                        telegramId: this.telegramUser.id,
                        name: this.telegramUser.first_name || 'Пользователь',
                        username: this.telegramUser.username || '',
                        initial: (this.telegramUser.first_name || 'П').charAt(0).toUpperCase(),
                        karma: 0,
                        stats: {
                            published: 0,
                            taken: 0,
                            savedKg: 0
                        }
                    };
                }
                return null;
            }
        },
        
        async isAdmin() {
            try {
                const result = await this.request('/api/auth/check-admin');
                return result.isAdmin || result.isCreator;
            } catch (error) {
                console.warn('⚠️ isAdmin check failed:', error.message);
                return false;
            }
        },
        
        async isCreator() {
            try {
                const result = await this.request('/api/auth/check-admin');
                return result.isCreator;
            } catch (error) {
                console.warn('⚠️ isCreator check failed:', error.message);
                return false;
            }
        },
        
        async checkCreatorExists() {
            try {
                const result = await this.request('/api/auth/check-creator');
                return result.hasCreator;
            } catch (error) {
                console.warn('⚠️ checkCreatorExists failed:', error.message);
                return true; // Считаем что есть
            }
        },
        
        async setupCreator(userData) {
            return await this.request('/api/auth/setup-creator', {
                method: 'POST',
                body: userData
            });
        },
        
        async getAdminSettings() {
            try {
                return await this.request('/api/admin/settings');
            } catch (error) {
                console.warn('⚠️ getAdminSettings failed:', error.message);
                throw error;
            }
        },
        
        // === Методы для объявлений ===
        
        async getItems(filters = {}) {
            const params = new URLSearchParams();
            if (filters.status) params.append('status', filters.status);
            if (filters.category) params.append('category', filters.category);
            if (filters.maxDistance) params.append('maxDistance', filters.maxDistance);
            if (filters.search) params.append('search', filters.search);
            if (filters.authorId) params.append('authorId', filters.authorId);
            
            return await this.request(`/api/items?${params}`);
        },
        
        async getItem(id) {
            return await this.request(`/api/items/${id}`);
        },
        
        async createItem(itemData) {
            return await this.request('/api/items', {
                method: 'POST',
                body: itemData
            });
        },
        
        async updateItem(id, updates) {
            return await this.request(`/api/items/${id}`, {
                method: 'PATCH',
                body: updates
            });
        },
        
        async deleteItem(id) {
            return await this.request(`/api/items/${id}`, {
                method: 'DELETE'
            });
        },
        
        async markAsTaken(id) {
            return await this.request(`/api/items/${id}/taken`, {
                method: 'POST'
            });
        },
        
        async extendItem(id) {
            return await this.request(`/api/items/${id}/extend`, {
                method: 'POST'
            });
        },
        
        // === Методы для пользователей ===
        
        async updateUser(updates) {
            return await this.request('/api/users/me', {
                method: 'PATCH',
                body: updates
            });
        },
        
        async addKarma(amount) {
            return await this.request('/api/users/karma', {
                method: 'POST',
                body: { amount }
            });
        },
        
        async updateUserStats(statName, increment) {
            // Это можно сделать через updateUser или отдельным эндпоинтом
            const user = await this.getCurrentUser();
            if (!user) return;
            
            const stats = user.stats || {};
            stats[statName] = (stats[statName] || 0) + increment;
            
            return await this.updateUser({ stats });
        },
        
        // === Методы для жалоб ===
        
        async reportItem(itemId, reason) {
            return await this.request('/api/reports', {
                method: 'POST',
                body: { itemId, reason }
            });
        },
        
        async getReports() {
            return await this.request('/api/reports');
        },
        
        // === Методы для аналитики ===
        
        async getAnalytics() {
            return await this.request('/api/analytics');
        }
    };
    
    // Экспортируем
    window.API = API;
    
    console.log('✅ api.js загружен');
})();
