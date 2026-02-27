# Как выложить проект на GitHub

## 1. Создать репозиторий на GitHub

1. Зайдите на [github.com](https://github.com) и войдите в аккаунт.
2. Нажмите **«+»** → **«New repository»**.
3. Укажите имя репозитория (например, `kitchen-tg-app`).
4. Выберите **Public**, галочку **«Add a README»** можно не ставить.
5. Нажмите **«Create repository»**.

## 2. Инициализировать Git в проекте и отправить код

В терминале из папки проекта выполните:

```bash
cd /Users/dambas/Projects/kitchen-tg-app

# Инициализация (если ещё не сделано)
git init

# Добавить все файлы (node_modules, .env, *.db, uploads/ уже в .gitignore)
git add .

# Первый коммит
git commit -m "Initial commit: Kitchen Telegram Mini App"

# Подключить ваш репозиторий (подставьте свой логин и имя репо)
git remote add origin https://github.com/ВАШ_ЛОГИН/kitchen-tg-app.git

# Отправить код в ветку main
git branch -M main
git push -u origin main
```

Если репозиторий создан с README, перед `git push` может понадобиться:

```bash
git pull origin main --allow-unrelated-histories
git push -u origin main
```

## 3. Авторизация при push

- **HTTPS:** при первом `git push` браузер или Git запросит логин/пароль. Вместо пароля используйте [Personal Access Token](https://github.com/settings/tokens) (классический токен с правом `repo`).
- **SSH:** если настроен ключ, замените `origin` на SSH-URL:  
  `git@github.com:ВАШ_ЛОГИН/kitchen-tg-app.git`

## Что не попадёт в репозиторий (уже в .gitignore)

- `node_modules/`
- `.env` (секреты)
- `*.db` (база SQLite)
- `uploads/` (загруженные фото)
- `.DS_Store`

После push репозиторий будет доступен по адресу:  
`https://github.com/ВАШ_ЛОГИН/kitchen-tg-app`
