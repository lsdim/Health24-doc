// CONTEXT: This file is for the new Calendar view functionality.

// --- CACHE for Encounter Reasons ---
let encounterReasonColors = null;

// --- UTILITY FUNCTIONS ---
function formatDateToYMD(date) {
    const pad = (num) => num.toString().padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

async function getEncounterReasonColors() {
    if (encounterReasonColors) {
        return encounterReasonColors;
    }
    try {
        const response = await fetch('https://ehr.h24.ua/api/v2/classifications/encounter_reasons', {
            headers: { 'Accept': 'application/json' },
            credentials: 'include'
        });
        if (!response.ok) throw new Error('Failed to fetch encounter reasons');
        const reasons = await response.json();
        encounterReasonColors = new Map(reasons.map(reason => [reason.id, reason.event_color]));
        return encounterReasonColors;
    } catch (error) {
        console.error('Could not load encounter reason colors:', error);
        encounterReasonColors = new Map(); // Порожня мапа у разі помилки
        return encounterReasonColors;
    }
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

    setTimeout(async () => {
        try {
            // Завантажуємо кольори паралельно з основним запитом
            const colorsPromise = getEncounterReasonColors();
            const apiDataPromise = fetchCalendarData(startDate, endDate);

            const [colors, apiData] = await Promise.all([colorsPromise, apiDataPromise]);

            const transformedData = transformCalendarData(apiData, colors);
            
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
    }, 50);
}

function generateCalendarHtml(data, startDate, endDate) {
    const dates = [];
    const emptyDays = new Set();
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        const date = new Date(d);
        dates.push(date);
        const dateStr = formatDateToYMD(date);
        const hasSlots = Object.values(data).some(emp => emp.schedule[dateStr] && emp.schedule[dateStr].length > 0);
        if (!hasSlots) {
            emptyDays.add(dateStr);
        }
    }

    const gridCols = dates.map(d => {
        const dateStr = formatDateToYMD(d);
        return emptyDays.has(dateStr) ? 'minmax(20px, 0.5fr)' : 'minmax(25px, 1fr)';
    }).join(' ');

    let headerHtml = '<div class="doctor-name-cell">Лікар</div>';
    headerHtml += dates.map(d => {
        const day = d.getDate();
        const weekday = d.toLocaleDateString('uk-UA', { weekday: 'short' });
        const isEmpty = emptyDays.has(formatDateToYMD(d));
        return `<div class="custom-calendar-th ${isEmpty ? 'empty-day' : ''}">${day}<br><small>${weekday}</small></div>`;
    }).join('');

    let bodyHtml = '';
    for (const empId in data) {
        const employee = data[empId];
        bodyHtml += `<div class="doctor-name-cell">${employee.name}<br><small>${employee.position}</small></div>`;
        bodyHtml += dates.map(d => {
            const dateStr = formatDateToYMD(d);
            const slots = employee.schedule[dateStr];
            let cellContent = '';
            if (slots && slots.length > 0) {
                cellContent = slots.map(slot => {
                    const tooltip = `${slot.start}-${slot.end} - ${slot.patient}`;
                    const borderColor = slot.status === 'occupied' ? slot.color : '#e0a39a';
                    return `<div class="calendar-slot-card" data-status="${slot.status}" title="${tooltip}" style="border-left-color: ${borderColor};">
                                <span class="slot-time">${slot.start}</span>
                                <span class="slot-patient">${slot.patient}</span>
                            </div>`;
                }).join('');
            }
            const isEmpty = emptyDays.has(dateStr);
            return `<div class="custom-calendar-td ${isEmpty ? 'empty-day' : ''}">${cellContent}</div>`;
        }).join('');
    }

    return `
        <style>
            .custom-calendar-grid-wrapper { max-height: 80vh; overflow: auto; border: 1px solid #ccc; }
            .custom-calendar-grid { display: grid; grid-template-columns: 120px ${gridCols}; width: 100%; }
            .custom-calendar-th, .doctor-name-cell, .custom-calendar-td { padding: 4px; border-bottom: 1px solid #e0e0e0; border-right: 1px solid #e0e0e0; }
            .custom-calendar-th { position: sticky; top: 0; background: #f5f5f5; text-align: center; font-size: 11px; z-index: 10; }
            .doctor-name-cell { position: sticky; left: 0; background: #f9f9f9; font-weight: bold; font-size: 11px; z-index: 11; text-align: left; }
            .custom-calendar-grid > .doctor-name-cell:first-child { z-index: 12; }
            .empty-day { background-color: #fafafa; }
            .custom-calendar-header { display: flex; justify-content: flex-end; margin-bottom: 10px; }
            .calendar-slot-card { padding: 1px 2px; margin-bottom: 1px; font-size: 10px; border-radius: 2px; display: block; min-height: 25px; border-left: 3px solid; }
            .calendar-slot-card[data-status="occupied"] { background-color: #b1dcfc; }
            .calendar-slot-card[data-status="free"] { background-color: #febdb4; }
            .slot-time, .slot-patient { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.2; }
            .slot-time { font-weight: bold; }
        </style>
        <div class="custom-calendar-header">
            <button id="close-custom-calendar" class="irp-helper-btn __secondary">✖ Закрити огляд</button>
        </div>
        <div class="custom-calendar-grid-wrapper">
            <div class="custom-calendar-grid">
                ${headerHtml}
                ${bodyHtml}
            </div>
        </div>
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

function transformCalendarData(apiResponse, colors) {
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
            const dateStr = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`;
            
            const slots = employee.slots.map(slot => {
                const startMatch = slot.visit_period_start?.match(/T(\d{2}:\d{2})/);
                const endMatch = slot.visit_period_end?.match(/T(\d{2}:\d{2})/);
                
                if (slot.visits && slot.visits.length > 0) {
                    const visit = slot.visits[0];
                    let patientName = 'Запис';
                    if (visit.patient) {
                        patientName = `${visit.patient.last_name || ''} ${visit.patient.first_name || ''} ${visit.patient.second_name || ''}`.trim();
                    }

                    return {
                        start: startMatch ? startMatch[1] : '??:??',
                        end: endMatch ? endMatch[1] : '??:??',
                        patient: patientName,
                        status: 'occupied',
                        color: colors.get(visit.encounter_reason_id) || '#84badf' // Використовуємо колір з мапи або дефолтний
                    };
                } else {
                    return {
                        start: startMatch ? startMatch[1] : '??:??',
                        end: endMatch ? endMatch[1] : '??:??',
                        patient: 'Вільно',
                        status: 'free',
                        color: '#e0a39a' // Дефолтний колір для вільних
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
