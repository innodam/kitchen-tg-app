# Запуск приложения на бесплатном сервере (Telegram Mini App)

Приложение — это **Express-сервер** (API + раздача фронта). Чтобы открывать его из Telegram как Mini App, нужен **публичный HTTPS-URL**. Ниже — вариант на бесплатном хостинге.

## Вариант 1: Render (рекомендуется)

1. **Регистрация:** [render.com](https://render.com) → Sign up (можно через GitHub).

2. **Новый Web Service:**
   - Dashboard → **New +** → **Web Service**.
   - Подключите репозиторий **innodam/kitchen-tg-app** (или свой форк).
   - Branch: `main`.

3. **Настройки сервиса:**
   - **Runtime:** Node.
   - **Build Command:** `npm install`.
   - **Start Command:** `npm start`.
   - **Plan:** Free.

4. **Environment Variables** (в разделе Environment):
   - `PORT` — не задавайте (Render сам подставит порт).
   - `TELEGRAM_BOT_TOKEN` — токен от [@BotFather](https://t.me/BotFather).
   - `DATABASE_PATH` — например `./data/kitchen.db` (на Free-плане диск эфемерный: после перезапуска данные могут пропасть).
   - `UPLOAD_DIR` — например `./uploads`.

5. **Create Web Service.** Дождитесь деплоя.

6. **URL приложения** будет вида:  
   `https://kitchen-tg-app-xxxx.onrender.com`  
   (или как Render покажет вверху сервиса).

7. **Настройка бота в Telegram:**
   - [@BotFather](https://t.me/BotFather) → `/newapp` → выберите бота → укажите название и **URL приложения** из шага 6.
   - `/setmenubutton` → выберите бота → текст кнопки «Кухня», URL — тот же.

**Ограничения Free на Render:** сервис «засыпает» после неактивности; первый запрос после сна может идти 30–60 секунд (cold start).

---

## Вариант 2: Railway

1. [railway.app](https://railway.app) → Login with GitHub.
2. **New Project** → **Deploy from GitHub repo** → выберите `kitchen-tg-app`.
3. В настройках сервиса: **Variables** — добавьте `TELEGRAM_BOT_TOKEN` (и при необходимости `DATABASE_PATH`, `UPLOAD_DIR`). `PORT` Railway задаёт сам.
4. **Settings** → **Generate Domain** — получите URL вида `https://kitchen-tg-app-production-xxxx.up.railway.app`.
5. В BotFather: `/newapp` и `/setmenubutton` с этим URL.

У бесплатного плана Railway ограниченный лимит часов в месяц.

---

## Вариант 3: Fly.io

1. Установите [flyctl](https://fly.io/docs/hands-on/install-flyctl/).
2. В папке проекта:
   ```bash
   fly launch
   ```
   (при вопросах: имя приложения, регион — по желанию; не поднимать Postgres, если спросит.)
3. Добавьте секреты:
   ```bash
   fly secrets set TELEGRAM_BOT_TOKEN=ваш_токен
   ```
4. Деплой: `fly deploy`.
5. URL: `https://ваше-имя-app.fly.dev` — его указать в BotFather (`/newapp`, `/setmenubutton`).

---

## Общее

- **Токен бота:** [@BotFather](https://t.me/BotFather) → `/newbot` → скопируйте токен в переменную `TELEGRAM_BOT_TOKEN` на сервере.
- **Mini App в Telegram:** приложение открывается по тому URL, который вы указали в BotFather (`/newapp` и кнопка меню). Сервер должен отдавать ваш фронт по этому же домену (у вас так и есть: один Express отдаёт и API, и `public/`).
- **База и файлы на Free:** на бесплатных планах диск часто эфемерный. Для постоянного хранения данных позже можно подключить внешнюю БД (например PostgreSQL на том же Render/Railway) и хранилище для файлов.

После деплоя откройте в Telegram вашего бота и нажмите кнопку «Кухня» (или откройте Mini App по ссылке из меню) — откроется ваше приложение с сервера.
