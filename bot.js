// Простой пример Telegram бота для запуска Mini App
// Установите: npm install node-telegram-bot-api

/*
const TelegramBot = require('node-telegram-bot-api');
const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
    console.log('TELEGRAM_BOT_TOKEN не установлен. Пропускаем запуск бота.');
    process.exit(0);
}

const bot = new TelegramBot(token, { polling: true });

// Команда для открытия Mini App
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, 'Добро пожаловать в приложение для кухни!', {
        reply_markup: {
            inline_keyboard: [[
                {
                    text: 'Открыть приложение',
                    web_app: { url: process.env.APP_URL || 'http://localhost:3000' }
                }
            ]]
        }
    });
});

// Установка меню кнопки
bot.setMyCommands([
    { command: 'start', description: 'Запустить приложение' }
]);

console.log('Telegram бот запущен');
*/

// Этот файл опционален - Mini App можно открыть напрямую через URL
// или настроить через BotFather команду /newapp
