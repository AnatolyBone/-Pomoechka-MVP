# ⚡ Быстрый деплой на Netlify

## 🎯 За 5 минут

### 1. GitHub
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/pomoechka.git
git push -u origin main
```

### 2. Netlify (фронтенд)
1. Зайдите на [netlify.com](https://netlify.com)
2. **Add new site** → **Import from Git** → **GitHub**
3. Выберите репозиторий
4. Настройки:
   - Build command: *(пусто)*
   - Publish directory: `.`
5. **Deploy site**
6. Скопируйте URL (например: `https://pomoechka-xyz.netlify.app`)

### 3. Railway (бэкенд)
1. Зайдите на [railway.app](https://railway.app)
2. **New Project** → **Deploy from GitHub**
3. Выберите репозиторий
4. Railway автоматически определит Node.js
5. Скопируйте URL (например: `https://pomoechka.up.railway.app`)

### 4. Обновите конфиг
В `js/config.js` замените:
```javascript
API_URL: 'https://pomoechka.up.railway.app' // ← Ваш Railway URL
```

В `server.js` добавьте Netlify URL в `allowedOrigins`:
```javascript
const allowedOrigins = [
    'http://localhost:8000',
    'https://pomoechka-xyz.netlify.app' // ← Ваш Netlify URL
];
```

### 5. Закоммитьте и запушьте
```bash
git add .
git commit -m "Configure production URLs"
git push
```

### 6. Готово! 🎉
- Фронтенд: `https://pomoechka-xyz.netlify.app`
- Бэкенд: `https://pomoechka.up.railway.app`
- Админка: `https://pomoechka-xyz.netlify.app/admin.html`

---

## 📝 Чеклист

- [ ] Код загружен в GitHub
- [ ] Фронтенд задеплоен на Netlify
- [ ] Бэкенд задеплоен на Railway
- [ ] URL бэкенда обновлен в `js/config.js`
- [ ] Netlify URL добавлен в CORS в `server.js`
- [ ] Изменения закоммичены и запушены
- [ ] Проверена работа приложения

---

Подробная инструкция: [DEPLOY.md](DEPLOY.md)

