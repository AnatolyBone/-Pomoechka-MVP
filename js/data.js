/* ===================================
   Помоечка кормит - Data & Storage
   =================================== */

// === Categories ===
const CATEGORIES = [
    { id: 'furniture', icon: '🛋️', name: 'Мебель', color: 'amber' },
    { id: 'construction', icon: '🧱', name: 'Стройматериалы', color: 'orange' },
    { id: 'electronics', icon: '📺', name: 'Техника', color: 'blue' },
    { id: 'clothing', icon: '👕', name: 'Одежда', color: 'pink' },
    { id: 'books', icon: '📚', name: 'Книги', color: 'indigo' },
    { id: 'plants', icon: '🪴', name: 'Растения', color: 'green' },
    { id: 'other', icon: '📦', name: 'Прочее', color: 'gray' }
];

// === Report Reasons ===
const REPORT_REASONS = [
    { id: 'fake', icon: '🚫', text: 'Фейк / вещи нет на месте' },
    { id: 'dangerous', icon: '⚠️', text: 'Опасные отходы' },
    { id: 'spam', icon: '📢', text: 'Спам / реклама' },
    { id: 'inappropriate', icon: '🔞', text: 'Неприемлемый контент' },
    { id: 'wrong_location', icon: '📍', text: 'Неверная геолокация' }
];

// === Achievements (with fixed conditions) ===
const ACHIEVEMENTS = [
    { id: 'newbie', icon: '🌱', name: 'Новичок', desc: 'Первая публикация', condition: (u) => (u.stats?.published || 0) >= 1 },
    { id: 'activist', icon: '📦', name: 'Активист', desc: '10 публикаций', condition: (u) => (u.stats?.published || 0) >= 10 },
    { id: 'lightning', icon: '⚡', name: 'Молния', desc: 'Забрали за 30 мин', condition: (u) => (u.stats?.fastPickups || 0) >= 1 },
    { id: 'hero', icon: '🏆', name: 'Герой района', desc: 'Топ-10 по карме', condition: (u) => (u.rankPosition || 999) <= 10 },
    { id: 'ecowarrior', icon: '♻️', name: 'Эко-воин', desc: 'Спасено 100+ кг', condition: (u) => (u.stats?.savedKg || 0) >= 100 },
    { id: 'helper', icon: '🤝', name: 'Помощник', desc: '5 благодарностей', condition: (u) => (u.stats?.thanks || 0) >= 5 },
    { id: 'reliable', icon: '⭐', name: 'Надёжный', desc: '90% актуальных', condition: (u) => (u.stats?.reliability || 0) >= 90 }
];

// === Default Settings ===
const DEFAULT_SETTINGS = {
    city: 'Москва',
    district: 'Хамовники',
    radius: 2, // km
    notifications: {
        newItems: true,
        categories: ['furniture', 'electronics'],
        districts: ['Хамовники', 'Арбат']
    },
    chatMode: 'optional' // 'disabled', 'optional', 'required'
};

// === Mock Items (удалены - используем только реальные данные из API) ===
const MOCK_ITEMS = [];

// === Mock User (удален - используем только реальные данные из API) ===
const MOCK_USER = null;

// === Storage Keys ===
const STORAGE_KEYS = {
    items: 'pomoechka_items',
    user: 'pomoechka_user',
    settings: 'pomoechka_settings',
    draft: 'pomoechka_draft',
    reports: 'pomoechka_reports',
    analytics: 'pomoechka_analytics'
};

// === Storage Functions ===
const Storage = {
    get(key) {
        try {
            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : null;
        } catch (e) {
            console.error('Storage get error:', e);
            return null;
        }
    },

    set(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (e) {
            console.error('Storage set error:', e);
            return false;
        }
    },

    remove(key) {
        try {
            localStorage.removeItem(key);
            return true;
        } catch (e) {
            console.error('Storage remove error:', e);
            return false;
        }
    },

    // Initialize with empty data (no mock data)
    init() {
        // Инициализируем только пустые структуры, без демо-данных
        if (!this.get(STORAGE_KEYS.items)) {
            this.set(STORAGE_KEYS.items, []);
        }
        if (!this.get(STORAGE_KEYS.user)) {
            this.set(STORAGE_KEYS.user, null);
        }
        if (!this.get(STORAGE_KEYS.settings)) {
            this.set(STORAGE_KEYS.settings, DEFAULT_SETTINGS);
        }
        if (!this.get(STORAGE_KEYS.reports)) {
            this.set(STORAGE_KEYS.reports, []);
        }
        if (!this.get(STORAGE_KEYS.analytics)) {
            this.set(STORAGE_KEYS.analytics, {
                totalItems: 5,
                totalTaken: 1,
                totalUsers: 6,
                totalKarma: 597,
                savedKg: 156,
                dailyStats: []
            });
        }
    },

    // Clear all data
    clear() {
        Object.values(STORAGE_KEYS).forEach(key => this.remove(key));
    }
};

// === Data Functions ===
const Data = {
    // Items - with auto-expiration
    getItems() {
        let items = Storage.get(STORAGE_KEYS.items) || [];
        const now = Date.now();
        let changed = false;

        // Auto-expire items
        items = items.map(item => {
            if (item.status === 'active' && item.expiresAt < now) {
                changed = true;
                return { ...item, status: 'expired' };
            }
            return item;
        });

        if (changed) {
            Storage.set(STORAGE_KEYS.items, items);
        }

        return items;
    },

    getItem(id) {
        const items = this.getItems();
        return items.find(item => item.id === id);
    },

    addItem(item) {
        const items = this.getItems();
        const now = Date.now();
        const newItem = {
            id: now,
            status: 'active',
            createdAt: now,
            expiresAt: now + 6 * 60 * 60 * 1000, // 6 hours
            views: 0,
            ...item
        };
        items.unshift(newItem);
        Storage.set(STORAGE_KEYS.items, items);
        
        // Update analytics
        this.updateAnalytics('totalItems', 1);
        
        return newItem;
    },

    updateItem(id, updates) {
        const items = this.getItems();
        const index = items.findIndex(item => item.id === id);
        if (index !== -1) {
            items[index] = { ...items[index], ...updates };
            Storage.set(STORAGE_KEYS.items, items);
            return items[index];
        }
        return null;
    },

    // Extended item - adds time instead of resetting
    extendItem(id) {
        const item = this.getItem(id);
        if (!item) return null;

        const base = Math.max(item.expiresAt, Date.now());
        return this.updateItem(id, {
            expiresAt: base + 6 * 60 * 60 * 1000,
            status: 'active' // Reactivate if expired
        });
    },

    markAsTaken(id) {
        const item = this.getItem(id);
        if (!item) return null;
        
        const updated = this.updateItem(id, { 
            status: 'taken',
            takenAt: Date.now()
        });
        
        // Update analytics
        this.updateAnalytics('totalTaken', 1);
        
        // Check for fast pickup achievement
        if (item.createdAt && (Date.now() - item.createdAt < 30 * 60 * 1000)) {
            this.updateUserStats('fastPickups', 1);
        }
        
        return updated;
    },

    deleteItem(id) {
        let items = this.getItems();
        items = items.filter(item => item.id !== id);
        Storage.set(STORAGE_KEYS.items, items);
    },

    // Filter items - defaults to active only (hides taken/expired)
    filterItems({ category, status = 'active', maxDistance, search } = {}) {
        let items = this.getItems();
        
        // Filter by status (default: only active)
        // Pass status: null to get all items
        if (status) {
            items = items.filter(item => item.status === status);
        }
        
        if (category && category !== 'all') {
            items = items.filter(item => item.category === category);
        }
        
        if (maxDistance) {
            items = items.filter(item => (item.location?.distance || 0) <= maxDistance * 1000);
        }
        
        if (search) {
            const query = search.toLowerCase();
            items = items.filter(item => 
                item.title?.toLowerCase().includes(query) ||
                item.description?.toLowerCase().includes(query) ||
                item.location?.address?.toLowerCase().includes(query)
            );
        }
        
        return items;
    },

    // User
    getUser() {
        return Storage.get(STORAGE_KEYS.user) || null;
    },

    updateUser(updates) {
        const user = this.getUser();
        const updated = { ...user, ...updates };
        Storage.set(STORAGE_KEYS.user, updated);
        return updated;
    },

    addKarma(amount) {
        const user = this.getUser();
        user.karma = (user.karma || 0) + amount;
        Storage.set(STORAGE_KEYS.user, user);

        // Update karma in user's items
        const items = this.getItems().map(item =>
            item.author?.id === user.id
                ? { ...item, author: { ...item.author, karma: user.karma } }
                : item
        );
        Storage.set(STORAGE_KEYS.items, items);

        // Update analytics
        this.updateAnalytics('totalKarma', amount);

        // Check for achievements
        this.checkAchievements(user);

        return user.karma;
    },

    updateUserStats(statName, increment = 1) {
        const user = this.getUser();
        if (!user.stats) user.stats = {};
        user.stats[statName] = (user.stats[statName] || 0) + increment;
        Storage.set(STORAGE_KEYS.user, user);
        
        // Check achievements after stat update
        this.checkAchievements(user);
        
        return user.stats;
    },

    checkAchievements(user) {
        if (!user.achievements) user.achievements = [];
        
        let updated = false;
        ACHIEVEMENTS.forEach(ach => {
            if (!user.achievements.includes(ach.id) && ach.condition(user)) {
                user.achievements.push(ach.id);
                updated = true;
            }
        });
        
        if (updated) {
            Storage.set(STORAGE_KEYS.user, user);
        }
    },

    // Reports
    addReport(itemId, reason) {
        const reports = Storage.get(STORAGE_KEYS.reports) || [];
        reports.push({
            id: Date.now(),
            itemId,
            reason,
            createdAt: Date.now(),
            status: 'pending'
        });
        Storage.set(STORAGE_KEYS.reports, reports);
    },

    getReports() {
        return Storage.get(STORAGE_KEYS.reports) || [];
    },

    updateReportStatus(reportId, status) {
        const reports = this.getReports();
        const index = reports.findIndex(r => r.id === reportId);
        if (index !== -1) {
            reports[index].status = status;
            Storage.set(STORAGE_KEYS.reports, reports);
        }
    },

    // Analytics
    getAnalytics() {
        return Storage.get(STORAGE_KEYS.analytics) || {
            totalItems: 0,
            totalTaken: 0,
            totalUsers: 0,
            totalKarma: 0,
            savedKg: 0
        };
    },

    updateAnalytics(key, increment = 1) {
        const analytics = this.getAnalytics();
        analytics[key] = (analytics[key] || 0) + increment;
        Storage.set(STORAGE_KEYS.analytics, analytics);
    },

    // Settings
    getSettings() {
        return Storage.get(STORAGE_KEYS.settings) || DEFAULT_SETTINGS;
    },

    updateSettings(updates) {
        const settings = this.getSettings();
        const updated = { ...settings, ...updates };
        Storage.set(STORAGE_KEYS.settings, updated);
        return updated;
    },

    // Draft
    saveDraft(draft) {
        Storage.set(STORAGE_KEYS.draft, draft);
    },

    getDraft() {
        return Storage.get(STORAGE_KEYS.draft);
    },

    clearDraft() {
        Storage.remove(STORAGE_KEYS.draft);
    },

    // Export all data (for admin)
    exportAllData() {
        return {
            items: this.getItems(),
            users: [this.getUser()], // In real app, would be all users
            reports: this.getReports(),
            analytics: this.getAnalytics(),
            settings: this.getSettings(),
            exportedAt: new Date().toISOString()
        };
    }
};

// === Utility Functions ===
const Utils = {
    // Format time ago
    timeAgo(timestamp) {
        if (!timestamp) return 'неизвестно';
        const seconds = Math.floor((Date.now() - timestamp) / 1000);
        
        if (seconds < 60) return 'только что';
        if (seconds < 3600) return `${Math.floor(seconds / 60)} мин назад`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)} ч назад`;
        return `${Math.floor(seconds / 86400)} дн назад`;
    },

    // Format time remaining
    timeRemaining(expiresAt) {
        if (!expiresAt) return 'неизвестно';
        const seconds = Math.floor((expiresAt - Date.now()) / 1000);
        
        if (seconds <= 0) return 'истекло';
        if (seconds < 3600) return `${Math.floor(seconds / 60)} мин`;
        return `${Math.floor(seconds / 3600)}ч ${Math.floor((seconds % 3600) / 60)}мин`;
    },

    // Format distance
    formatDistance(meters) {
        if (!meters && meters !== 0) return '?';
        if (meters < 1000) return `${meters}м`;
        return `${(meters / 1000).toFixed(1)}км`;
    },

    // Get category by id
    getCategory(id) {
        return CATEGORIES.find(cat => cat.id === id) || CATEGORIES[CATEGORIES.length - 1];
    },

    // Get achievement by id
    getAchievement(id) {
        return ACHIEVEMENTS.find(a => a.id === id);
    },

    // Check if item is expired
    isExpired(item) {
        return item?.expiresAt < Date.now();
    },

    // Get expiry percentage (for progress bar)
    getExpiryPercent(item) {
        if (!item?.expiresAt || !item?.createdAt) return 0;
        
        const total = item.expiresAt - item.createdAt;
        if (!total || total <= 0) return 0;
        
        const remaining = item.expiresAt - Date.now();
        return Math.max(0, Math.min(100, (remaining / total) * 100));
    },

    // Format date
    formatDate(timestamp) {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        return date.toLocaleDateString('ru-RU', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        });
    },

    // Calculate distance between two points
    calculateDistance(lat1, lng1, lat2, lng2) {
        const R = 6371e3; // Earth radius in meters
        const φ1 = lat1 * Math.PI / 180;
        const φ2 = lat2 * Math.PI / 180;
        const Δφ = (lat2 - lat1) * Math.PI / 180;
        const Δλ = (lng2 - lng1) * Math.PI / 180;

        const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                  Math.cos(φ1) * Math.cos(φ2) *
                  Math.sin(Δλ/2) * Math.sin(Δλ/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

        return Math.round(R * c);
    }
};

// Don't auto-init here, let app.js do it
