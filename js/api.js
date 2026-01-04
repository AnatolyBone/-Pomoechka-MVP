/* ===================================
   Помоечка кормит - API Layer
   =================================== */

// Этот файл абстрагирует работу с данными.
// Сейчас использует localStorage + Telegram CloudStorage
// При наличии бэкенда переключится на API вызовы

const API = {
    
    // === Initialization ===
    async init() {
        console.log('🔄 Initializing API...');
        
        if (hasBackend()) {
            console.log('📡 Backend mode: ' + CONFIG.API_URL);
            return this.initBackend();
        } else if (ENV.isTelegram()) {
            console.log('☁️ Telegram CloudStorage mode');
            return this.initCloudStorage();
        } else {
            console.log('💾 LocalStorage mode (demo)');
            return this.initLocalStorage();
        }
    },

    async initBackend() {
        // Проверка доступности бэкенда
        try {
            const response = await fetch(`${CONFIG.API_URL}/health`);
            if (!response.ok) throw new Error('Backend unavailable');
            console.log('✅ Backend connected');
            return true;
        } catch (e) {
            console.error('❌ Backend error:', e);
            // Fallback to localStorage
            return this.initLocalStorage();
        }
    },

    async initCloudStorage() {
        // Telegram CloudStorage инициализация
        const tg = window.Telegram?.WebApp;
        if (!tg) return this.initLocalStorage();
        
        try {
            // Загрузим данные пользователя из облака
            const userData = await this.cloudGet(CONFIG.CLOUD_KEYS.userData);
            if (userData) {
                localStorage.setItem(CONFIG.STORAGE_KEYS.user, userData);
            }
            console.log('✅ CloudStorage synced');
            return true;
        } catch (e) {
            console.error('CloudStorage error:', e);
            return this.initLocalStorage();
        }
    },

    initLocalStorage() {
        // Инициализация демо-данных если пусто
        if (!localStorage.getItem(CONFIG.STORAGE_KEYS.items)) {
            localStorage.setItem(CONFIG.STORAGE_KEYS.items, JSON.stringify([]));
        }
        console.log('✅ LocalStorage ready');
        return true;
    },

    // === Telegram CloudStorage Helpers ===
    cloudGet(key) {
        return new Promise((resolve, reject) => {
            const tg = window.Telegram?.WebApp;
            if (!tg?.CloudStorage) {
                reject(new Error('CloudStorage not available'));
                return;
            }
            tg.CloudStorage.getItem(key, (error, value) => {
                if (error) reject(error);
                else resolve(value);
            });
        });
    },

    cloudSet(key, value) {
        return new Promise((resolve, reject) => {
            const tg = window.Telegram?.WebApp;
            if (!tg?.CloudStorage) {
                reject(new Error('CloudStorage not available'));
                return;
            }
            tg.CloudStorage.setItem(key, value, (error, success) => {
                if (error) reject(error);
                else resolve(success);
            });
        });
    },

    // === Helper: Get headers with auth ===
    getHeaders() {
        const headers = {
            'Content-Type': 'application/json'
        };
        
        // Add Telegram ID if available
        const telegramId = ENV.getUserId();
        if (telegramId) {
            headers['X-Telegram-ID'] = telegramId.toString();
        }
        
        return headers;
    },

    // === Items API ===
    async getItems(filters = {}) {
        if (hasBackend()) {
            const params = new URLSearchParams();
            if (filters.status) params.append('status', filters.status);
            if (filters.category) params.append('category', filters.category);
            if (filters.maxDistance) params.append('maxDistance', filters.maxDistance);
            if (filters.search) params.append('search', filters.search);
            if (filters.authorId) params.append('authorId', filters.authorId);
            
            const response = await fetch(`${CONFIG.API_URL}/api/items?${params}`, {
                headers: this.getHeaders()
            });
            if (!response.ok) throw new Error('Failed to fetch items');
            return response.json();
        }
        
        // LocalStorage fallback
        let items = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.items) || '[]');
        
        // Auto-expire
        const now = Date.now();
        let changed = false;
        items = items.map(item => {
            if (item.status === 'active' && item.expiresAt < now) {
                changed = true;
                return { ...item, status: 'expired' };
            }
            return item;
        });
        if (changed) {
            localStorage.setItem(CONFIG.STORAGE_KEYS.items, JSON.stringify(items));
        }
        
        // Apply filters
        if (filters.status) {
            items = items.filter(i => i.status === filters.status);
        }
        if (filters.category && filters.category !== 'all') {
            items = items.filter(i => i.category === filters.category);
        }
        if (filters.maxDistance) {
            items = items.filter(i => (i.location?.distance || 0) <= filters.maxDistance * 1000);
        }
        if (filters.search) {
            const q = filters.search.toLowerCase();
            items = items.filter(i => 
                i.title?.toLowerCase().includes(q) ||
                i.description?.toLowerCase().includes(q)
            );
        }
        if (filters.authorId) {
            items = items.filter(i => i.author?.id === filters.authorId);
        }
        
        return items;
    },

    async getItem(id) {
        if (hasBackend()) {
            const response = await fetch(`${CONFIG.API_URL}/api/items/${id}`, {
                headers: this.getHeaders()
            });
            if (!response.ok) throw new Error('Failed to fetch item');
            return response.json();
        }
        
        const items = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.items) || '[]');
        return items.find(i => i.id === id) || null;
    },

    async createItem(itemData) {
        const user = await this.getCurrentUser();
        if (!user) throw new Error('Not authenticated');

        const now = Date.now();
        const newItem = {
            id: now,
            status: 'active',
            createdAt: now,
            expiresAt: now + CONFIG.DEFAULT_ITEM_LIFETIME,
            views: 0,
            reports: 0,
            ...itemData,
            author: {
                id: user.id,
                name: user.name || user.first_name || 'Аноним',
                initial: (user.name || user.first_name || 'А').charAt(0).toUpperCase(),
                karma: user.karma || 0
            }
        };

        if (hasBackend()) {
            const response = await fetch(`${CONFIG.API_URL}/api/items`, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify({
                    title: newItem.title,
                    description: newItem.description,
                    category: newItem.category,
                    emoji: newItem.emoji,
                    photoUrl: newItem.photo,
                    location: newItem.location,
                    chatEnabled: newItem.chatEnabled !== false,
                    userData: ENV.getUser()
                })
            });
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to create item');
            }
            return response.json();
        }

        // LocalStorage
        const items = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.items) || '[]');
        items.unshift(newItem);
        localStorage.setItem(CONFIG.STORAGE_KEYS.items, JSON.stringify(items));
        
        // Update user stats
        await this.updateUserStats('published', 1);
        await this.addKarma(CONFIG.KARMA_FOR_PUBLISH);
        
        // Sync to cloud
        if (ENV.isTelegram()) {
            this.syncToCloud();
        }

        return newItem;
    },

    async updateItem(id, updates) {
        if (hasBackend()) {
            const response = await fetch(`${CONFIG.API_URL}/api/items/${id}`, {
                method: 'PATCH',
                headers: this.getHeaders(),
                body: JSON.stringify(updates)
            });
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to update item');
            }
            return response.json();
        }

        const items = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.items) || '[]');
        const index = items.findIndex(i => i.id === id);
        if (index === -1) return null;
        
        items[index] = { ...items[index], ...updates };
        localStorage.setItem(CONFIG.STORAGE_KEYS.items, JSON.stringify(items));
        
        return items[index];
    },

    async deleteItem(id) {
        if (hasBackend()) {
            const response = await fetch(`${CONFIG.API_URL}/api/items/${id}`, {
                method: 'DELETE',
                headers: this.getHeaders()
            });
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to delete item');
            }
            return true;
        }

        let items = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.items) || '[]');
        items = items.filter(i => i.id !== id);
        localStorage.setItem(CONFIG.STORAGE_KEYS.items, JSON.stringify(items));
        return true;
    },

    async markAsTaken(id) {
        if (hasBackend()) {
            const response = await fetch(`${CONFIG.API_URL}/api/items/${id}/taken`, {
                method: 'POST',
                headers: this.getHeaders()
            });
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to mark as taken');
            }
            return response.json();
        }
        
        // Fallback to localStorage
        const item = await this.getItem(id);
        if (!item) return null;

        const updated = await this.updateItem(id, {
            status: 'taken',
            takenAt: Date.now()
        });

        // Award karma to author
        if (item.author?.id) {
            await this.addKarma(CONFIG.KARMA_FOR_TAKEN);
        }

        return updated;
    },

    async extendItem(id) {
        if (hasBackend()) {
            const response = await fetch(`${CONFIG.API_URL}/api/items/${id}/extend`, {
                method: 'POST',
                headers: this.getHeaders()
            });
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to extend item');
            }
            return response.json();
        }
        
        // Fallback to localStorage
        const item = await this.getItem(id);
        if (!item) return null;

        const base = Math.max(item.expiresAt, Date.now());
        const updated = await this.updateItem(id, {
            expiresAt: base + CONFIG.DEFAULT_ITEM_LIFETIME,
            status: 'active'
        });

        await this.addKarma(CONFIG.KARMA_FOR_EXTEND);
        return updated;
    },

    // === User API ===
    async getCurrentUser() {
        // Сначала проверяем Telegram пользователя (обязательно)
        const tgUser = ENV.getUser();
        if (!tgUser) {
            console.warn('⚠️ Telegram user not found, returning null');
            return null;
        }
        
        // Если есть бэкенд, пробуем получить пользователя оттуда (с таймаутом)
        if (hasBackend()) {
            try {
                console.log('📡 Fetching user from backend...', `${CONFIG.API_URL}/api/users/me`);
                
                // Добавляем таймаут для запроса (5 секунд)
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 5000);
                
                const response = await fetch(`${CONFIG.API_URL}/api/users/me`, {
                    headers: this.getHeaders(),
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                
                if (response.ok) {
                    const user = await response.json();
                    console.log('✅ User fetched from backend:', user);
                    return user;
                } else {
                    console.warn('⚠️ Backend returned error:', response.status, 'falling back to localStorage');
                }
            } catch (e) {
                if (e.name === 'AbortError') {
                    console.warn('⚠️ Request timeout (5s), falling back to localStorage');
                } else {
                    console.warn('⚠️ Failed to get user from backend:', e.message, 'falling back to localStorage');
                }
                // Продолжаем с fallback
            }
        }
        
        // Fallback: Используем данные из Telegram и localStorage
        console.log('💾 Using localStorage fallback for user');
        
        // Получаем сохранённые данные пользователя
        let savedUser = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.user) || 'null');
        
        if (!savedUser || savedUser.telegramId !== tgUser.id) {
            // Новый пользователь или первый вход
            console.log('👤 Creating new user from Telegram data');
            savedUser = {
                id: tgUser.id,
                telegramId: tgUser.id,
                name: tgUser.first_name,
                username: tgUser.username ? `@${tgUser.username}` : '',
                initial: tgUser.first_name.charAt(0).toUpperCase(),
                karma: 0,
                stats: {
                    published: 0,
                    taken: 0,
                    savedKg: 0,
                    fastPickups: 0,
                    thanks: 0,
                    reliability: 100
                },
                achievements: [],
                createdAt: Date.now()
            };
            localStorage.setItem(CONFIG.STORAGE_KEYS.user, JSON.stringify(savedUser));
            
            // Sync to cloud
            if (ENV.isTelegram()) {
                try {
                    await this.cloudSet(CONFIG.CLOUD_KEYS.userData, JSON.stringify(savedUser));
                } catch (e) {
                    console.warn('⚠️ Failed to sync to cloud:', e);
                }
            }
        }
        
        console.log('✅ User from localStorage:', savedUser);
        return savedUser;
    },

        // Fallback для демо (не в Telegram)
        let demoUser = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.user) || 'null');
        if (!demoUser) {
            demoUser = {
                id: 'demo_' + Date.now(),
                name: 'Демо-пользователь',
                initial: 'Д',
                karma: 0,
                stats: { published: 0, taken: 0, savedKg: 0 },
                achievements: [],
                isDemo: true
            };
            localStorage.setItem(CONFIG.STORAGE_KEYS.user, JSON.stringify(demoUser));
        }
        return demoUser;
    },

    async updateUser(updates) {
        if (hasBackend()) {
            try {
                const response = await fetch(`${CONFIG.API_URL}/api/users/me`, {
                    method: 'PATCH',
                    headers: this.getHeaders(),
                    body: JSON.stringify(updates)
                });
                if (!response.ok) throw new Error('Failed to update user');
                return response.json();
            } catch (e) {
                console.error('Failed to update user on backend:', e);
                // Fallback to localStorage
            }
        }
        
        // Fallback to localStorage
        const user = await this.getCurrentUser();
        const updated = { ...user, ...updates };
        localStorage.setItem(CONFIG.STORAGE_KEYS.user, JSON.stringify(updated));
        
        if (ENV.isTelegram()) {
            this.cloudSet(CONFIG.CLOUD_KEYS.userData, JSON.stringify(updated));
        }
        
        return updated;
    },

    async addKarma(amount) {
        const user = await this.getCurrentUser();
        user.karma = (user.karma || 0) + amount;
        await this.updateUser({ karma: user.karma });

        // Обновляем карму в объявлениях пользователя
        const items = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.items) || '[]');
        const updatedItems = items.map(item =>
            item.author?.id === user.id
                ? { ...item, author: { ...item.author, karma: user.karma } }
                : item
        );
        localStorage.setItem(CONFIG.STORAGE_KEYS.items, JSON.stringify(updatedItems));

        return user.karma;
    },

    async updateUserStats(statName, increment = 1) {
        const user = await this.getCurrentUser();
        if (!user.stats) user.stats = {};
        user.stats[statName] = (user.stats[statName] || 0) + increment;
        return this.updateUser({ stats: user.stats });
    },

    // === Reports API ===
    async reportItem(itemId, reason) {
        if (hasBackend()) {
            const response = await fetch(`${CONFIG.API_URL}/api/reports`, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify({ itemId, reason })
            });
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to create report');
            }
            return response.json();
        }
        
        // Fallback to localStorage
        const report = {
            id: Date.now(),
            itemId,
            reason,
            reporterId: ENV.getUserId(),
            createdAt: Date.now(),
            status: 'pending'
        };

        // LocalStorage
        const reports = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.reports) || '[]');
        reports.push(report);
        localStorage.setItem(CONFIG.STORAGE_KEYS.reports, JSON.stringify(reports));

        // Увеличиваем счётчик жалоб на объявлении
        const item = await this.getItem(itemId);
        if (item) {
            const newReportCount = (item.reports || 0) + 1;
            await this.updateItem(itemId, { reports: newReportCount });
            
            // Автоскрытие при превышении лимита
            if (newReportCount >= CONFIG.AUTO_HIDE_REPORTS) {
                await this.updateItem(itemId, { status: 'hidden', hiddenReason: 'reports' });
            }
        }

        return report;
    },

    async getReports(filters = {}) {
        if (hasBackend()) {
            const params = new URLSearchParams();
            if (filters.status) params.append('status', filters.status);
            
            const response = await fetch(`${CONFIG.API_URL}/api/reports?${params}`, {
                headers: this.getHeaders()
            });
            if (!response.ok) throw new Error('Failed to fetch reports');
            return response.json();
        }

        let reports = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.reports) || '[]');
        if (filters.status) {
            reports = reports.filter(r => r.status === filters.status);
        }
        return reports;
    },

    // === Analytics API ===
    async getAnalytics() {
        if (hasBackend()) {
            const response = await fetch(`${CONFIG.API_URL}/api/analytics`, {
                headers: this.getHeaders()
            });
            if (!response.ok) throw new Error('Failed to fetch analytics');
            return response.json();
        }

        const items = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.items) || '[]');
        const reports = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.reports) || '[]');
        
        return {
            totalItems: items.length,
            activeItems: items.filter(i => i.status === 'active').length,
            takenItems: items.filter(i => i.status === 'taken').length,
            expiredItems: items.filter(i => i.status === 'expired').length,
            totalReports: reports.length,
            pendingReports: reports.filter(r => r.status === 'pending').length
        };
    },

    // === Cloud Sync ===
    async syncToCloud() {
        if (!ENV.isTelegram()) return;
        
        try {
            const user = await this.getCurrentUser();
            await this.cloudSet(CONFIG.CLOUD_KEYS.userData, JSON.stringify(user));
            
            // Сохраняем только объявления текущего пользователя
            const items = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.items) || '[]');
            const userItems = items.filter(i => i.author?.id === user.id);
            await this.cloudSet(CONFIG.CLOUD_KEYS.userItems, JSON.stringify(userItems));
            
            console.log('☁️ Synced to cloud');
        } catch (e) {
            console.error('Sync error:', e);
        }
    },

    // === Admin API ===
    async isAdmin() {
        if (hasBackend()) {
            try {
                const response = await fetch(`${CONFIG.API_URL}/api/auth/check-admin`, {
                    headers: this.getHeaders()
                });
                if (!response.ok) return false;
                const data = await response.json();
                return data.isAdmin;
            } catch (e) {
                console.error('Failed to check admin status:', e);
                return false;
            }
        }
        return ENV.isAdmin();
    },
    
    async isCreator() {
        if (hasBackend()) {
            try {
                const response = await fetch(`${CONFIG.API_URL}/api/auth/check-admin`, {
                    headers: this.getHeaders()
                });
                if (!response.ok) return false;
                const data = await response.json();
                return data.isCreator;
            } catch (e) {
                console.error('Failed to check creator status:', e);
                return false;
            }
        }
        return ENV.isCreator();
    },

    async getAdminSettings() {
        if (hasBackend()) {
            const response = await fetch(`${CONFIG.API_URL}/api/admin/settings`, {
                headers: this.getHeaders()
            });
            if (!response.ok) throw new Error('Failed to fetch admin settings');
            return response.json();
        }
        
        // Fallback
        if (!await this.isAdmin()) throw new Error('Unauthorized');
        
        return {
            creatorId: CONFIG.CREATOR_ID,
            adminIds: CONFIG.ADMIN_IDS,
            itemLifetime: CONFIG.DEFAULT_ITEM_LIFETIME,
            autoHideReports: CONFIG.AUTO_HIDE_REPORTS,
            requirePhoto: CONFIG.REQUIRE_PHOTO,
            preModeration: CONFIG.PRE_MODERATION,
            karma: {
                publish: CONFIG.KARMA_FOR_PUBLISH,
                taken: CONFIG.KARMA_FOR_TAKEN,
                extend: CONFIG.KARMA_FOR_EXTEND,
                thanks: CONFIG.KARMA_FOR_THANKS
            }
        };
    },
    
    async setupCreator(userData = {}) {
        if (!hasBackend()) {
            throw new Error('Backend required for creator setup');
        }
        
        const url = `${CONFIG.API_URL}/api/auth/setup-creator`;
        const headers = this.getHeaders();
        
        console.log('📡 Setup creator request:', {
            url,
            headers,
            userData: { ...userData, botToken: userData.botToken ? '***' : undefined }
        });
        
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(userData)
            });
            
            console.log('📡 Setup creator response status:', response.status);
            
            if (!response.ok) {
                let errorData;
                try {
                    errorData = await response.json();
                } catch (e) {
                    // Если не удалось распарсить JSON, используем текст
                    const text = await response.text();
                    throw new Error(`HTTP ${response.status}: ${text || 'Unknown error'}`);
                }
                throw new Error(errorData.error || `HTTP ${response.status}: Failed to setup creator`);
            }
            
            const result = await response.json();
            console.log('✅ Setup creator success:', result);
            return result;
        } catch (e) {
            console.error('❌ Setup creator fetch error:', e);
            
            // Более детальная обработка ошибок
            if (e.name === 'TypeError' && e.message.includes('fetch')) {
                throw new Error(`Не удалось подключиться к серверу. Проверьте URL: ${CONFIG.API_URL}`);
            }
            
            throw e;
        }
    }
};

// Export for use
window.API = API;
