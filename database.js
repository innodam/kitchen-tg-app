const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DATABASE_PATH || './kitchen.db';

// Создаем директорию для загрузок, если её нет
const uploadDir = process.env.UPLOAD_DIR || './uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

function initDatabase() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error('Ошибка подключения к БД:', err);
        reject(err);
        return;
      }
      console.log('Подключено к SQLite базе данных');
    });

    // Создание таблиц
    db.serialize(() => {
      // Таблица сотрудников
      db.run(`CREATE TABLE IF NOT EXISTS employees (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        telegram_id TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        hourly_rate REAL NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      // Таблица зон кухни
      db.run(`CREATE TABLE IF NOT EXISTS kitchen_zones (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      // Таблица графика работы
      db.run(`CREATE TABLE IF NOT EXISTS work_schedule (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_id INTEGER NOT NULL,
        zone_id INTEGER NOT NULL,
        date DATE NOT NULL,
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        hours_worked REAL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (employee_id) REFERENCES employees(id),
        FOREIGN KEY (zone_id) REFERENCES kitchen_zones(id),
        UNIQUE(employee_id, zone_id, date, start_time)
      )`);

      // Таблица технологических карт
      db.run(`CREATE TABLE IF NOT EXISTS recipe_cards (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        ingredients TEXT NOT NULL,
        cooking_steps TEXT NOT NULL,
        photo_path TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      // Вставка начальных данных (зоны кухни)
      db.run(`INSERT OR IGNORE INTO kitchen_zones (name, description) VALUES 
        ('Холодный цех', 'Подготовка холодных закусок и салатов'),
        ('Горячий цех', 'Приготовление горячих блюд'),
        ('Кондитерский цех', 'Приготовление десертов и выпечки'),
        ('Мойка', 'Мытье посуды и уборка')`, (err) => {
        if (err) {
          console.error('Ошибка при добавлении зон:', err);
        }
        
        db.close((err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
    });
  });
}

function getDatabase() {
  return new sqlite3.Database(DB_PATH);
}

module.exports = { initDatabase, getDatabase };
