// CONTEXT: This file is for the new Calendar view functionality.

const calendarObserver = new MutationObserver(() => {
    addCalendarViewButton();
});
calendarObserver.observe(document.body, { childList: true, subtree: true });

function addCalendarViewButton() {
    const calendarHeader = document.querySelector('.heder-warap');
    if (calendarHeader && !calendarHeader.querySelector('.calendar-view-btn')) {
        const wrapper = document.createElement('div');
        wrapper.className = 'calendar-controls-wrapper';
        wrapper.style.marginLeft = 'auto'; // Щоб кнопки були праворуч

        const monthBtn = document.createElement('button');
        monthBtn.innerText = '🗓️ Місяць';
        monthBtn.className = 'irp-helper-btn calendar-view-btn';
        monthBtn.onclick = () => renderCustomCalendar('month');

        const rangeBtn = document.createElement('button');
        rangeBtn.innerText = '📅 Діапазон';
        rangeBtn.className = 'irp-helper-btn calendar-view-btn __secondary';
        rangeBtn.onclick = () => showDateRangePicker();

        wrapper.appendChild(monthBtn);
        wrapper.appendChild(rangeBtn);
        calendarHeader.appendChild(wrapper);
    }
}

function showDateRangePicker() {
    // Створюємо модальне вікно для вибору діапазону
    const overlay = document.createElement('div');
    overlay.className = 'irp-overlay-bg';
    const panel = document.createElement('div');
    panel.className = 'irp-raw-data-panel';
    
    const today = new Date().toISOString().split('T')[0];

    panel.innerHTML = `
        <div class="irp-raw-data-header"><strong>Оберіть діапазон дат</strong></div>
        <div style="display:flex; gap:15px; align-items:center; margin-bottom: 20px;">
            <input type="date" id="calendar-start" value="${today}">
            <span>-</span>
            <input type="date" id="calendar-end" value="${today}">
        </div>
        <button class="irp-helper-btn" id="calendar-apply">Показати</button>
    `;
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    panel.querySelector('#calendar-apply').onclick = () => {
        const start = panel.querySelector('#calendar-start').value;
        const end = panel.querySelector('#calendar-end').value;
        renderCustomCalendar('range', start, end);
        overlay.remove();
    };
}

async function renderCustomCalendar(mode, start, end) {
    const mainCalendarContainer = document.querySelector('.h24-calendar-container');
    if (!mainCalendarContainer) return;

    let startDate, endDate;
    if (mode === 'month') {
        const now = new Date();
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    } else if (mode === 'range' && start && end) {
        startDate = new Date(start);
        endDate = new Date(end);
    } else {
        return; // Нічого не робити, якщо діапазон не обрано
    }

    try {
        if (typeof showToast === 'function') showToast("⏳ Завантажую розклад...", "info");
        const apiData = await fetchCalendarData(startDate, endDate);
        const transformedData = transformCalendarData(apiData);
        
        // Створюємо новий контейнер для нашого календаря
        let customView = document.getElementById('custom-calendar-view');
        if (!customView) {
            customView = document.createElement('div');
            customView.id = 'custom-calendar-view';
            mainCalendarContainer.parentNode.insertBefore(customView, mainCalendarContainer.nextSibling);
        }

        // Ховаємо стандартний календар
        mainCalendarContainer.style.display = 'none';
        
        // Генеруємо HTML
        customView.innerHTML = generateCalendarHtml(transformedData, startDate, endDate);
        
        if (typeof showToast === 'function') showToast("✅ Розклад за місяць готовий!", "success");

    } catch (e) {
        console.error("Помилка при створенні календаря:", e);
        if (typeof showToast === 'function') showToast("❌ Не вдалося завантажити розклад", "error");
        // Повертаємо стандартний календар у разі помилки
        mainCalendarContainer.style.display = 'block';
    }
}

async function fetchCalendarData(startDate, endDate) {
    const startISO = startDate.toISOString();
    const endISO = endDate.toISOString();
    // URL для запиту
    const url = `https://ehr.h24.ua/api/v2/calendars?period_end=${endISO}&period_start=${startISO}&limit=100&offset=0&display_related=true`;
    
    const response = await fetch(url, {
        headers: { 'Accept': 'application/json' },
        credentials: 'include' // Включаємо cookie для авторизації
    });
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
}

function transformCalendarData(apiResponse) {
    const dataByEmployee = {};

    apiResponse.calendar_items.forEach(day => {
        day.employee_list.forEach(employee => {
            if (!dataByEmployee[employee.id]) {
                dataByEmployee[employee.id] = {
                    name: `${employee.last_name} ${employee.first_name.charAt(0)}.${employee.second_name.charAt(0)}.`,
                    position: employee.position,
                    schedule: {}
                };
            }
            const dateStr = day.date.split('.').reverse().join('-'); // "16.07.2026" -> "2026-07-16"
            
            // Виправлена логіка: проходимо по слотах, і для кожного візиту в слоті беремо час самого слота
            const visits = employee.slots.flatMap(slot => {
                if (!slot.visits || slot.visits.length === 0) {
                    return []; // Якщо у слоті немає візитів, пропускаємо
                }
                // Для кожного візиту повертаємо об'єкт з часом слота та пацієнтом візиту
                return slot.visits.map(visit => {
                    const startMatch = slot.visit_period_start ? slot.visit_period_start.match(/T(\d{2}:\d{2})/) : null;
                    const endMatch = slot.visit_period_end ? slot.visit_period_end.match(/T(\d{2}:\d{2})/) : null;
                    return {
                        start: startMatch ? startMatch[1] : '??:??',
                        end: endMatch ? endMatch[1] : '??:??',
                        patient: visit.patient?.full_name || 'Запис без пацієнта'
                    };
                });
            });
            
            if (visits.length > 0) {
                dataByEmployee[employee.id].schedule[dateStr] = visits;
            }
        });
    });
    return dataByEmployee;
}

function generateCalendarHtml(data, startDate, endDate) {
    let dateHeaders = '';
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        const day = d.getDate();
        const weekday = d.toLocaleDateString('uk-UA', { weekday: 'short' });
        dateHeaders += `<th class="custom-calendar-th">${day}<br><small>${weekday}</small></th>`;
    }

    let bodyRows = '';
    for (const empId in data) {
        const employee = data[empId];
        let cells = '';
        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
            const dateStr = d.toISOString().split('T')[0];
            const visits = employee.schedule[dateStr];
            
            let cellContent = '';
            if (visits && visits.length > 0) {
                cellContent = visits.map(v => 
                    `<div class="appointment-card">
                        <span class="time">${v.start}-${v.end}</span>
                        <span class="patient">${v.patient}</span>
                    </div>`
                ).join('');
            }
            cells += `<td class="custom-calendar-td">${cellContent}</td>`;
        }
        bodyRows += `<tr><td class="doctor-name-cell">${employee.name}<br><small>${employee.position}</small></td>${cells}</tr>`;
    }

    return `
        <style>
            .custom-calendar-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
            .custom-calendar-th, .custom-calendar-td { border: 1px solid #e0e0e0; vertical-align: top; padding: 4px; }
            .custom-calendar-th { text-align: center; font-size: 13px; background: #f5f5f5;}
            .doctor-name-cell { width: 180px; font-weight: bold; background: #f9f9f9; font-size:12px; }
            .appointment-card { background: #e3f2fd; border-left: 3px solid #90caf9; padding: 2px 4px; margin-bottom: 2px; font-size: 11px; border-radius: 2px; display:flex; justify-content:space-between; }
            .appointment-card .time { font-weight:bold; }
            .appointment-card .patient { text-align:right; }
        </style>
        <table class="custom-calendar-table">
            <thead><tr><th class="doctor-name-cell">Лікар</th>${dateHeaders}</tr></thead>
            <tbody>${bodyRows}</tbody>
        </table>
    `;
}
