// Инициализация Telegram Web App (безопасно при открытии в браузере)
const tg = window.Telegram?.WebApp || { ready: () => {}, expand: () => {} };
tg.ready();
tg.expand();

function safeAlert(message) {
  try {
    if (typeof tg.showAlert === 'function') {
      tg.showAlert(message);
    } else {
      window.alert(message);
    }
  } catch (e) {
    window.alert(message);
  }
}

function getApiBase() {
    const o = window.location.origin;
    if (o && o.startsWith('http')) return o;
    if (window.location.hostname) return 'http://' + window.location.hostname + ':3000';
    return 'http://localhost:3000';
}
const API_BASE = getApiBase();
const STORAGE_CHEF_ID = 'kitchen_chef_id';

function normalizeDateKey(dateVal) {
    if (dateVal == null) return '';
    const s = String(dateVal).trim().slice(0, 10);
    if (!s) return '';
    const parts = s.split('-');
    if (parts.length >= 3) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        const d = parseInt(parts[2], 10);
        if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
            return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        }
    }
    const parsed = new Date(s);
    if (isNaN(parsed.getTime())) return '';
    const y = parsed.getFullYear();
    const m = parsed.getMonth() + 1;
    const day = parsed.getDate();
    return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function formatTimeShort(timeStr) {
    if (timeStr == null || timeStr === '') return '';
    const s = String(timeStr).trim();
    const match = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (!match) return s.slice(0, 5);
    const hour = parseInt(match[1], 10);
    const min = match[2];
    return (hour < 10 ? String(hour) : match[1]) + ':' + min;
}

let employeesList = [];
let zonesList = [];
let currentEmployeeId = null;
let calendarViewYear = new Date().getFullYear();
let calendarViewMonth = new Date().getMonth();
let currentDayModalDate = '';
let salaryViewYear = new Date().getFullYear();
let salaryViewMonth = new Date().getMonth();

const STORAGE_THEME = 'kitchen_theme';

/** Получить значение из themeParams (snake_case в API, иногда camelCase в SDK). */
function getThemeParam(params, key) {
    if (!params) return null;
    if (params[key] != null) return params[key];
    const camel = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    return params[camel] != null ? params[camel] : null;
}

/** Применить тему из настроек Telegram (themeParams + colorScheme). Вызывать при загрузке и по theme_changed. */
function applyTelegramTheme() {
    const webApp = window.Telegram?.WebApp;
    const params = webApp?.themeParams;
    const colorScheme = webApp?.colorScheme; // "light" | "dark"
    if (!params || typeof params !== 'object') return false;

    const root = document.documentElement;
    if (colorScheme) {
        root.setAttribute('data-theme', colorScheme);
    }
    // Маппинг ThemeParams API → наши CSS-переменные (см. https://core.telegram.org/bots/webapps#themeparams)
    const map = {
        'bg_color': '--color-background',
        'secondary_bg_color': '--color-surface',
        'section_bg_color': '--color-surface-elevated',
        'text_color': '--color-text-primary',
        'hint_color': '--color-text-secondary',
        'subtitle_text_color': '--color-text-tertiary',
        'link_color': '--color-primary',
        'button_color': '--color-primary',
        'button_text_color': '--tg-theme-button-text-color',
        'accent_text_color': '--color-primary',
        'section_header_text_color': '--color-text-primary',
        'header_bg_color': '--color-surface-elevated',
        'destructive_text_color': '--color-error',
        'section_separator_color': '--color-outline'
    };
    for (const [key, cssVar] of Object.entries(map)) {
        const value = getThemeParam(params, key);
        if (value) root.style.setProperty(cssVar, value);
    }
    // Стеклянные поверхности — из secondary/section фона Telegram
    const glassBg = getThemeParam(params, 'section_bg_color') || getThemeParam(params, 'secondary_bg_color') || getThemeParam(params, 'bg_color');
    if (glassBg) {
        root.style.setProperty('--glass-bg', glassBg + 'ee');
        root.style.setProperty('--glass-border', glassBg + '99');
    }
    // Подогнать фон и шапку Mini App под тему Telegram
    const bg = getThemeParam(params, 'bg_color');
    if (bg && webApp.setHeaderColor) webApp.setHeaderColor(bg);
    if (bg && webApp.setBackgroundColor) webApp.setBackgroundColor(bg);
    return true;
}

function initTheme() {
    const useTelegram = applyTelegramTheme();
    if (useTelegram) {
        if (window.Telegram?.WebApp?.onEvent) {
            window.Telegram.WebApp.onEvent('themeChanged', applyTelegramTheme);
        }
        const themeToggle = document.querySelector('.theme-toggle');
        if (themeToggle) themeToggle.style.display = 'none';
        return;
    }
    const stored = localStorage.getItem(STORAGE_THEME);
    const dark = stored === 'dark' || (!stored && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
}

function toggleTheme() {
    const useTelegram = window.Telegram?.WebApp?.themeParams;
    if (useTelegram) return;
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const next = isDark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem(STORAGE_THEME, next);
}

// Инициализация приложения
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initNavigation();
    initDayModalAddShifts();
    initRegistrationForm();

    const initData = window.Telegram?.WebApp?.initData;
    if (initData) {
        checkAuthAndMaybeShowRegistration(initData);
    } else {
        loadInitialData();
    }

    const salaryEmpSelect = document.getElementById('employee-select');
    if (salaryEmpSelect) {
        salaryEmpSelect.addEventListener('change', () => calculateSalary());
    }
    const salaryMonthInput = document.getElementById('salary-month-input');
    if (salaryMonthInput) {
        salaryMonthInput.addEventListener('change', onSalaryMonthInputChange);
    }
});

/** Проверка: зарегистрирован ли пользователь Telegram. Если нет — показываем экран регистрации. */
async function checkAuthAndMaybeShowRegistration(initData) {
    const regScreen = document.getElementById('registration-screen');
    const mainContainer = document.getElementById('main-container');
    try {
        const res = await fetch(`${API_BASE}/api/auth/me`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ initData })
        });
        const data = await res.json();
        if (data.registered && data.employee) {
            currentEmployeeId = data.employee.id;
            try {
                localStorage.setItem(STORAGE_CHEF_ID, String(data.employee.id));
            } catch (e) {}
            loadInitialData();
        } else {
            regScreen.style.display = 'flex';
            if (mainContainer) mainContainer.style.display = 'none';
        }
    } catch (e) {
        console.error('auth/me', e);
        loadInitialData();
    }
}

function initRegistrationForm() {
    const form = document.getElementById('registration-form');
    const regScreen = document.getElementById('registration-screen');
    const mainContainer = document.getElementById('main-container');
    const errEl = document.getElementById('registration-error');
    const submitBtn = document.getElementById('reg-submit');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const initData = window.Telegram?.WebApp?.initData;
        if (!initData) {
            if (errEl) {
                errEl.textContent = 'Откройте приложение из Telegram.';
                errEl.style.display = 'block';
            }
            return;
        }
        const name = document.getElementById('reg-name')?.value?.trim();
        const hourlyRate = document.getElementById('reg-hourly-rate')?.value;
        if (!name) {
            if (errEl) {
                errEl.textContent = 'Введите имя.';
                errEl.style.display = 'block';
            }
            return;
        }
        if (errEl) errEl.style.display = 'none';
        if (submitBtn) submitBtn.disabled = true;

        try {
            const res = await fetch(`${API_BASE}/api/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    initData,
                    name,
                    hourly_rate: parseFloat(hourlyRate) || 0
                })
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || 'Ошибка регистрации');
            }
            currentEmployeeId = data.id;
            try {
                localStorage.setItem(STORAGE_CHEF_ID, String(data.id));
            } catch (e) {}
            regScreen.style.display = 'none';
            if (mainContainer) mainContainer.style.display = '';
            loadInitialData();
        } catch (err) {
            if (errEl) {
                errEl.textContent = err.message || 'Ошибка. Попробуйте ещё раз.';
                errEl.style.display = 'block';
            }
        } finally {
            if (submitBtn) submitBtn.disabled = false;
        }
    });
}

// Навигация по вкладкам
function initNavigation() {
    const tabs = document.querySelectorAll('.nav-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;
            
            // Обновляем активные вкладки
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });
            document.getElementById(`${tabName}-tab`).classList.add('active');
            
            if (tabName === 'home') {
                loadHomePage();
            } else if (tabName === 'salary') {
                updateSalaryMonthLabel();
                calculateSalary();
            } else if (tabName === 'recipes') {
                loadRecipes();
            }
        });
    });
}

function onChefSelectChange() {
    const select = document.getElementById('chef-select');
    const id = select.value ? parseInt(select.value, 10) : null;
    currentEmployeeId = id;
    if (id) {
        try { localStorage.setItem(STORAGE_CHEF_ID, String(id)); } catch (e) {}
    } else {
        try { localStorage.removeItem(STORAGE_CHEF_ID); } catch (e) {}
    }
    loadHomePage();
}

function getMonthBounds(year, month) {
    const start = new Date(year, month, 1);
    const end = new Date(year, month + 1, 0);
    return {
        start_date: start.toISOString().slice(0, 10),
        end_date: end.toISOString().slice(0, 10)
    };
}

async function loadHomePage() {
    const content = document.getElementById('chef-home-content');
    const chefSelect = document.getElementById('chef-select');
    if (!currentEmployeeId || !employeesList.length) {
        document.getElementById('chef-name').textContent = '—';
        document.getElementById('chef-hourly-rate').textContent = '—';
        document.getElementById('chef-total-hours').textContent = '—';
        document.getElementById('chef-salary').textContent = '—';
        renderCalendar(calendarViewYear, calendarViewMonth, {}, {});
        const hint0 = document.getElementById('calendar-no-shifts-hint');
        if (hint0) hint0.style.display = 'block';
        return;
    }
    const employee = employeesList.find(e => e.id === currentEmployeeId);
    if (!employee) {
        document.getElementById('chef-name').textContent = '—';
        document.getElementById('chef-hourly-rate').textContent = '—';
        document.getElementById('chef-total-hours').textContent = '—';
        document.getElementById('chef-salary').textContent = '—';
        renderCalendar(calendarViewYear, calendarViewMonth, {}, {});
        const hint1 = document.getElementById('calendar-no-shifts-hint');
        if (hint1) hint1.style.display = 'block';
        return;
    }
    const now = new Date();
    const currentMonthBounds = getMonthBounds(now.getFullYear(), now.getMonth());
    const calendarBounds = getMonthBounds(calendarViewYear, calendarViewMonth);
    try {
        const [salaryRes, scheduleForSummaryRes, scheduleForCalendarRes] = await Promise.all([
            fetch(`${API_BASE}/api/salary?employee_id=${currentEmployeeId}&start_date=${currentMonthBounds.start_date}&end_date=${currentMonthBounds.end_date}`),
            fetch(`${API_BASE}/api/schedule?employee_id=${currentEmployeeId}&start_date=${currentMonthBounds.start_date}&end_date=${currentMonthBounds.end_date}`),
            fetch(`${API_BASE}/api/schedule?employee_id=${currentEmployeeId}&start_date=${calendarBounds.start_date}&end_date=${calendarBounds.end_date}`)
        ]);
        const salaryData = await salaryRes.json();
        let scheduleForCalendar = await scheduleForCalendarRes.json();
        if (!Array.isArray(scheduleForCalendar)) scheduleForCalendar = [];
        const scheduleByDate = {};
        scheduleForCalendar.forEach(s => {
            const d = normalizeDateKey(s.date);
            if (!d) return;
            const hours = parseFloat(s.hours_worked) || 0;
            const zoneId = s.zone_id != null ? String(s.zone_id) : null;
            const zoneName = s.zone_name || '';
            if (!scheduleByDate[d]) {
                scheduleByDate[d] = { hours: 0, items: [], zones: {} };
            }
            scheduleByDate[d].hours += hours;
            scheduleByDate[d].items.push(s);
            if (zoneId != null && zoneId !== '') {
                if (!scheduleByDate[d].zones[zoneId]) {
                    scheduleByDate[d].zones[zoneId] = { name: zoneName, hours: 0 };
                }
                scheduleByDate[d].zones[zoneId].hours += hours;
            }
        });
        const zoneIdToName = {};
        Object.keys(scheduleByDate).forEach(d => {
            const rec = scheduleByDate[d];
            const z = rec.zones;
            Object.keys(z).forEach(id => {
                if (z[id].name) zoneIdToName[id] = z[id].name;
            });
            const ids = Object.keys(z);
            if (ids.length > 0) {
                let best = ids[0];
                ids.forEach(id => {
                    if (z[id].hours > z[best].hours) best = id;
                });
                rec.dominantZoneId = best;
            } else if (rec.items && rec.items[0] && rec.items[0].zone_id != null) {
                rec.dominantZoneId = String(rec.items[0].zone_id);
            }
        });
        document.getElementById('chef-name').textContent = employee.name;
        document.getElementById('chef-hourly-rate').textContent = `${Number(employee.hourly_rate).toFixed(0)} ₽/час`;
        const totalHours = salaryData.total_hours != null ? parseFloat(salaryData.total_hours) : 0;
        document.getElementById('chef-total-hours').textContent = totalHours.toFixed(1);
        document.getElementById('chef-salary').textContent = (salaryData.total_salary != null ? parseFloat(salaryData.total_salary).toFixed(0) : '0') + ' ₽';
        renderCalendar(calendarViewYear, calendarViewMonth, scheduleByDate, zoneIdToName);
        const hint = document.getElementById('calendar-no-shifts-hint');
        if (hint) {
            hint.style.display = Object.keys(scheduleByDate).length === 0 ? 'block' : 'none';
        }
    } catch (err) {
        console.error(err);
        document.getElementById('chef-name').textContent = employee.name;
        document.getElementById('chef-hourly-rate').textContent = `${Number(employee.hourly_rate).toFixed(0)} ₽/час`;
        document.getElementById('chef-total-hours').textContent = '—';
        document.getElementById('chef-salary').textContent = '—';
        renderCalendar(calendarViewYear, calendarViewMonth, {}, {});
        const hint = document.getElementById('calendar-no-shifts-hint');
        if (hint) hint.style.display = 'block';
    }
}

function renderCalendar(year, month, scheduleByDate, zoneIdToName) {
    const zoneNames = zoneIdToName || {};
    const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
    document.getElementById('calendar-month-year').textContent = `${monthNames[month]} ${year}`;
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const startWeekday = first.getDay() === 0 ? 6 : first.getDay() - 1;
    const daysInMonth = last.getDate();
    const prevMonth = month === 0 ? 11 : month - 1;
    const prevYear = month === 0 ? year - 1 : year;
    const prevMonthDays = new Date(prevYear, prevMonth + 1, 0).getDate();
    const grid = document.getElementById('calendar-grid');
    grid.innerHTML = '';
    for (let i = 0; i < startWeekday; i++) {
        const d = prevMonthDays - startWeekday + i + 1;
        const dateStr = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const cell = document.createElement('div');
        cell.className = 'calendar-day calendar-day--other-month calendar-day--clickable';
        cell.setAttribute('data-date', dateStr);
        cell.textContent = d;
        cell.onclick = function() { openDayModal(dateStr); };
        grid.appendChild(cell);
    }
    const today = new Date();
    const todayStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const info = scheduleByDate[dateStr];
        const cell = document.createElement('div');
        cell.className = 'calendar-day calendar-day--current calendar-day--clickable';
        cell.setAttribute('data-date', dateStr);
        if (dateStr === todayStr) cell.classList.add('calendar-day--today');
        if (info && info.hours > 0) {
            cell.classList.add('calendar-day--has-shift');
            if (info.dominantZoneId != null) {
                cell.classList.add('calendar-day--zone-' + info.dominantZoneId);
            }
        }
        const dayNum = document.createElement('span');
        dayNum.className = 'calendar-day-num';
        dayNum.textContent = d;
        cell.appendChild(dayNum);
        if (info && info.hours > 0 && info.items && info.items.length > 0) {
            const hoursEl = document.createElement('span');
            hoursEl.className = 'calendar-day-hours';
            const parts = info.items.map(it => {
                const start = formatTimeShort(it.start_time);
                const end = formatTimeShort(it.end_time);
                return start && end ? start + '-' + end : (start || end || '');
            }).filter(Boolean);
            hoursEl.textContent = parts.join(', ');
            cell.appendChild(hoursEl);
        }
        cell.onclick = function() { openDayModal(dateStr); };
        grid.appendChild(cell);
    }
    const totalCells = startWeekday + daysInMonth;
    const rest = totalCells % 7;
    const nextDays = rest === 0 ? 0 : 7 - rest;
    for (let i = 0; i < nextDays; i++) {
        const nextMonth = month === 11 ? 0 : month + 1;
        const nextYear = month === 11 ? year + 1 : year;
        const dateStr = `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`;
        const cell = document.createElement('div');
        cell.className = 'calendar-day calendar-day--other-month calendar-day--clickable';
        cell.setAttribute('data-date', dateStr);
        cell.textContent = i + 1;
        cell.onclick = function() { openDayModal(dateStr); };
        grid.appendChild(cell);
    }
    const legendEl = document.getElementById('calendar-legend');
    if (legendEl) {
        const ids = Object.keys(zoneNames).sort((a, b) => Number(a) - Number(b));
        if (ids.length === 0) {
            legendEl.innerHTML = '';
        } else {
            legendEl.innerHTML = ids.map(id => 
                `<span class="calendar-legend-item calendar-legend-item--zone-${id}">${zoneNames[id]}</span>`
            ).join('');
        }
    }
}

function formatDateRu(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
    return `${d} ${months[m - 1]} ${y}`;
}

async function openDayModal(dateStr) {
    currentDayModalDate = dateStr;
    const titleEl = document.getElementById('day-modal-title');
    const contentEl = document.getElementById('day-modal-content');
    const addFormWrap = document.getElementById('day-modal-add-form-wrap');
    const addBtn = document.getElementById('day-modal-add-shifts-btn');
    titleEl.textContent = 'Смены за ' + formatDateRu(dateStr);
    contentEl.innerHTML = '<p class="day-modal-loading">Загрузка…</p>';
    if (addFormWrap) addFormWrap.style.display = 'none';
    if (addBtn) addBtn.style.display = 'block';
    const editWrap = document.getElementById('day-modal-edit-wrap');
    if (editWrap) editWrap.style.display = 'none';
    document.getElementById('day-modal').style.display = 'block';
    try {
        const res = await fetch(`${API_BASE}/api/schedule?start_date=${dateStr}&end_date=${dateStr}`);
        let list = await res.json().catch(function() { return []; });
        if (!Array.isArray(list)) list = [];
        if (!res.ok) {
            contentEl.innerHTML = '<p class="day-modal-empty">Не удалось загрузить смены.</p>';
        } else if (list.length === 0) {
            contentEl.innerHTML = '<p class="day-modal-empty">В этот день смен нет.</p>';
        } else {
            const escapeHtml = function(str) {
                if (str == null) return '';
                const s = String(str);
                return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
            };
            let html = '<ul class="day-shift-list">';
            list.forEach(function(s) {
                const hours = (parseFloat(s.hours_worked) || 0).toFixed(1);
                const sid = (s.id != null) ? s.id : '';
                html += '<li class="day-shift-item" data-id="' + sid + '" data-employee-id="' + (s.employee_id ?? '') + '" data-zone-id="' + (s.zone_id ?? '') + '" data-date="' + (s.date ?? '') + '" data-start="' + (s.start_time ?? '') + '" data-end="' + (s.end_time ?? '') + '">' +
                    '<span class="day-shift-employee">' + escapeHtml(s.employee_name || '—') + '</span>' +
                    '<span class="day-shift-zone">' + escapeHtml(s.zone_name || '—') + '</span>' +
                    '<span class="day-shift-time">' + escapeHtml(s.start_time || '') + ' – ' + escapeHtml(s.end_time || '') + '</span>' +
                    '<span class="day-shift-hours">' + escapeHtml(hours) + ' ч</span>' +
                    '<div class="day-shift-actions">' +
                    '<button type="button" class="btn-day-edit" data-shift-id="' + sid + '" title="Изменить">Изменить</button>' +
                    '<button type="button" class="btn-day-delete" data-shift-id="' + sid + '" title="Удалить">Удалить</button>' +
                    '</div>' +
                    '</li>';
            });
            html += '</ul>';
            contentEl.innerHTML = html;
            contentEl.querySelectorAll('.btn-day-edit').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    const id = btn.getAttribute('data-shift-id');
                    if (id) editShiftInDayModal(id);
                });
            });
            contentEl.querySelectorAll('.btn-day-delete').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    const id = btn.getAttribute('data-shift-id');
                    if (id) deleteShiftInDayModal(id);
                });
            });
        }
    } catch (err) {
        console.error(err);
        contentEl.innerHTML = '<p class="day-modal-empty">Не удалось загрузить смены.</p>';
    }
}

function createDayModalShiftRow() {
    const row = document.createElement('div');
    row.className = 'day-add-shift-row';
    const empSelect = document.createElement('select');
    empSelect.className = 'day-add-employee';
    empSelect.innerHTML = '<option value="">Сотрудник</option>';
    employeesList.forEach(emp => {
        const opt = document.createElement('option');
        opt.value = emp.id;
        opt.textContent = emp.name;
        empSelect.appendChild(opt);
    });
    const zoneSelect = document.createElement('select');
    zoneSelect.className = 'day-add-zone';
    zoneSelect.innerHTML = '<option value="">Зона</option>';
    zonesList.forEach(zone => {
        const opt = document.createElement('option');
        opt.value = zone.id;
        opt.textContent = zone.name;
        zoneSelect.appendChild(opt);
    });
    const startInput = document.createElement('input');
    startInput.type = 'time';
    startInput.className = 'day-add-start';
    const endInput = document.createElement('input');
    endInput.type = 'time';
    endInput.className = 'day-add-end';
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn-ios-icon day-add-remove';
    removeBtn.textContent = '✕';
    removeBtn.title = 'Удалить строку';
    removeBtn.onclick = function() {
        const rows = document.getElementById('day-modal-add-form-rows');
        if (rows && rows.children.length > 1) row.remove();
    };
    row.appendChild(empSelect);
    row.appendChild(zoneSelect);
    row.appendChild(startInput);
    row.appendChild(endInput);
    row.appendChild(removeBtn);
    return row;
}

function showDayModalAddForm() {
    const wrap = document.getElementById('day-modal-add-form-wrap');
    const btn = document.getElementById('day-modal-add-shifts-btn');
    const rowsCont = document.getElementById('day-modal-add-form-rows');
    if (!wrap || !rowsCont) return;
    rowsCont.innerHTML = '';
    rowsCont.appendChild(createDayModalShiftRow());
    wrap.style.display = 'block';
    if (btn) btn.style.display = 'none';
}

function hideDayModalAddForm() {
    const wrap = document.getElementById('day-modal-add-form-wrap');
    const btn = document.getElementById('day-modal-add-shifts-btn');
    if (wrap) wrap.style.display = 'none';
    if (btn) btn.style.display = 'block';
}

async function saveDayModalShifts() {
    if (!currentDayModalDate) return;
    const rowsCont = document.getElementById('day-modal-add-form-rows');
    if (!rowsCont) return;
    const rows = rowsCont.querySelectorAll('.day-add-shift-row');
    const toSave = [];
    rows.forEach(row => {
        const emp = row.querySelector('.day-add-employee');
        const zone = row.querySelector('.day-add-zone');
        const start = row.querySelector('.day-add-start');
        const end = row.querySelector('.day-add-end');
        if (emp && zone && start && end && emp.value && zone.value && start.value && end.value) {
            toSave.push({ employee_id: emp.value, zone_id: zone.value, start_time: start.value, end_time: end.value });
        }
    });
    if (toSave.length === 0) {
        safeAlert('Заполните хотя бы одну смену (сотрудник, зона, время начала и конца).');
        return;
    }
    let ok = 0;
    let errMsg = '';
    for (const s of toSave) {
        try {
            const res = await fetch(`${API_BASE}/api/schedule`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ employee_id: s.employee_id, zone_id: s.zone_id, date: currentDayModalDate, start_time: s.start_time, end_time: s.end_time })
            });
            if (res.ok) ok++; else { const e = await res.json(); errMsg = e.error || res.statusText; }
        } catch (e) {
            errMsg = e.message || 'Ошибка сети';
        }
    }
    hideDayModalAddForm();
    if (ok === toSave.length) {
        safeAlert('Добавлено смен: ' + ok);
        openDayModal(currentDayModalDate);
        loadHomePage();
    } else {
        safeAlert(ok ? 'Добавлено ' + ok + ', ошибки: ' + errMsg : 'Ошибка: ' + errMsg);
        openDayModal(currentDayModalDate);
        loadHomePage();
    }
}

function deleteShiftInDayModal(id) {
    if (!currentDayModalDate) return;
    try {
        if (typeof window.confirm === 'function' && !window.confirm('Удалить эту смену?')) return;
    } catch (e) {}
    fetch(`${API_BASE}/api/schedule/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: Number(id) })
    }).then(res => {
        if (res.ok) {
            openDayModal(currentDayModalDate);
            loadHomePage();
        } else {
            res.json().then(e => safeAlert('Ошибка: ' + (e.error || res.statusText))).catch(() => safeAlert('Ошибка удаления'));
        }
    }).catch(() => safeAlert('Ошибка сети'));
}

function editShiftInDayModal(id) {
    const rowWrap = document.querySelector('.day-shift-item[data-id="' + id + '"]');
    if (!rowWrap) return;
    const employeeId = rowWrap.getAttribute('data-employee-id') || '';
    const zoneId = rowWrap.getAttribute('data-zone-id') || '';
    const startTime = rowWrap.getAttribute('data-start') || '';
    const endTime = rowWrap.getAttribute('data-end') || '';
    const editWrap = document.getElementById('day-modal-edit-wrap');
    const empSelect = document.getElementById('day-edit-employee');
    const zoneSelect = document.getElementById('day-edit-zone');
    if (!editWrap || !empSelect || !zoneSelect) return;
    document.getElementById('day-edit-id').value = id;
    empSelect.innerHTML = '<option value="">Сотрудник</option>';
    employeesList.forEach(emp => {
        const opt = document.createElement('option');
        opt.value = emp.id;
        opt.textContent = emp.name;
        if (String(emp.id) === String(employeeId)) opt.selected = true;
        empSelect.appendChild(opt);
    });
    zoneSelect.innerHTML = '<option value="">Зона</option>';
    zonesList.forEach(zone => {
        const opt = document.createElement('option');
        opt.value = zone.id;
        opt.textContent = zone.name;
        if (String(zone.id) === String(zoneId)) opt.selected = true;
        zoneSelect.appendChild(opt);
    });
    document.getElementById('day-edit-start').value = startTime;
    document.getElementById('day-edit-end').value = endTime;
    editWrap.style.display = 'block';
}

function cancelDayModalEdit() {
    const editWrap = document.getElementById('day-modal-edit-wrap');
    if (editWrap) editWrap.style.display = 'none';
}

async function saveDayModalEdit() {
    const idEl = document.getElementById('day-edit-id');
    const id = idEl && idEl.value ? idEl.value : null;
    if (!id || !currentDayModalDate) return;
    const employeeId = document.getElementById('day-edit-employee').value;
    const zoneId = document.getElementById('day-edit-zone').value;
    const startTime = document.getElementById('day-edit-start').value;
    const endTime = document.getElementById('day-edit-end').value;
    if (!employeeId || !zoneId || !startTime || !endTime) {
        safeAlert('Заполните все поля.');
        return;
    }
    try {
        const res = await fetch(`${API_BASE}/api/schedule/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: id,
                employee_id: employeeId,
                zone_id: zoneId,
                date: currentDayModalDate,
                start_time: startTime,
                end_time: endTime
            })
        });
        if (res.ok) {
            cancelDayModalEdit();
            openDayModal(currentDayModalDate);
            loadHomePage();
        } else {
            const e = await res.json();
            safeAlert('Ошибка: ' + (e.error || res.statusText));
        }
    } catch (err) {
        safeAlert('Ошибка сети');
    }
}

function initDayModalAddShifts() {
    const addBtn = document.getElementById('day-modal-add-shifts-btn');
    const addRowBtn = document.getElementById('day-modal-add-row-btn');
    const saveBtn = document.getElementById('day-modal-save-shifts-btn');
    const rowsCont = document.getElementById('day-modal-add-form-rows');
    if (addBtn) addBtn.addEventListener('click', showDayModalAddForm);
    if (addRowBtn) addRowBtn.addEventListener('click', () => { if (rowsCont) rowsCont.appendChild(createDayModalShiftRow()); });
    if (saveBtn) saveBtn.addEventListener('click', saveDayModalShifts);
    const editSaveBtn = document.getElementById('day-edit-save-btn');
    const editCancelBtn = document.getElementById('day-edit-cancel-btn');
    if (editSaveBtn) editSaveBtn.addEventListener('click', saveDayModalEdit);
    if (editCancelBtn) editCancelBtn.addEventListener('click', cancelDayModalEdit);
}

function calendarPrevMonth() {
    if (calendarViewMonth === 0) {
        calendarViewMonth = 11;
        calendarViewYear--;
    } else {
        calendarViewMonth--;
    }
    loadHomePage();
}

function calendarNextMonth() {
    if (calendarViewMonth === 11) {
        calendarViewMonth = 0;
        calendarViewYear++;
    } else {
        calendarViewMonth++;
    }
    loadHomePage();
}

// Загрузка начальных данных
async function loadInitialData() {
    await loadEmployees();
    await Promise.all([loadZones(), loadRecipes()]);
    loadHomePage();
    loadSchedule();
    updateSalaryMonthLabel();
    calculateSalary();
}

// Загрузка сотрудников
async function loadEmployees() {
    try {
        const response = await fetch(`${API_BASE}/api/employees`);
        const data = await response.json();
        employeesList = Array.isArray(data) ? data : [];
        
        const selects = ['employee-select', 'schedule-employee', 'chef-select'];
        selects.forEach(selectId => {
            const select = document.getElementById(selectId);
            if (!select) return;
            const isChef = selectId === 'chef-select';
            select.innerHTML = isChef ? '<option value="">Выберите себя</option>' : '<option value="">Выберите сотрудника</option>';
            employeesList.forEach(emp => {
                const option = document.createElement('option');
                option.value = emp.id;
                option.textContent = isChef ? emp.name : `${emp.name} (${emp.hourly_rate} руб/час)`;
                select.appendChild(option);
            });
        });
        
        if (!currentEmployeeId) {
            const telegramId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
            if (telegramId) {
                const found = employeesList.find(e => String(e.telegram_id) === String(telegramId));
                if (found) currentEmployeeId = found.id;
            }
            if (!currentEmployeeId) {
                try {
                    const saved = localStorage.getItem(STORAGE_CHEF_ID);
                    if (saved) currentEmployeeId = parseInt(saved, 10);
                } catch (e) {}
            }
            const chefSelect = document.getElementById('chef-select');
            if (chefSelect && currentEmployeeId) chefSelect.value = currentEmployeeId;

        const salarySelect = document.getElementById('employee-select');
        if (salarySelect && currentEmployeeId) {
            salarySelect.value = String(currentEmployeeId);
        }
        }
    } catch (error) {
        console.error('Ошибка загрузки сотрудников:', error);
    }
}

// Загрузка зон кухни
async function loadZones() {
    try {
        const response = await fetch(`${API_BASE}/api/zones`);
        const zones = await response.json();
        zonesList = Array.isArray(zones) ? zones : [];
        
        const selects = ['schedule-zone'];
        selects.forEach(selectId => {
            const select = document.getElementById(selectId);
            if (select) {
                select.innerHTML = '<option value="">Выберите зону</option>';
                zones.forEach(zone => {
                    const option = document.createElement('option');
                    option.value = zone.id;
                    option.textContent = zone.name;
                    select.appendChild(option);
                });
            }
        });
    } catch (error) {
        console.error('Ошибка загрузки зон:', error);
    }
}

// Загрузка графика работы (используется при удалении смены из модалки дня и т.д.)
async function loadSchedule() {
    const list = document.getElementById('schedule-list');
    if (!list) return;
    try {
        const zoneId = document.getElementById('zone-filter')?.value || '';
        const startDate = document.getElementById('start-date')?.value || '';
        const endDate = document.getElementById('end-date')?.value || '';
        
        let url = `${API_BASE}/api/schedule?`;
        if (zoneId) url += `zone_id=${zoneId}&`;
        if (startDate) url += `start_date=${startDate}&`;
        if (endDate) url += `end_date=${endDate}&`;
        
        const response = await fetch(url);
        const schedule = await response.json();
        
        if (schedule.length === 0) {
            list.innerHTML = '<p>Нет записей в графике</p>';
            return;
        }
        
        list.innerHTML = schedule.map(item => `
            <div class="schedule-item" data-id="${item.id}">
                <div class="schedule-item-header">
                    <div class="schedule-item-title">${item.employee_name}</div>
                    <div class="schedule-item-right">
                        <span class="schedule-item-zone">${item.zone_name}</span>
                        <button type="button" class="schedule-item-delete" onclick="deleteShift(${item.id})" title="Удалить смену">×</button>
                    </div>
                </div>
                <div class="schedule-item-details">
                    <div>Дата: ${formatDate(item.date)}</div>
                    <div>Время: ${item.start_time} - ${item.end_time}</div>
                    <div>Часов отработано: ${parseFloat(item.hours_worked).toFixed(2)}</div>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Ошибка загрузки графика:', error);
        if (list) list.innerHTML = '<p>Ошибка загрузки данных</p>';
    }
}

async function deleteShift(id) {
    if (!confirm('Удалить эту смену?')) return;
    try {
        const response = await fetch(`${API_BASE}/api/schedule/delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: Number(id) })
        });
        const contentType = response.headers.get('content-type');
        const isJson = contentType && contentType.includes('application/json');
        if (response.ok) {
            loadSchedule();
            loadHomePage();
            safeAlert('Смена удалена');
        } else {
            const err = isJson ? await response.json() : { error: 'Не удалось удалить' };
            safeAlert('Ошибка: ' + (err.error || 'не удалось удалить'));
        }
    } catch (e) {
        safeAlert('Ошибка при удалении смены');
        console.error(e);
    }
}

// Показать форму добавления смены
function showAddScheduleForm() {
    document.getElementById('schedule-form').reset();
    document.getElementById('schedule-modal').style.display = 'block';
    
    // Устанавливаем сегодняшнюю дату по умолчанию
    document.getElementById('schedule-date').valueAsDate = new Date();
}

// Сохранение смены
document.getElementById('schedule-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const data = {
        employee_id: document.getElementById('schedule-employee').value,
        zone_id: document.getElementById('schedule-zone').value,
        date: document.getElementById('schedule-date').value,
        start_time: document.getElementById('schedule-start-time').value,
        end_time: document.getElementById('schedule-end-time').value
    };
    
    try {
        const response = await fetch(`${API_BASE}/api/schedule`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        if (response.ok) {
            closeModal('schedule-modal');
            loadSchedule();
            safeAlert('Смена добавлена успешно!');
        } else {
            const error = await response.json();
            safeAlert('Ошибка: ' + error.error);
        }
    } catch (error) {
        safeAlert('Ошибка при сохранении смены');
        console.error(error);
    }
});

// Расчет зарплаты
async function calculateSalary() {
    const employeeId = document.getElementById('employee-select').value;
    const resultDiv = document.getElementById('salary-result');

    if (!employeeId) {
        if (resultDiv) {
            resultDiv.innerHTML = '<p>Выберите сотрудника, чтобы увидеть зарплату.</p>';
        }
        return;
    }

    const bounds = getMonthBounds(salaryViewYear, salaryViewMonth);
    try {
        const response = await fetch(
            `${API_BASE}/api/salary?employee_id=${employeeId}&start_date=${bounds.start_date}&end_date=${bounds.end_date}`
        );
        const salary = await response.json();
        
        if (!resultDiv) return;
        if (salary.total_hours === 0 || !salary.total_hours) {
            resultDiv.innerHTML = '<p>Нет данных за выбранный месяц.</p>';
            return;
        }
        
        resultDiv.innerHTML = `
            <h3>${salary.name || 'Сотрудник'}</h3>
            <div class="salary-info">
                <span>Часовой оклад:</span>
                <span>${parseFloat(salary.hourly_rate || 0).toFixed(2)} руб/час</span>
            </div>
            <div class="salary-info">
                <span>Отработано часов:</span>
                <span>${parseFloat(salary.total_hours || 0).toFixed(2)}</span>
            </div>
            <div class="salary-info">
                <span>К выплате:</span>
                <span>${parseFloat(salary.total_salary || 0).toFixed(2)} руб</span>
            </div>
        `;
    } catch (error) {
        console.error('Ошибка расчета зарплаты:', error);
        safeAlert('Ошибка при расчете зарплаты');
    }
}

function updateSalaryMonthLabel() {
    const labelEl = document.getElementById('salary-month-label');
    const inputEl = document.getElementById('salary-month-input');
    const months = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
    if (labelEl) {
        labelEl.textContent = `${months[salaryViewMonth]} ${salaryViewYear}`;
    }
    if (inputEl) {
        inputEl.value = `${salaryViewYear}-${String(salaryViewMonth + 1).padStart(2, '0')}`;
    }
}

function salaryPrevMonth() {
    if (salaryViewMonth === 0) {
        salaryViewMonth = 11;
        salaryViewYear--;
    } else {
        salaryViewMonth--;
    }
    updateSalaryMonthLabel();
    calculateSalary();
}

function salaryNextMonth() {
    if (salaryViewMonth === 11) {
        salaryViewMonth = 0;
        salaryViewYear++;
    } else {
        salaryViewMonth++;
    }
    updateSalaryMonthLabel();
    calculateSalary();
}

function onSalaryMonthInputChange() {
    const inputEl = document.getElementById('salary-month-input');
    if (!inputEl || !inputEl.value) return;
    const [y, m] = inputEl.value.split('-').map(Number);
    if (!y || !m) return;
    salaryViewYear = y;
    salaryViewMonth = m - 1;
    updateSalaryMonthLabel();
    calculateSalary();
}

// Загрузка технологических карт
async function loadRecipes() {
    try {
        const response = await fetch(`${API_BASE}/api/recipes`);
        const recipes = await response.json();
        
        const list = document.getElementById('recipes-list');
        if (recipes.length === 0) {
            list.innerHTML = '<p>Нет технологических карт</p>';
            return;
        }
        
        list.innerHTML = recipes.map(recipe => `
            <div class="recipe-card" onclick="viewRecipe(${recipe.id})">
                ${recipe.photo_url ? 
                    `<img src="${API_BASE}${recipe.photo_url}" alt="${recipe.name}" class="recipe-card-image" />` :
                    `<div class="recipe-card-image" style="display:flex;align-items:center;justify-content:center;color:#999;">Нет фото</div>`
                }
                <div class="recipe-card-name">${recipe.name}</div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Ошибка загрузки рецептов:', error);
        document.getElementById('recipes-list').innerHTML = '<p>Ошибка загрузки данных</p>';
    }
}

// Просмотр рецепта
async function viewRecipe(id) {
    try {
        const response = await fetch(`${API_BASE}/api/recipes/${id}`);
        const recipe = await response.json();
        
        const content = document.getElementById('recipe-view-content');
        content.innerHTML = `
            <h2>${recipe.name}</h2>
            ${recipe.photo_url ? 
                `<img src="${API_BASE}${recipe.photo_url}" alt="${recipe.name}" class="recipe-view-image" />` : ''
            }
            ${recipe.description ? 
                `<div class="recipe-view-section">
                    <h4>Описание</h4>
                    <p>${recipe.description}</p>
                </div>` : ''
            }
            <div class="recipe-view-section">
                <h4>Ингредиенты</h4>
                <p>${recipe.ingredients}</p>
            </div>
            <div class="recipe-view-section">
                <h4>Шаги приготовления</h4>
                <p>${recipe.cooking_steps}</p>
            </div>
            <button class="btn-primary" onclick="editRecipe(${recipe.id})">Редактировать</button>
        `;
        
        document.getElementById('recipe-view-modal').style.display = 'block';
    } catch (error) {
        console.error('Ошибка загрузки рецепта:', error);
        safeAlert('Ошибка загрузки рецепта');
    }
}

// Показать форму добавления/редактирования рецепта
function showAddRecipeForm() {
    document.getElementById('recipe-form').reset();
    document.getElementById('recipe-id').value = '';
    document.getElementById('recipe-modal-title').textContent = 'Добавить технологическую карту';
    document.getElementById('recipe-delete-btn').style.display = 'none';
    document.getElementById('recipe-photo-preview').innerHTML = '';
    document.getElementById('recipe-modal').style.display = 'block';
}

// Редактирование рецепта
async function editRecipe(id) {
    try {
        const response = await fetch(`${API_BASE}/api/recipes/${id}`);
        const recipe = await response.json();
        
        document.getElementById('recipe-id').value = recipe.id;
        document.getElementById('recipe-name').value = recipe.name;
        document.getElementById('recipe-description').value = recipe.description || '';
        document.getElementById('recipe-ingredients').value = recipe.ingredients;
        document.getElementById('recipe-steps').value = recipe.cooking_steps;
        document.getElementById('recipe-modal-title').textContent = 'Редактировать технологическую карту';
        document.getElementById('recipe-delete-btn').style.display = 'block';
        
        if (recipe.photo_url) {
            document.getElementById('recipe-photo-preview').innerHTML = 
                `<img src="${API_BASE}${recipe.photo_url}" alt="Текущее фото" />`;
        }
        
        closeModal('recipe-view-modal');
        document.getElementById('recipe-modal').style.display = 'block';
    } catch (error) {
        console.error('Ошибка загрузки рецепта:', error);
        safeAlert('Ошибка загрузки рецепта');
    }
}

// Превью фото
document.getElementById('recipe-photo').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
            document.getElementById('recipe-photo-preview').innerHTML = 
                `<img src="${event.target.result}" alt="Превью" />`;
        };
        reader.readAsDataURL(file);
    }
});

// Сохранение рецепта
document.getElementById('recipe-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const formData = new FormData();
    const recipeId = document.getElementById('recipe-id').value;
    
    formData.append('name', document.getElementById('recipe-name').value);
    formData.append('description', document.getElementById('recipe-description').value);
    formData.append('ingredients', document.getElementById('recipe-ingredients').value);
    formData.append('cooking_steps', document.getElementById('recipe-steps').value);
    
    const photoFile = document.getElementById('recipe-photo').files[0];
    if (photoFile) {
        formData.append('photo', photoFile);
    }
    
    try {
        const url = recipeId ? 
            `${API_BASE}/api/recipes/${recipeId}` : 
            `${API_BASE}/api/recipes`;
        const method = recipeId ? 'PUT' : 'POST';
        
        const response = await fetch(url, {
            method: method,
            body: formData
        });
        
        if (response.ok) {
            closeModal('recipe-modal');
            loadRecipes();
            safeAlert('Технологическая карта сохранена!');
        } else {
            const error = await response.json();
            safeAlert('Ошибка: ' + error.error);
        }
    } catch (error) {
        safeAlert('Ошибка при сохранении');
        console.error(error);
    }
});

// Удаление рецепта
async function deleteRecipe() {
    const recipeId = document.getElementById('recipe-id').value;
    if (!recipeId) return;
    
    if (!confirm('Вы уверены, что хотите удалить эту технологическую карту?')) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/api/recipes/${recipeId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            closeModal('recipe-modal');
            loadRecipes();
            safeAlert('Технологическая карта удалена');
        } else {
            const error = await response.json();
            safeAlert('Ошибка: ' + error.error);
        }
    } catch (error) {
        safeAlert('Ошибка при удалении');
        console.error(error);
    }
}

// Закрытие модального окна
function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

// Закрытие по клику вне модального окна
window.onclick = (event) => {
    if (event.target.classList.contains('modal')) {
        event.target.style.display = 'none';
    }
}

// Форматирование даты
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('ru-RU');
}
