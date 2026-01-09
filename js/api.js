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

    // === Items API ===
    async getItems(filters = {}) {
        if (hasBackend()) {
            const params = new URLSearchParams(filters);
            const response = await fetch(`${CONFIG.API_URL}/items?${params}`);
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
            const response = await fetch(`${CONFIG.API_URL}/items/${id}`);
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
            const response = await fetch(`${CONFIG.API_URL}/items`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newItem)
            });
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
            const response = await fetch(`${CONFIG.API_URL}/items/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updates)
            });
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
            await fetch(`${CONFIG.API_URL}/items/${id}`, { method: 'DELETE' });
            return true;
        }

        let items = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.items) || '[]');
        items = items.filter(i => i.id !== id);
        localStorage.setItem(CONFIG.STORAGE_KEYS.items, JSON.stringify(items));
        return true;
    },

    async markAsTaken(id) {
        const item = await this.getItem(id);
        if (!item) return null;

        const updated = await this.updateItem(id, {
            status: 'taken',
            takenAt: Date.now()
        });

        // Award karma to author
        if (item.author?.id) {
            // В реальном приложении это делается на сервере
            await this.addKarma(CONFIG.KARMA_FOR_TAKEN);
        }

        return updated;
    },

    async extendItem(id) {
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
        // Сначала пробуем Telegram
        const tgUser = ENV.getUser();
        if (tgUser) {
            // Получаем сохранённые данные пользователя
            let savedUser = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.user) || 'null');
            
            if (!savedUser || savedUser.telegramId !== tgUser.id) {
                // Новый пользователь или первый вход
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
                    this.cloudSet(CONFIG.CLOUD_KEYS.userData, JSON.stringify(savedUser));
                }
            }
            
            return savedUser;
        }

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
        const report = {
            id: Date.now(),
            itemId,
            reason,
            reporterId: ENV.getUserId(),
            createdAt: Date.now(),
            status: 'pending'
        };

        if (hasBackend()) {
            const response = await fetch(`${CONFIG.API_URL}/reports`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(report)
            });
            return response.json();
        }

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
            const params = new URLSearchParams(filters);
            const response = await fetch(`${CONFIG.API_URL}/reports?${params}`);
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
            const userId = ENV.getUserId();
            const headers = { 'Accept': 'application/json' };
            if (userId) headers['X-Telegram-ID'] = String(userId);
            const response = await fetch(`${CONFIG.API_URL}/api/analytics`, { headers });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
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
                const userId = ENV.getUserId();
                const response = await fetch(`${CONFIG.API_URL}/api/auth/check-admin`, {
                    headers: { 'X-Telegram-ID': userId ? String(userId) : '' }
                });
                const data = await response.json();
                return data.isAdmin === true;
            } catch (e) {
                console.error('isAdmin error:', e);
                return ENV.isAdmin();
            }
        }
        return ENV.isAdmin();
    },

    async isCreator() {
        if (hasBackend()) {
            try {
                const userId = ENV.getUserId();
                const response = await fetch(`${CONFIG.API_URL}/api/auth/check-admin`, {
                    headers: { 'X-Telegram-ID': userId ? String(userId) : '' }
                });
                const data = await response.json();
                return data.isCreator === true;
            } catch (e) {
                console.error('isCreator error:', e);
                return ENV.isCreator();
            }
        }
        return ENV.isCreator();
    },

    async getAdminSettings() {
        if (hasBackend()) {
            try {
                const userId = ENV.getUserId();
                const response = await fetch(`${CONFIG.API_URL}/api/admin/settings`, {
                    headers: { 'X-Telegram-ID': userId ? String(userId) : '' }
                });
                if (!response.ok) throw new Error('Not admin');
                return await response.json();
            } catch (e) {
                console.error('getAdminSettings error:', e);
                throw e;
            }
        }
        
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
    
    async setupCreator(data) {
        if (hasBackend()) {
            const userId = ENV.getUserId();
            const response = await fetch(`${CONFIG.API_URL}/api/auth/setup-creator`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Telegram-ID': userId ? String(userId) : ''
                },
                body: JSON.stringify(data)
            });
            return await response.json();
        }
        throw new Error('Backend required');
    }
};

// Export for use
window.API = API;