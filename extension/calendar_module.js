// CONTEXT: This file is for the new Calendar view functionality.

// --- UTILITY FUNCTIONS ---
function formatDateToYMD(date) {
    const pad = (num) => num.toString().padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// --- OBSERVER & BUTTON INJECTION ---
const calendarObserver = new MutationObserver(() => {
    addCalendarViewButton();
});
calendarObserver.observe(document.body, { childList: true, subtree: true });

function addCalendarViewButton() {
    const calendarHeader = document.querySelector('.heder-warap');
    if (calendarHeader && !calendarHeader.querySelector('.calendar-view-btn')) {
        const wrapper = document.createElement('div');
        wrapper.className = 'calendar-controls-wrapper';
        wrapper.style.marginLeft = 'auto';

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

// --- UI & RENDERING ---
function showDateRangePicker() {
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

    overlay.onclick = (e) => { if (e.target === overlay) e.currentTarget.remove(); };
    panel.querySelector('#calendar-apply').onclick = () => {
        const start = panel.querySelector('#calendar-start').value;
        const end = panel.querySelector('#calendar-end').value;
        renderCustomCalendar('range', start, end);
        overlay.remove();
    };
}

async function renderCustomCalendar(mode, start, end) {
    const mainContainer = document.querySelector('.h24-calendar-container');
    const originalCalendarView = mainContainer?.querySelector('.h24-week-view-container, .h24-day-view-container');
    if (!mainContainer || !originalCalendarView) return;

    let startDate, endDate;
    if (mode === 'month') {
        const now = new Date();
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    } else if (mode === 'range' && start && end) {
        startDate = new Date(start);
        endDate = new Date(end);
    } else return;

    let customView = document.getElementById('custom-calendar-view');
    if (!customView) {
        customView = document.createElement('div');
        customView.id = 'custom-calendar-view';
        mainContainer.appendChild(customView);
    }

    originalCalendarView.style.display = 'none';
    customView.innerHTML = `<div style="display:flex; justify-content:center; align-items:center; min-height: 400px;"><img src="https://mis.h24.ua/new/assets/images/loader.svg" style="width: 80px; height: 80px;"></div>`;

    // Затримка, щоб браузер встиг показати лоадер
    setTimeout(async () => {
        try {
            const apiData = await fetchCalendarData(startDate, endDate);
            const transformedData = transformCalendarData(apiData);
            
            customView.innerHTML = generateCalendarHtml(transformedData, startDate, endDate);
            
            customView.querySelector('#close-custom-calendar').onclick = () => {
                customView.remove();
                originalCalendarView.style.display = 'block';
            };

            if (typeof showToast === 'function') showToast("✅ Розклад готовий!", "success");

        } catch (e) {
            console.error("Помилка при створенні календаря:", e);
            if (typeof showToast === 'function') showToast("❌ Не вдалося завантажити розклад", "error");
            customView.remove();
            originalCalendarView.style.display = 'block';
        }
    }, 50); // 50ms достатньо для перемальовки
}

function generateCalendarHtml(data, startDate, endDate) {
    let dateHeaders = '';
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        const day = d.getDate();
        const weekday = d.toLocaleDateString('uk-UA', { weekday: 'short' });
        dateHeaders += `<th class="custom-calendar-th">${day}<br><small>${weekday}</small></th>`;
    }

    let bodyRows = '';
    for (const empId in data) {
        const employee = data[empId];
        let cells = '';
        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
            const dateStr = formatDateToYMD(d); // Уніфікований формат
            const slots = employee.schedule[dateStr];
            
            let cellContent = '';
            if (slots && slots.length > 0) {
                cellContent = slots.map(slot => 
                    `<div class="appointment-card" data-status="${slot.status}">
                        <span class="time">${slot.start}-${slot.end}</span>
                        <span class="patient">${slot.patient}</span>
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
            .custom-calendar-th, .custom-calendar-td { border: 1px solid #e0e0e0; vertical-align: top; padding: 4px; font-size:12px; }
            .custom-calendar-th { text-align: center; font-size: 13px; background: #f5f5f5;}
            .doctor-name-cell { width: 180px; font-weight: bold; background: #f9f9f9; }
            .appointment-card { padding: 2px 4px; margin-bottom: 2px; font-size: 11px; border-radius: 3px; display:flex; justify-content:space-between; }
            .appointment-card[data-status="occupied"] { background: #b1dcfc; border-left: 3px solid #84badf; }
            .appointment-card[data-status="free"] { background: #febdb4; border-left: 3px solid #e0a39a; color: #555; }
            .appointment-card .time { font-weight:bold; }
            .appointment-card .patient { text-align:right; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width: 60%;}
            .custom-calendar-header { display: flex; justify-content: flex-end; margin-bottom: 10px; }
        </style>
        <div class="custom-calendar-header">
            <button id="close-custom-calendar" class="irp-helper-btn __secondary">✖ Закрити огляд</button>
        </div>
        <table class="custom-calendar-table">
            <thead><tr><th class="doctor-name-cell">Лікар</th>${dateHeaders}</tr></thead>
            <tbody>${bodyRows}</tbody>
        </table>
    `;
}

// --- DATA HANDLING ---
async function fetchCalendarData(startDate, endDate) {
    const startStr = formatDateToYMD(startDate);
    const endStr = formatDateToYMD(endDate);
    const url = `https://ehr.h24.ua/api/v2/calendars?period_end=${endStr}&period_start=${startStr}&limit=100&offset=0&display_related=true`;
    
    const response = await fetch(url, {
        headers: { 'Accept': 'application/json' },
        credentials: 'include'
    });
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    return response.json();
}

function transformCalendarData(apiResponse) {
    const dataByEmployee = {};
    if (!apiResponse.calendar_items) return dataByEmployee;

    apiResponse.calendar_items.forEach(day => {
        day.employee_list.forEach(employee => {
            if (!dataByEmployee[employee.id]) {
                dataByEmployee[employee.id] = {
                    name: `${employee.last_name} ${employee.first_name.charAt(0)}.${employee.second_name.charAt(0)}.`,
                    position: employee.position,
                    schedule: {}
                };
            }
            const dateParts = day.date.split('.');
            const dateStr = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`; // Конвертація ДД.ММ.РРРР в РРРР-ММ-ДД
            
            const slots = employee.slots.map(slot => {
                const startMatch = slot.visit_period_start?.match(/T(\d{2}:\d{2})/);
                const endMatch = slot.visit_period_end?.match(/T(\d{2}:\d{2})/);
                
                if (slot.visits && slot.visits.length > 0) {
                    return {
                        start: startMatch ? startMatch[1] : '??:??',
                        end: endMatch ? endMatch[1] : '??:??',
                        patient: slot.visits[0].patient?.full_name || 'Запис',
                        status: 'occupied'
                    };
                } else {
                    return {
                        start: startMatch ? startMatch[1] : '??:??',
                        end: endMatch ? endMatch[1] : '??:??',
                        patient: 'Вільно',
                        status: 'free'
                    };
                }
            });
            
            if (slots.length > 0) {
                dataByEmployee[employee.id].schedule[dateStr] = slots;
            }
        });
    });
    return dataByEmployee;
}
