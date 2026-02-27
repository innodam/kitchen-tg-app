#!/usr/bin/env node
/**
 * Пересчёт hours_worked у всех записей в work_schedule по start_time и end_time.
 * Запуск: node recalc-hours.js
 */
const { getDatabase } = require('./database');

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

const db = getDatabase();
db.all('SELECT id, start_time, end_time FROM work_schedule', [], (err, rows) => {
  if (err) {
    console.error('Ошибка чтения БД:', err.message);
    db.close();
    process.exit(1);
  }
  if (!rows || rows.length === 0) {
    console.log('Нет записей для пересчёта.');
    db.close();
    return;
  }
  let done = 0;
  const total = rows.length;
  rows.forEach((row) => {
    const hours = calcHoursWorked(row.start_time, row.end_time);
    db.run('UPDATE work_schedule SET hours_worked = ? WHERE id = ?', [hours, row.id], function(updateErr) {
      if (updateErr) console.error('Ошибка обновления id', row.id, updateErr.message);
      done++;
      if (done === total) {
        console.log('Пересчитано записей:', total);
        db.close();
      }
    });
  });
});
