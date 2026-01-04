/* ===================================
   Помоечка кормит - Main App Logic
   =================================== */

// === App State ===
const App = {
    currentScreen: 'map',
    previousScreen: 'map',
    selectedItem: null,
    selectedCategory: 'all',
    selectedRadius: 2,
    searchQuery: '',
    uploadedPhoto: null,
    telegramUser: null
};

// === Telegram WebApp Integration ===
function initTelegram() {
    if (window.Telegram?.WebApp) {
        const tg = Telegram.WebApp;
        tg.ready();
        tg.expand();
        
        // Get user data
        if (tg.initDataUnsafe?.user) {
            App.telegramUser = tg.initDataUnsafe.user;
            
            // Update user profile with Telegram data (через API если доступен)
            if (hasBackend() && window.API) {
                API.updateUser({
                    telegramId: App.telegramUser.id,
                    name: App.telegramUser.first_name,
                    username: App.telegramUser.username ? `@${App.telegramUser.username}` : '',
                    initial: App.telegramUser.first_name.charAt(0).toUpperCase()
                }).catch(console.error);
            } else {
                const user = Data.getUser();
                Data.updateUser({
                    telegramId: App.telegramUser.id,
                    name: App.telegramUser.first_name,
                    username: App.telegramUser.username ? `@${App.telegramUser.username}` : '',
                    initial: App.telegramUser.first_name.charAt(0).toUpperCase()
                });
            }
        }
        
        // Apply Telegram theme
        document.documentElement.style.setProperty('--tg-theme-bg-color', tg.themeParams.bg_color || '#ffffff');
        document.documentElement.style.setProperty('--tg-theme-text-color', tg.themeParams.text_color || '#000000');
        
        // Back button handling
        tg.BackButton.onClick(() => {
            if (App.currentScreen === 'detail') {
                showScreen(App.previousScreen || 'map');
            } else if (App.currentScreen !== 'map') {
                showScreen('map');
            }
        });
        
        return true;
    }
    return false;
}

// === HTML Escaping for Security ===
function escapeHtml(str = '') {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// === Screen Navigation ===
function showScreen(screenId) {
    // Remember previous screen (except detail and modals)
    if (App.currentScreen !== 'detail' && screenId === 'detail') {
        App.previousScreen = App.currentScreen;
    } else if (screenId !== 'detail') {
        App.previousScreen = App.currentScreen;
    }

    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const screen = document.getElementById('screen-' + screenId);
    if (screen) {
        screen.classList.add('active');
        App.currentScreen = screenId;
        
        // Update bottom nav
        updateBottomNav(screenId);
        
        // Update Telegram back button
        if (window.Telegram?.WebApp) {
            if (screenId === 'detail' || (screenId !== 'map' && screenId !== 'feed')) {
                Telegram.WebApp.BackButton.show();
            } else {
                Telegram.WebApp.BackButton.hide();
            }
        }
        
        // Screen-specific init
        switch(screenId) {
            case 'map': initMapScreen().catch(console.error); break;
            case 'feed': initFeedScreen().catch(console.error); break;
            case 'profile': initProfileScreen().catch(console.error); break;
            case 'add': initAddScreen(); break;
            case 'detail': initDetailScreen().catch(console.error); break;
        }
    }
}

function updateBottomNav(screenId) {
    document.querySelectorAll('.bottom-nav-btn').forEach(btn => {
        const btnScreen = btn.dataset.screen;
        if (btnScreen === screenId) {
            btn.classList.remove('text-gray-400');
            btn.classList.add('text-emerald-600');
            btn.querySelector('span:last-child')?.classList.add('font-semibold');
        } else {
            btn.classList.remove('text-emerald-600');
            btn.classList.add('text-gray-400');
            btn.querySelector('span:last-child')?.classList.remove('font-semibold');
        }
    });
}

// === Map Screen ===
async function initMapScreen() {
    await updateMapMarkers();
    updateRadiusButtons();
}

async function updateMapMarkers() {
    // Используем API если доступен, иначе localStorage
    let items = [];
    if (hasBackend() && window.API) {
        try {
            items = await API.getItems({
                status: 'active',
                maxDistance: App.selectedRadius,
                category: App.selectedCategory !== 'all' ? App.selectedCategory : null
            });
        } catch (e) {
            console.error('Failed to load items from backend:', e);
            items = Data.filterItems({
                status: 'active',
                maxDistance: App.selectedRadius,
                category: App.selectedCategory !== 'all' ? App.selectedCategory : null
            });
        }
    } else {
        items = Data.filterItems({
            status: 'active',
            maxDistance: App.selectedRadius,
            category: App.selectedCategory !== 'all' ? App.selectedCategory : null
        });
    }
    
    const container = document.getElementById('mapMarkers');
    if (!container) return;
    
    // For demo, we show fixed positions
    const positions = [
        { top: '25%', left: '33%' },
        { top: '40%', left: '65%' },
        { top: '60%', left: '25%' },
        { top: '70%', left: '55%' }
    ];
    
    container.innerHTML = items.slice(0, 4).map((item, i) => {
        const cat = Utils.getCategory(item.category);
        const pos = positions[i] || positions[0];
        const isFresh = Date.now() - item.createdAt < 30 * 60 * 1000;
        return `
            <div class="map-marker absolute cursor-pointer ${isFresh ? 'pulse' : ''}" 
                 style="top: ${pos.top}; left: ${pos.left}; transform: translate(-50%, -50%);"
                 onclick="showItemDetail(${item.id})">
                <div class="w-12 h-12 bg-emerald-500 rounded-full flex items-center justify-center text-2xl shadow-lg border-2 border-white">
                    ${item.emoji || cat.icon}
                </div>
            </div>
        `;
    }).join('');
    
    // Add cluster if more items
    if (items.length > 4) {
        container.innerHTML += `
            <div class="map-cluster absolute w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm cursor-pointer" 
                 style="top: 75%; left: 60%; transform: translate(-50%, -50%);">
                +${items.length - 4}
            </div>
        `;
    }
    
    // Update count
    const countEl = document.getElementById('mapItemsCount');
    if (countEl) {
        countEl.textContent = `${items.length} находок в радиусе ${App.selectedRadius} км`;
    }
    
    // Update bottom sheet preview
    if (items.length > 0) {
        const firstItem = items[0];
        const previewHtml = `
            <div class="flex items-center gap-3 mb-3" onclick="showItemDetail(${firstItem.id})">
                <div class="w-14 h-14 bg-amber-100 rounded-xl flex items-center justify-center text-2xl">${firstItem.emoji || '📦'}</div>
                <div class="flex-1">
                    <p class="font-semibold text-gray-800">${escapeHtml(firstItem.title)}</p>
                    <p class="text-xs text-gray-500">${Utils.formatDistance(firstItem.location.distance)} • 🔥 ${Utils.timeAgo(firstItem.createdAt)}</p>
                    <div class="timer-bar w-full mt-1" style="width: ${Utils.getExpiryPercent(firstItem)}%"></div>
                </div>
                <button class="px-3 py-2 bg-emerald-500 text-white rounded-xl text-sm font-semibold">→</button>
            </div>
        `;
        const sheetContent = document.querySelector('#screen-map .absolute.bottom-0 .flex.items-center.gap-3');
        if (sheetContent) {
            sheetContent.parentElement.innerHTML = `
                <div class="w-12 h-1 bg-gray-300 rounded-full mx-auto mb-3"></div>
                ${previewHtml}
                <p class="text-xs text-gray-500 text-center">${items.length} находок в радиусе ${App.selectedRadius} км</p>
            `;
        }
    }
}

async function setRadius(km) {
    App.selectedRadius = km;
    updateRadiusButtons();
    await updateMapMarkers();
}

function updateRadiusButtons() {
    document.querySelectorAll('.radius-btn').forEach(btn => {
        const r = parseFloat(btn.dataset.radius);
        if (r === App.selectedRadius) {
            btn.classList.add('active', 'bg-emerald-500', 'text-white');
            btn.classList.remove('bg-gray-100');
        } else {
            btn.classList.remove('active', 'bg-emerald-500', 'text-white');
            btn.classList.add('bg-gray-100');
        }
    });
}

// === Feed Screen ===
async function initFeedScreen() {
    await renderFeedItems();
}

async function renderFeedItems() {
    // Используем API если доступен, иначе localStorage
    let items = [];
    if (hasBackend() && window.API) {
        try {
            items = await API.getItems({
                category: App.selectedCategory !== 'all' ? App.selectedCategory : null,
                status: null, // Show all statuses in feed
                search: App.searchQuery
            });
        } catch (e) {
            console.error('Failed to load items from backend:', e);
            items = Data.filterItems({
                category: App.selectedCategory !== 'all' ? App.selectedCategory : null,
                status: null,
                search: App.searchQuery
            });
        }
    } else {
        items = Data.filterItems({
            category: App.selectedCategory !== 'all' ? App.selectedCategory : null,
            status: null,
            search: App.searchQuery
        });
    }
    
    const container = document.getElementById('feedItems');
    if (!container) return;
    
    if (items.length === 0) {
        container.innerHTML = `
            <div class="text-center py-12">
                <div class="text-6xl mb-4">🔍</div>
                <p class="text-gray-500">Ничего не найдено</p>
                <p class="text-sm text-gray-400 mt-1">Попробуйте изменить фильтры</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = items.map(item => renderItemCard(item)).join('');
}

function renderItemCard(item) {
    const cat = Utils.getCategory(item.category);
    const expiryPercent = Utils.getExpiryPercent(item);
    const isFresh = Date.now() - item.createdAt < 30 * 60 * 1000;
    
    let statusBadge = '';
    let overlay = '';
    let cardClass = '';
    
    if (item.status === 'taken') {
        overlay = `
            <div class="taken-overlay absolute inset-0 flex items-center justify-center">
                <span class="bg-white text-gray-800 font-bold px-4 py-2 rounded-full text-sm">
                    ✅ Забрали!
                </span>
            </div>
        `;
        cardClass = 'opacity-70';
    } else if (item.status === 'expired') {
        overlay = `
            <div class="expired-overlay absolute inset-0 flex items-center justify-center">
                <span class="bg-white text-gray-800 font-bold px-4 py-2 rounded-full text-sm">
                    ⏰ Просрочено
                </span>
            </div>
        `;
        cardClass = 'opacity-70';
    } else if (isFresh) {
        statusBadge = `<span class="fresh-badge absolute top-2 left-2 text-white text-xs font-bold px-2 py-1 rounded-full">🔥 ${Utils.timeAgo(item.createdAt)}</span>`;
    }
    
    return `
        <div class="card-item bg-white rounded-2xl shadow-sm overflow-hidden ${cardClass}" 
             onclick="showItemDetail(${item.id})">
            <div class="relative">
                <div class="h-40 bg-gradient-to-br from-${cat.color}-100 to-${cat.color}-200 flex items-center justify-center text-6xl">
                    ${item.emoji || cat.icon}
                </div>
                ${statusBadge}
                <span class="distance-badge absolute top-2 right-2 text-white text-xs font-bold px-2 py-1 rounded-full">
                    📍 ${Utils.formatDistance(item.location.distance)}
                </span>
                ${overlay}
                ${item.status === 'active' ? `<div class="timer-bar absolute bottom-0 left-0" style="width: ${expiryPercent}%"></div>` : ''}
            </div>
            <div class="p-3">
                <h3 class="font-bold text-gray-800">${escapeHtml(item.title)}</h3>
                <p class="text-xs text-gray-500 mt-1">${escapeHtml(item.location.address)}, ${escapeHtml(item.location.details)}</p>
                <div class="flex items-center justify-between mt-2">
                    <div class="flex items-center gap-2">
                        <div class="w-6 h-6 rounded-full bg-${item.author.color}-100 flex items-center justify-center text-xs">${escapeHtml(item.author.initial)}</div>
                        <span class="text-xs text-gray-600">${escapeHtml(item.author.name)} • ⭐ ${item.author.karma}</span>
                    </div>
                    ${item.status === 'active' ? `<span class="text-xs text-emerald-600 font-semibold">⏱ ${Utils.timeRemaining(item.expiresAt)}</span>` : ''}
                </div>
            </div>
        </div>
    `;
}

async function setCategory(categoryId) {
    App.selectedCategory = categoryId;
    
    document.querySelectorAll('.tab-btn').forEach(btn => {
        const isActive = btn.dataset.category === categoryId;
        btn.classList.toggle('active', isActive);
        btn.classList.toggle('text-emerald-600', isActive);
        btn.classList.toggle('border-emerald-500', isActive);
        btn.classList.toggle('text-gray-500', !isActive);
        btn.classList.toggle('border-transparent', !isActive);
    });
    
    await renderFeedItems();
    await updateMapMarkers();
}

async function handleSearch(query) {
    App.searchQuery = query;
    await renderFeedItems();
}

// === Item Detail ===
async function showItemDetail(itemId) {
    // Используем API если доступен
    if (hasBackend() && window.API) {
        try {
            App.selectedItem = await API.getItem(itemId);
            if (!App.selectedItem) return;
            showScreen('detail');
        } catch (e) {
            console.error('Failed to load item from backend:', e);
            App.selectedItem = Data.getItem(itemId);
            if (!App.selectedItem) return;
            showScreen('detail');
        }
    } else {
        App.selectedItem = Data.getItem(itemId);
        if (!App.selectedItem) return;
        // Increment views
        Data.updateItem(itemId, { views: (App.selectedItem.views || 0) + 1 });
        App.selectedItem = Data.getItem(itemId); // Refresh
        showScreen('detail');
    }
}

async function initDetailScreen() {
    await renderItemDetail();
}

async function renderItemDetail() {
    const item = App.selectedItem;
    if (!item) return;
    
    const cat = Utils.getCategory(item.category);
    const container = document.getElementById('detailContent');
    if (!container) return;
    
    const expiryPercent = Utils.getExpiryPercent(item);
    const canTake = item.status === 'active';
    
    // Получаем текущего пользователя
    let user;
    if (hasBackend() && window.API) {
        try {
            user = await API.getCurrentUser();
        } catch (e) {
            console.error('Failed to load user from backend:', e);
            user = Data.getUser();
        }
    } else {
        user = Data.getUser();
    }
    
    const isOwner = item.author?.id === user?.id;
    
    container.innerHTML = `
        <div class="relative">
            <div class="h-56 bg-gradient-to-br from-${cat.color}-100 to-${cat.color}-200 flex items-center justify-center text-8xl">
                ${item.emoji || cat.icon}
            </div>
            <button onclick="showScreen('${App.previousScreen || 'feed'}')" 
                    class="absolute top-4 left-4 w-10 h-10 bg-white/90 rounded-full flex items-center justify-center text-xl backdrop-blur">
                ←
            </button>
            <button onclick="toggleFavorite(${item.id})" 
                    class="absolute top-4 right-14 w-10 h-10 bg-white/90 rounded-full flex items-center justify-center text-xl backdrop-blur">
                🤍
            </button>
            <button onclick="showReportModal()" 
                    class="absolute top-4 right-4 w-10 h-10 bg-white/90 rounded-full flex items-center justify-center text-xl backdrop-blur">
                ⚠️
            </button>
            ${item.status === 'active' ? `
                <span class="status-active absolute bottom-4 left-4 text-white text-xs font-bold px-3 py-1.5 rounded-full">
                    🟢 Актуально • ${Utils.timeRemaining(item.expiresAt)}
                </span>
            ` : ''}
            ${item.status === 'taken' ? `
                <span class="status-taken absolute bottom-4 left-4 text-white text-xs font-bold px-3 py-1.5 rounded-full">
                    ✅ Забрали
                </span>
            ` : ''}
            ${item.status === 'expired' ? `
                <span class="status-expired absolute bottom-4 left-4 text-white text-xs font-bold px-3 py-1.5 rounded-full">
                    ⏰ Время истекло
                </span>
            ` : ''}
            ${item.status === 'active' ? `<div class="timer-bar absolute bottom-0 left-0" style="width: ${expiryPercent}%"></div>` : ''}
        </div>
        
        <div class="flex-1 overflow-y-auto p-4 space-y-4 pb-32">
            <div>
                <h1 class="text-xl font-bold text-gray-800">${escapeHtml(item.title)}</h1>
                <p class="text-sm text-gray-500 mt-1">${cat.icon} ${cat.name}</p>
            </div>
            
            <div class="flex items-center gap-3 p-3 bg-white rounded-xl">
                <div class="w-12 h-12 rounded-full bg-${item.author.color}-100 flex items-center justify-center text-lg">${escapeHtml(item.author.initial)}</div>
                <div class="flex-1">
                    <p class="font-semibold">${escapeHtml(item.author.name)}</p>
                    <p class="text-xs text-gray-500">⭐ ${item.author.karma} кармы</p>
                </div>
                ${item.chatEnabled && !isOwner ? `
                    <button onclick="openChat(${item.author.id})" class="px-3 py-1.5 bg-emerald-100 text-emerald-700 rounded-full text-sm font-semibold">
                        💬 Чат
                    </button>
                ` : !item.chatEnabled ? `
                    <span class="px-3 py-1.5 bg-gray-100 text-gray-500 rounded-full text-xs">
                        Без чата
                    </span>
                ` : ''}
            </div>
            
            <div class="bg-white rounded-xl p-4">
                <h3 class="font-semibold text-gray-800 mb-2">📝 Описание</h3>
                <p class="text-sm text-gray-600">${escapeHtml(item.description)}</p>
            </div>
            
            <div class="bg-white rounded-xl p-4">
                <h3 class="font-semibold text-gray-800 mb-2">📍 Где забрать</h3>
                <p class="text-sm text-gray-600">${escapeHtml(item.location.address)}, ${escapeHtml(item.location.details)}</p>
                <div class="mt-3 h-32 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-xl flex items-center justify-center text-4xl cursor-pointer" onclick="openInMaps(${item.location.lat}, ${item.location.lng})">
                    🗺️
                </div>
                <p class="text-xs text-gray-500 mt-2 text-center">📍 ${Utils.formatDistance(item.location.distance)} от тебя • Нажми для навигации</p>
            </div>
            
            <!-- Safety Banner -->
            <div class="safety-banner rounded-xl p-3">
                <p class="text-sm text-amber-800">
                    <strong>⚠️ Безопасность:</strong> Рекомендуем забирать вещи в светлое время суток. 
                    Можно взять с собой друга.
                </p>
            </div>
            
            ${canTake && !isOwner ? `
                <button onclick="takeItem(${item.id})" 
                        class="w-full bg-emerald-500 text-white font-bold py-4 rounded-2xl text-lg hover:bg-emerald-600 transition shadow-lg">
                    Заберу! 🙋‍♂️
                </button>
                <p class="text-center text-xs text-gray-500">
                    👀 ${item.views} просмотров
                </p>
            ` : ''}
            
            ${isOwner && item.status === 'active' ? `
                <div class="flex gap-3">
                    <button onclick="extendItem(${item.id})" 
                            class="flex-1 bg-blue-500 text-white font-bold py-3 rounded-2xl text-sm hover:bg-blue-600 transition">
                        ⏱ Продлить (+6ч)
                    </button>
                    <button onclick="markAsTaken(${item.id})" 
                            class="flex-1 bg-gray-500 text-white font-bold py-3 rounded-2xl text-sm hover:bg-gray-600 transition">
                        ✅ Забрали
                    </button>
                </div>
            ` : ''}
            
            ${isOwner && item.status === 'expired' ? `
                <button onclick="extendItem(${item.id})" 
                        class="w-full bg-emerald-500 text-white font-bold py-4 rounded-2xl text-lg hover:bg-emerald-600 transition shadow-lg">
                    🔄 Активировать снова
                </button>
            ` : ''}
        </div>
    `;
}

async function takeItem(itemId) {
    if (hasBackend() && window.API) {
        try {
            App.selectedItem = await API.markAsTaken(itemId);
            await renderItemDetail();
            showSuccessModal('🙌', 'Отлично!', 'Автор получил уведомление. Не забудь сказать спасибо! +5 кармы');
        } catch (e) {
            console.error('Failed to mark as taken:', e);
            showToast('⚠️ Ошибка. Попробуйте еще раз.');
        }
    } else {
        Data.markAsTaken(itemId);
        Data.addKarma(5);
        App.selectedItem = Data.getItem(itemId);
        renderItemDetail();
        showSuccessModal('🙌', 'Отлично!', 'Автор получил уведомление. Не забудь сказать спасибо! +5 кармы');
    }
}

async function markAsTaken(itemId) {
    if (hasBackend() && window.API) {
        try {
            App.selectedItem = await API.markAsTaken(itemId);
            await renderItemDetail();
            showToast('Отмечено как забранное! +25 кармы');
        } catch (e) {
            console.error('Failed to mark as taken:', e);
            showToast('⚠️ Ошибка. Попробуйте еще раз.');
        }
    } else {
        Data.markAsTaken(itemId);
        Data.addKarma(25);
        App.selectedItem = Data.getItem(itemId);
        renderItemDetail();
        showToast('Отмечено как забранное! +25 кармы');
    }
}

async function extendItem(itemId) {
    if (hasBackend() && window.API) {
        try {
            App.selectedItem = await API.extendItem(itemId);
            await renderItemDetail();
            showToast('Продлено на 6 часов! +2 кармы');
        } catch (e) {
            console.error('Failed to extend item:', e);
            showToast('⚠️ Ошибка. Попробуйте еще раз.');
        }
    } else {
        Data.extendItem(itemId);
        Data.addKarma(2);
        App.selectedItem = Data.getItem(itemId);
        renderItemDetail();
        showToast('Продлено на 6 часов! +2 кармы');
    }
}

function openChat(userId) {
    showToast('Чат скоро будет доступен!');
}

function openInMaps(lat, lng) {
    const url = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    window.open(url, '_blank');
}

function toggleFavorite(itemId) {
    showToast('Добавлено в избранное!');
}

// === Add Item Screen ===
function initAddScreen() {
    App.uploadedPhoto = null;
    
    // Reset form
    const titleInput = document.getElementById('itemTitle');
    const descInput = document.getElementById('itemDescription');
    if (titleInput) titleInput.value = '';
    if (descInput) descInput.value = '';
    
    // Reset category chips
    document.querySelectorAll('.category-chip').forEach(chip => {
        chip.classList.remove('selected', 'bg-emerald-500', 'text-white');
        chip.classList.add('bg-gray-100');
    });
    
    // Reset upload zone
    const uploadZone = document.getElementById('uploadZone');
    if (uploadZone) {
        uploadZone.classList.remove('has-image');
        uploadZone.innerHTML = `
            <div class="text-5xl mb-2">📷</div>
            <p class="font-semibold text-gray-700">Сфотографируй находку</p>
            <p class="text-xs text-gray-500 mt-1">Обязательно для публикации</p>
        `;
    }
    
    // Reset chat toggle
    const chatToggle = document.getElementById('chatToggle');
    if (chatToggle) chatToggle.classList.add('active');
    
    // Request geolocation
    requestGeolocation();
}

function selectCategory(el) {
    document.querySelectorAll('.category-chip').forEach(chip => {
        chip.classList.remove('selected', 'bg-emerald-500', 'text-white');
        chip.classList.add('bg-gray-100');
    });
    el.classList.add('selected', 'bg-emerald-500', 'text-white');
    el.classList.remove('bg-gray-100');
}

function requestGeolocation() {
    if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                App.currentLocation = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                };
                showToast('📍 Геолокация определена');
            },
            (error) => {
                console.log('Geolocation error:', error);
            }
        );
    }
}

async function publishItem() {
    const title = document.getElementById('itemTitle')?.value?.trim();
    const description = document.getElementById('itemDescription')?.value?.trim();
    const selectedCat = document.querySelector('.category-chip.selected');
    
    // Validation
    if (!title) {
        showToast('⚠️ Введите название');
        return;
    }
    
    if (!selectedCat) {
        showToast('⚠️ Выберите категорию');
        return;
    }
    
    const category = selectedCat.dataset.category;
    const cat = Utils.getCategory(category);
    
    // Получаем пользователя
    let user;
    if (hasBackend() && window.API) {
        try {
            user = await API.getCurrentUser();
        } catch (e) {
            console.error('Failed to load user:', e);
            user = Data.getUser();
        }
    } else {
        user = Data.getUser();
    }
    
    const newItem = {
        title: title,
        description: description || 'Хорошее состояние, заберите кто хочет.',
        category: category,
        emoji: cat.icon,
        location: {
            address: 'ул. Льва Толстого, 23', // TODO: получить реальный адрес
            details: 'у подъезда',
            lat: App.currentLocation?.lat || 55.7558,
            lng: App.currentLocation?.lng || 37.6173
        },
        chatEnabled: document.getElementById('chatToggle')?.classList.contains('active') ?? true
    };
    
    // Сохраняем через API или localStorage
    if (hasBackend() && window.API) {
        try {
            await API.createItem(newItem);
            showSuccessModal('🎉', 'Опубликовано!', '+10 кармы • Уведомим когда заберут');
        } catch (e) {
            console.error('Failed to create item:', e);
            showToast('⚠️ Ошибка при публикации. Попробуйте еще раз.');
            return;
        }
    } else {
        Data.addItem(newItem);
        Data.addKarma(10);
        Data.updateUserStats('published', 1);
        showSuccessModal('🎉', 'Опубликовано!', '+10 кармы • Уведомим когда заберут');
    }
    
    // Reset form
    initAddScreen();
}

// === Profile Screen ===
async function initProfileScreen() {
    // Получаем пользователя из API или localStorage
    let user;
    if (hasBackend() && window.API) {
        try {
            user = await API.getCurrentUser();
        } catch (e) {
            console.error('Failed to load user from backend:', e);
            user = Data.getUser();
        }
    } else {
        user = Data.getUser();
    }
    
    // Update karma display
    const karmaEl = document.getElementById('userKarma');
    if (karmaEl) karmaEl.textContent = user.karma;
    
    // Update stats
    const statsEl = document.getElementById('userStats');
    if (statsEl) {
        statsEl.innerHTML = `
            <div class="bg-white rounded-2xl p-4 text-center">
                <div class="text-2xl font-bold text-emerald-600">${user.stats?.published || 0}</div>
                <div class="text-xs text-gray-500">Выложено</div>
            </div>
            <div class="bg-white rounded-2xl p-4 text-center">
                <div class="text-2xl font-bold text-purple-600">${user.stats?.taken || 0}</div>
                <div class="text-xs text-gray-500">Забрали</div>
            </div>
            <div class="bg-white rounded-2xl p-4 text-center">
                <div class="text-2xl font-bold text-orange-600">~${user.stats?.savedKg || 0}кг</div>
                <div class="text-xs text-gray-500">Спасено</div>
            </div>
        `;
    }
    
    // Render achievements
    renderAchievements(user);
    
    // Render my items
    renderMyItems(user);
}

function renderAchievements(user) {
    const container = document.getElementById('achievementsList');
    if (!container) return;
    
    container.innerHTML = ACHIEVEMENTS.slice(0, 4).map(ach => {
        const unlocked = user.achievements?.includes(ach.id);
        return `
            <div class="badge flex-shrink-0 w-16 h-16 ${unlocked ? 'bg-gradient-to-br from-green-100 to-emerald-200' : 'bg-gray-100 opacity-40'} 
                 rounded-2xl flex flex-col items-center justify-center" title="${ach.desc}">
                <span class="text-2xl">${unlocked ? ach.icon : '🔒'}</span>
                <span class="text-xs text-gray-600">${unlocked ? ach.name : '???'}</span>
            </div>
        `;
    }).join('');
}

async function renderMyItems(user) {
    // Получаем объявления из API или localStorage
    let items = [];
    if (hasBackend() && window.API) {
        try {
            items = await API.getItems({ authorId: user.id });
        } catch (e) {
            console.error('Failed to load user items from backend:', e);
            items = Data.getItems().filter(item => item.author?.id === user.id);
        }
    } else {
        items = Data.getItems().filter(item => item.author?.id === user.id);
    }
    const container = document.querySelector('#screen-profile .space-y-2');
    if (!container || items.length === 0) return;
    
    container.innerHTML = items.slice(0, 3).map(item => {
        const isActive = item.status === 'active';
        return `
            <div class="flex items-center gap-3 p-2 border ${isActive ? 'border-emerald-200 bg-emerald-50' : 'border-gray-100'} rounded-xl" onclick="showItemDetail(${item.id})">
                <span class="text-2xl">${item.emoji || '📦'}</span>
                <div class="flex-1">
                    <p class="text-sm font-semibold">${escapeHtml(item.title)}</p>
                    <p class="text-xs ${isActive ? 'text-emerald-600' : 'text-gray-500'}">
                        ${item.status === 'active' ? `🟢 Активно • ${Utils.timeRemaining(item.expiresAt)}` : ''}
                        ${item.status === 'taken' ? '✅ Забрали' : ''}
                        ${item.status === 'expired' ? '⏰ Просрочено' : ''}
                    </p>
                </div>
                ${isActive ? `<button onclick="event.stopPropagation(); extendItem(${item.id})" class="px-2 py-1 bg-emerald-500 text-white rounded-lg text-xs">Продлить</button>` : ''}
                ${item.status === 'taken' ? `<span class="text-xs text-gray-400">+25 ⭐</span>` : ''}
            </div>
        `;
    }).join('');
}

// === Modals ===
function showSuccessModal(emoji, title, text) {
    document.getElementById('successEmoji').textContent = emoji;
    document.getElementById('successTitle').textContent = title;
    document.getElementById('successText').textContent = text;
    document.getElementById('successModal').classList.remove('hidden');
}

function hideModal() {
    document.getElementById('successModal').classList.add('hidden');
    document.getElementById('reportModal')?.classList.add('hidden');
    
    // Return to previous screen
    showScreen(App.previousScreen || 'feed');
}

function showReportModal() {
    const modal = document.getElementById('reportModal');
    if (modal) modal.classList.remove('hidden');
}

async function submitReport(reason) {
    document.getElementById('reportModal')?.classList.add('hidden');
    
    const item = App.selectedItem;
    if (!item) return;
    
    if (hasBackend() && window.API) {
        try {
            await API.reportItem(item.id, reason);
            showToast('Жалоба отправлена. Спасибо!');
        } catch (e) {
            console.error('Failed to submit report:', e);
            showToast('⚠️ Ошибка при отправке жалобы.');
        }
    } else {
        Data.addReport(item.id, reason);
        showToast('Жалоба отправлена. Спасибо!');
    }
}

// === Toast Notifications ===
function showToast(message) {
    // Remove existing toasts
    document.querySelectorAll('.toast').forEach(t => t.remove());
    
    const toast = document.createElement('div');
    toast.className = 'toast fixed top-16 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white px-4 py-2 rounded-full text-sm font-semibold z-50 shadow-lg';
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => toast.remove(), 3000);
}

// === Chat Toggle ===
function toggleChat() {
    const toggle = document.getElementById('chatToggle');
    if (toggle) {
        toggle.classList.toggle('active');
    }
}

// === Upload Zone ===
function initUploadZone() {
    const zone = document.getElementById('uploadZone');
    if (!zone) return;
    
    zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        zone.classList.add('dragover');
    });
    
    zone.addEventListener('dragleave', () => {
        zone.classList.remove('dragover');
    });
    
    zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('dragover');
        handleFileUpload(e.dataTransfer.files[0]);
    });
    
    zone.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.capture = 'environment';
        input.onchange = (e) => {
            if (e.target.files[0]) {
                handleFileUpload(e.target.files[0]);
            }
        };
        input.click();
    });
}

function handleFileUpload(file) {
    if (!file || !file.type.startsWith('image/')) {
        showToast('⚠️ Выберите изображение');
        return;
    }
    
    App.uploadedPhoto = file;
    
    const zone = document.getElementById('uploadZone');
    if (zone) {
        zone.classList.add('has-image');
        zone.innerHTML = `
            <div class="text-5xl mb-2">✅</div>
            <p class="font-semibold text-emerald-600">Фото загружено!</p>
            <p class="text-xs text-gray-500 mt-1">${file.name}</p>
        `;
    }
}

// === Tab Switching ===
function initTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const category = this.dataset.category;
            if (category) {
                setCategory(category);
            }
        });
    });
    
    // Set initial category
    setCategory(App.selectedCategory);
}

// === Initialize App ===
document.addEventListener('DOMContentLoaded', async () => {
    // Initialize Telegram WebApp
    const isTelegram = initTelegram();
    
    // Initialize API (will use backend if available, otherwise localStorage)
    let backendAvailable = false;
    if (window.API) {
        backendAvailable = await API.init();
    }
    
    // Initialize storage (fallback) - только если бэкенд недоступен
    if (window.Storage && !backendAvailable) {
        Storage.init();
    }
    
    // Show default screen (map as primary)
    showScreen('map');
    
    // Init components
    initTabs();
    initUploadZone();
    
    // Bottom nav clicks
    document.querySelectorAll('.bottom-nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const screen = btn.dataset.screen;
            if (screen) showScreen(screen);
        });
    });
    
    // Log mode
    console.log(`🗑️ Помоечка кормит ${isTelegram ? '(Telegram Mini App)' : '(Web)'}`);
});
