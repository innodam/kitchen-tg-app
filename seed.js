// Скрипт для добавления тестовых данных
// Запуск: node seed.js

require('dotenv').config();
const { getDatabase } = require('./database');

const db = getDatabase();

// Добавление тестовых сотрудников
const employees = [
    { telegram_id: '123456789', name: 'Иван Петров', hourly_rate: 500 },
    { telegram_id: '987654321', name: 'Мария Сидорова', hourly_rate: 550 },
    { telegram_id: '555666777', name: 'Алексей Иванов', hourly_rate: 480 }
];

// Добавление тестовых технологических карт
const recipes = [
    {
        name: 'Салат Цезарь',
        description: 'Классический салат с курицей и соусом цезарь',
        ingredients: 'Куриное филе - 200г\nСалат романо - 100г\nПармезан - 50г\nСухарики - 30г\nСоус цезарь - 50мл',
        cooking_steps: '1. Обжарить куриное филе\n2. Нарезать салат\n3. Натереть пармезан\n4. Смешать все ингредиенты\n5. Заправить соусом'
    },
    {
        name: 'Борщ украинский',
        description: 'Традиционный украинский борщ',
        ingredients: 'Свекла - 200г\nКапуста - 150г\nМорковь - 100г\nЛук - 50г\nМясо - 300г\nТоматная паста - 30г',
        cooking_steps: '1. Сварить мясной бульон\n2. Нарезать овощи\n3. Обжарить свеклу с морковью\n4. Добавить капусту\n5. Варить 30 минут\n6. Подавать со сметаной'
    }
];

db.serialize(() => {
    console.log('Добавление тестовых данных...');
    
    // Добавление сотрудников
    const empStmt = db.prepare('INSERT OR IGNORE INTO employees (telegram_id, name, hourly_rate) VALUES (?, ?, ?)');
    employees.forEach(emp => {
        empStmt.run(emp.telegram_id, emp.name, emp.hourly_rate);
        console.log(`Добавлен сотрудник: ${emp.name}`);
    });
    empStmt.finalize();
    
    // Добавление технологических карт
    const recipeStmt = db.prepare('INSERT OR IGNORE INTO recipe_cards (name, description, ingredients, cooking_steps) VALUES (?, ?, ?, ?)');
    recipes.forEach(recipe => {
        recipeStmt.run(recipe.name, recipe.description, recipe.ingredients, recipe.cooking_steps);
        console.log(`Добавлена технологическая карта: ${recipe.name}`);
    });
    recipeStmt.finalize();
    
    console.log('Тестовые данные добавлены!');
    db.close();
});
