require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { initDatabase, getDatabase } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';

// Middleware (разрешаем запросы из браузера и с file://)
app.use(cors({ origin: true, credentials: false, methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'] }));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use('/uploads', express.static(UPLOAD_DIR));

// Настройка multer для загрузки файлов
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'recipe-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Только изображения разрешены!'));
    }
  }
});

// Инициализация базы данных
initDatabase().then(() => {
  console.log('База данных инициализирована');
}).catch(err => {
  console.error('Ошибка инициализации БД:', err);
});

// ========== API для сотрудников ==========
app.get('/api/employees', (req, res) => {
  const db = getDatabase();
  db.all('SELECT * FROM employees', (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
    db.close();
  });
});

app.post('/api/employees', (req, res) => {
  const { telegram_id, name, hourly_rate } = req.body;
  const db = getDatabase();
  
  db.run(
    'INSERT INTO employees (telegram_id, name, hourly_rate) VALUES (?, ?, ?)',
    [telegram_id, name, hourly_rate],
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({ id: this.lastID, telegram_id, name, hourly_rate });
      db.close();
    }
  );
});

// ========== API для зон кухни ==========
app.get('/api/zones', (req, res) => {
  const db = getDatabase();
  db.all('SELECT * FROM kitchen_zones ORDER BY name', (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
    db.close();
  });
});

// ========== API для графика работы ==========
app.get('/api/schedule', (req, res) => {
  const { employee_id, zone_id, start_date, end_date } = req.query;
  const db = getDatabase();
  
  let query = `
    SELECT 
      ws.id, ws.employee_id, ws.zone_id,
      date(ws.date) as date,
      ws.start_time, ws.end_time, ws.hours_worked, ws.created_at,
      e.name as employee_name,
      e.hourly_rate,
      kz.name as zone_name
    FROM work_schedule ws
    JOIN employees e ON ws.employee_id = e.id
    JOIN kitchen_zones kz ON ws.zone_id = kz.id
    WHERE 1=1
  `;
  const params = [];
  
  if (employee_id) {
    query += ' AND ws.employee_id = ?';
    params.push(employee_id);
  }
  if (zone_id) {
    query += ' AND ws.zone_id = ?';
    params.push(zone_id);
  }
  if (start_date) {
    query += ' AND date(ws.date) >= date(?)';
    params.push(start_date);
  }
  if (end_date) {
    query += ' AND date(ws.date) <= date(?)';
    params.push(end_date);
  }
  
  query += ' ORDER BY ws.date DESC, ws.start_time';
  
  db.all(query, params, (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
    db.close();
  });
});

// Расчёт часов смены: при переходе через 00:00 часы суммируются (конец на следующий день)
function calcHoursWorked(startTime, endTime) {
  if (startTime == null || endTime == null) return 0;
  const parseMinutes = (t) => {
    const s = String(t).trim();
    if (!s) return 0;
    const parts = s.split(':');
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    if (isNaN(h) || h < 0 || h > 24) return 0;
    const mins = (isNaN(m) || m < 0 || m > 59) ? 0 : m;
    return mins + h * 60;
  };
  const startMin = parseMinutes(startTime);
  const endMin = parseMinutes(endTime);
  if (!Number.isFinite(startMin) || !Number.isFinite(endMin)) return 0;
  let hours;
  // Конец раньше начала по времени суток (например 02:59 vs 11:59) = смена через полночь
  if (endMin < startMin) {
    hours = (24 * 60 - startMin + endMin) / 60;
  } else {
    hours = (endMin - startMin) / 60;
  }
  if (hours < 0 || !Number.isFinite(hours)) {
    hours = Math.max(0, (24 * 60 - startMin + endMin) / 60);
  }
  return Math.round(Math.max(0, hours) * 100) / 100;
}

// Пересчёт hours_worked по start_time/end_time для всех или выбранных записей (исправляет старые ошибочные значения)
app.post('/api/schedule/recalc-hours', (req, res) => {
  const { employee_id, date } = req.body || req.query || {};
  const db = getDatabase();
  const selectParams = [];
  if (employee_id) selectParams.push(employee_id);
  if (date) selectParams.push(date);
  const finalQuery = 'SELECT id, start_time, end_time FROM work_schedule WHERE 1=1' +
    (employee_id ? ' AND employee_id = ?' : '') +
    (date ? ' AND date(work_schedule.date) = date(?)' : '');

  db.all(finalQuery, selectParams, (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      db.close();
      return;
    }
    if (!rows || rows.length === 0) {
      res.json({ updated: 0, message: 'Нет записей для пересчёта' });
      db.close();
      return;
    }
    let done = 0;
    const total = rows.length;
    const check = () => {
      if (++done === total) {
        res.json({ updated: total, message: 'Часы пересчитаны' });
        db.close();
      }
    };
    rows.forEach((row) => {
      const hours = calcHoursWorked(row.start_time, row.end_time);
      db.run('UPDATE work_schedule SET hours_worked = ? WHERE id = ?', [hours, row.id], function(updateErr) {
        if (updateErr) console.error('recalc row', row.id, updateErr);
        check();
      });
    });
  });
});

app.post('/api/schedule', (req, res) => {
  const { employee_id, zone_id, date, start_time, end_time } = req.body;
  const db = getDatabase();
  
  let hoursWorked = calcHoursWorked(start_time, end_time);
  
  db.run(
    `INSERT INTO work_schedule (employee_id, zone_id, date, start_time, end_time, hours_worked)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [employee_id, zone_id, date, start_time, end_time, hoursWorked],
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({ 
        id: this.lastID, 
        employee_id, 
        zone_id, 
        date, 
        start_time, 
        end_time, 
        hours_worked: hoursWorked 
      });
      db.close();
    }
  );
});

function updateScheduleById(id, req, res) {
  const { employee_id, zone_id, date, start_time, end_time } = req.body;
  if (!id || isNaN(parseInt(id, 10))) {
    res.status(400).json({ error: 'Некорректный id' });
    return;
  }
  if (employee_id == null || zone_id == null || !date || !start_time || !end_time) {
    res.status(400).json({ error: 'Требуются: employee_id, zone_id, date, start_time, end_time' });
    return;
  }
  const db = getDatabase();
  const hoursWorked = calcHoursWorked(start_time, end_time);
  db.run(
    `UPDATE work_schedule SET employee_id = ?, zone_id = ?, date = ?, start_time = ?, end_time = ?, hours_worked = ? WHERE id = ?`,
    [employee_id, zone_id, date, start_time, end_time, hoursWorked, id],
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        db.close();
        return;
      }
      if (this.changes === 0) {
        res.status(404).json({ error: 'Смена не найдена' });
        db.close();
        return;
      }
      res.json({
        id: parseInt(id, 10),
        employee_id,
        zone_id,
        date,
        start_time,
        end_time,
        hours_worked: hoursWorked
      });
      db.close();
    }
  );
}

app.put('/api/schedule/:id', (req, res) => {
  updateScheduleById(req.params.id, req, res);
});

app.post('/api/schedule/update', (req, res) => {
  const id = req.body?.id ?? req.query?.id;
  updateScheduleById(id, req, res);
});

function deleteScheduleById(id, res) {
  if (!id || isNaN(parseInt(id, 10))) {
    res.status(400).json({ error: 'Некорректный id' });
    return;
  }
  const db = getDatabase();
  db.run('DELETE FROM work_schedule WHERE id = ?', [id], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      db.close();
      return;
    }
    res.status(200).json({ message: 'Смена удалена', deleted: this.changes > 0 });
    db.close();
  });
}

app.delete('/api/schedule/:id', (req, res) => {
  deleteScheduleById(req.params.id, res);
});

app.post('/api/schedule/delete', (req, res) => {
  const id = req.body?.id ?? req.query?.id;
  deleteScheduleById(id, res);
});

// ========== API для расчета зарплаты ==========
app.get('/api/salary', (req, res) => {
  const { employee_id, start_date, end_date } = req.query;
  
  if (!employee_id || !start_date || !end_date) {
    res.status(400).json({ error: 'Требуются параметры: employee_id, start_date, end_date' });
    return;
  }
  
  const db = getDatabase();
  const query = `
    SELECT 
      e.id,
      e.name,
      e.hourly_rate,
      SUM(ws.hours_worked) as total_hours,
      SUM(ws.hours_worked) * e.hourly_rate as total_salary
    FROM employees e
    JOIN work_schedule ws ON e.id = ws.employee_id
    WHERE e.id = ? AND date(ws.date) >= date(?) AND date(ws.date) <= date(?)
    GROUP BY e.id, e.name, e.hourly_rate
  `;
  
  db.get(query, [employee_id, start_date, end_date], (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    
    if (!row) {
      res.json({
        employee_id,
        total_hours: 0,
        total_salary: 0,
        hourly_rate: 0
      });
    } else {
      res.json(row);
    }
    db.close();
  });
});

// ========== API для технологических карт ==========
app.get('/api/recipes', (req, res) => {
  const db = getDatabase();
  db.all('SELECT * FROM recipe_cards ORDER BY name', (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    // Преобразуем пути к фото в URL
    const recipes = rows.map(recipe => ({
      ...recipe,
      photo_url: recipe.photo_path ? `/uploads/${path.basename(recipe.photo_path)}` : null
    }));
    res.json(recipes);
    db.close();
  });
});

app.get('/api/recipes/:id', (req, res) => {
  const db = getDatabase();
  db.get('SELECT * FROM recipe_cards WHERE id = ?', [req.params.id], (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (!row) {
      res.status(404).json({ error: 'Технологическая карта не найдена' });
      return;
    }
    res.json({
      ...row,
      photo_url: row.photo_path ? `/uploads/${path.basename(row.photo_path)}` : null
    });
    db.close();
  });
});

app.post('/api/recipes', upload.single('photo'), (req, res) => {
  const { name, description, ingredients, cooking_steps } = req.body;
  const photo_path = req.file ? req.file.path : null;
  
  const db = getDatabase();
  db.run(
    `INSERT INTO recipe_cards (name, description, ingredients, cooking_steps, photo_path)
     VALUES (?, ?, ?, ?, ?)`,
    [name, description, ingredients, cooking_steps, photo_path],
    function(err) {
      if (err) {
        // Удаляем загруженный файл при ошибке
        if (req.file) {
          fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({
        id: this.lastID,
        name,
        description,
        ingredients,
        cooking_steps,
        photo_url: photo_path ? `/uploads/${path.basename(photo_path)}` : null
      });
      db.close();
    }
  );
});

app.put('/api/recipes/:id', upload.single('photo'), (req, res) => {
  const { name, description, ingredients, cooking_steps } = req.body;
  const db = getDatabase();
  
  // Сначала получаем текущую запись
  db.get('SELECT * FROM recipe_cards WHERE id = ?', [req.params.id], (err, oldRecipe) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (!oldRecipe) {
      res.status(404).json({ error: 'Технологическая карта не найдена' });
      return;
    }
    
    const photo_path = req.file ? req.file.path : oldRecipe.photo_path;
    
    // Удаляем старое фото, если загружено новое
    if (req.file && oldRecipe.photo_path) {
      fs.unlinkSync(oldRecipe.photo_path);
    }
    
    db.run(
      `UPDATE recipe_cards 
       SET name = ?, description = ?, ingredients = ?, cooking_steps = ?, 
           photo_path = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [name, description, ingredients, cooking_steps, photo_path, req.params.id],
      function(err) {
        if (err) {
          if (req.file) {
            fs.unlinkSync(req.file.path);
          }
          res.status(500).json({ error: err.message });
          return;
        }
        res.json({
          id: req.params.id,
          name,
          description,
          ingredients,
          cooking_steps,
          photo_url: photo_path ? `/uploads/${path.basename(photo_path)}` : null
        });
        db.close();
      }
    );
  });
});

app.delete('/api/recipes/:id', (req, res) => {
  const db = getDatabase();
  
  // Получаем запись для удаления фото
  db.get('SELECT * FROM recipe_cards WHERE id = ?', [req.params.id], (err, recipe) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (!recipe) {
      res.status(404).json({ error: 'Технологическая карта не найдена' });
      return;
    }
    
    // Удаляем фото, если есть
    if (recipe.photo_path && fs.existsSync(recipe.photo_path)) {
      fs.unlinkSync(recipe.photo_path);
    }
    
    db.run('DELETE FROM recipe_cards WHERE id = ?', [req.params.id], function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({ message: 'Технологическая карта удалена' });
      db.close();
    });
  });
});

// Статическая раздача frontend
app.use(express.static('public'));

// 404 для API — всегда JSON
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    res.status(404).json({ error: 'Не найдено' });
    return;
  }
  next();
});

app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
  console.log(`Откройте http://localhost:${PORT} для тестирования`);
});
