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
        encounterReasonColors = new Map(reasons.map(reason => [reason.id, {color: reason.event_color, title: reason.title}]));
        return encounterReasonColors;
    } catch (error) {
        console.error('Could not load encounter reason colors:', error);
        encounterReasonColors = new Map();
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
            const colorsPromise = getEncounterReasonColors();
            const apiDataPromise = fetchCalendarData(startDate, endDate);
            const [colors, apiData] = await Promise.all([colorsPromise, apiDataPromise]);
            const transformedData = transformCalendarData(apiData, colors);
            
            customView.innerHTML = generateCalendarHtml(transformedData, startDate, endDate);
            
            customView.querySelector('#close-custom-calendar').onclick = () => {
                customView.remove();
                originalCalendarView.style.display = 'block';
            };

            customView.querySelector('.custom-calendar-grid').addEventListener('click', (e) => {
                const card = e.target.closest('.calendar-slot-card[data-status="occupied"]');
                const slotData = card?.dataset.slotData;
                if (slotData) {
                    showCustomVisitModal(JSON.parse(slotData)); // РОЗКОМЕНТОВАНО
                }
            });

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
        return emptyDays.has(dateStr) ? 'minmax(20px, 0.5fr)' : 'minmax(55px, 1fr)';
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
            const slots = employee.schedule[dateStr] || [];
            let cellContent = '';
            if (slots && slots.length > 0) {
                cellContent = slots.map(slot => {
                    const tooltip = `${slot.start}-${slot.end} - ${slot.patient}`;
                    const slotData = JSON.stringify(slot);
                    return `<div class="calendar-slot-card" data-status="${slot.status}" title="${tooltip}" data-slot-data='${slotData}' style="border-left-color: ${slot.color};">
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
            .calendar-slot-card[data-status="occupied"] { background-color: #b1dcfc; cursor: pointer; }
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

async function showCustomVisitModal(slotData) {
    // 1. Створюємо оверлей
    const overlay = document.createElement('div');
    overlay.className = 'irp-overlay-bg h24-modal-overlay';
    overlay.innerHTML = `
        <div class="h24-modal-container">
            <div class="h24-loader-wrapper">
                <img src="https://mis.h24.ua/new/assets/images/loader.svg" style="width: 60px; height: 60px;">
            </div>
        </div>`;
    document.body.appendChild(overlay);

    // Закриття при кліку на фон
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

    try {
        // Завантажуємо детальні дані пацієнта
        let patientData = {};
        if (slotData.patientId) {
            const patientResponse = await fetch(`https://ehr.h24.ua/api/patients/${slotData.patientId}`, { credentials: 'include' });
            if (patientResponse.ok) {
                patientData = await patientResponse.json();
            }
        }

        const phone = patientData.person?.phones?.[0]?.number || slotData.phone || 'Не вказано';
        const dateFormatted = slotData.date ? slotData.date.split('-').reverse().join('.') : new Date().toLocaleDateString('uk-UA');

        // 2. Шаблон модального вікна в стилі Health24
        const modalHtml = `
            <div class="h24-modal-dialog">
                <!-- Header -->
                <div class="h24-modal-header">
                    <button id="close-modal-btn" class="h24-btn-close">✕</button>
                </div>

                <!-- Body -->
                <div class="h24-modal-body">
                    <!-- Співробітник -->
                    <div class="h24-form-group">
                        <label class="h24-label">Співробітник події <span class="required">*</span></label>
                        <div class="h24-input-wrapper">
                            <input type="text" class="h24-input" value="${slotData.employeeName || 'Коваль Любов Георгіївна'}" readonly>
                            <span class="h24-icon-link">🔗</span>
                        </div>
                    </div>

                    <!-- Дата та час прийому -->
                    <div class="h24-form-row">
                        <div class="h24-form-group flex-1">
                            <label class="h24-label">Дата та час прийому <span class="required">*</span></label>
                            <input type="text" class="h24-input" value="${dateFormatted}" readonly>
                        </div>
                        <div class="h24-form-group flex-1">
                            <label class="h24-label">&nbsp;</label>
                            <input type="text" class="h24-input" value="${slotData.start} - ${slotData.end}" readonly>
                        </div>
                    </div>

                    <!-- Тривалість візиту -->
                    <div class="h24-form-group">
                        <label class="h24-label">Тривалість візиту <span class="required">*</span></label>
                        <div class="h24-time-row">
                            <div class="h24-time-field">
                                <span class="sub-label">час початку</span>
                                <input type="text" class="h24-input center" value="${slotData.start.replace(':', ' ')}" readonly>
                            </div>
                            <div class="h24-time-field">
                                <span class="sub-label">тривалість (хв)</span>
                                <input type="text" class="h24-input center" value="30" readonly>
                            </div>
                            <div class="h24-time-field">
                                <span class="sub-label">час завершення</span>
                                <input type="text" class="h24-input center" value="${slotData.end.replace(':', ' ')}" readonly>
                            </div>
                        </div>
                    </div>

                    <!-- Направлення -->
                    <div class="h24-form-group">
                        <label class="h24-label">Направлення</label>
                        <input type="text" class="h24-input" placeholder="№ направлення" readonly>
                        <div class="h24-checkbox-wrapper">
                            <input type="checkbox" id="active-ref" checked disabled>
                            <label for="active-ref">Тільки активні направлення</label>
                        </div>
                    </div>

                    <!-- Пацієнт -->
                    <div class="h24-form-group">
                        <label class="h24-label">Пацієнт <span class="required">*</span></label>
                        <div class="h24-input-wrapper">
                            <input type="text" class="h24-input" value="${slotData.patient}" readonly>
                            <span class="h24-icon-link">🔗</span>
                        </div>
                    </div>

                    <!-- Телефон та статус -->
                    <div class="h24-form-row">
                        <div class="h24-form-group flex-1">
                            <input type="text" class="h24-input" value="мобільний" readonly>
                        </div>
                        <div class="h24-form-group flex-2">
                            <input type="text" class="h24-input" value="${phone}" readonly>
                        </div>
                    </div>

                    <!-- Тип прийому (Причина) -->
                    <div class="h24-form-group">
                        <label class="h24-label">Тип прийому <span class="required">*</span></label>
                        <input type="text" class="h24-input" value="${slotData.reasonTitle || 'Завершення епізоду'}" readonly>
                    </div>

                    <!-- Коментар -->
                    <div class="h24-form-group">
                        <label class="h24-label">Коментар</label>
                        <input type="text" class="h24-input" value="${slotData.comment || ''}" placeholder="Введіть коментар" readonly>
                    </div>
                </div>
            </div>

            <!-- CSS Стилі для модального вікна -->
            <style>
                .h24-modal-overlay {
                    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                    background: rgba(0, 0, 0, 0.4);
                    display: flex; justify-content: center; align-items: center;
                    z-index: 9999; font-family: 'Open Sans', Roboto, sans-serif;
                }
                .h24-modal-dialog {
                    background: #fff; border-radius: 4px; width: 580px; max-width: 90vw;
                    max-height: 90vh; overflow-y: auto; box-shadow: 0 5px 15px rgba(0,0,0,0.3);
                    padding: 20px 25px; box-sizing: border-box; color: #333;
                }
                .h24-modal-header { display: flex; justify-content: flex-end; margin-bottom: 5px; }
                .h24-btn-close { border: none; background: transparent; font-size: 20px; cursor: pointer; color: #777; }
                .h24-form-group { margin-bottom: 14px; }
                .h24-form-row { display: flex; gap: 15px; margin-bottom: 14px; }
                .flex-1 { flex: 1; }
                .flex-2 { flex: 2; }
                .h24-label { display: block; font-size: 13px; font-weight: 600; color: #555; margin-bottom: 4px; }
                .h24-label .required { color: #e53935; }
                .sub-label { display: block; font-size: 11px; color: #888; margin-bottom: 2px; }
                .h24-input {
                    width: 100%; height: 36px; padding: 6px 10px; border: 1px solid #ccc;
                    border-radius: 3px; font-size: 13px; color: #333; background-color: #fcfcfc;
                    box-sizing: border-box;
                }
                .h24-input.center { text-align: center; }
                .h24-input-wrapper { position: relative; }
                .h24-icon-link { position: absolute; right: 10px; top: 8px; cursor: pointer; opacity: 0.6; }
                .h24-time-row { display: flex; gap: 10px; align-items: center; }
                .h24-time-field { flex: 1; }
                .h24-checkbox-wrapper { display: flex; align-items: center; gap: 6px; margin-top: 6px; font-size: 12px; color: #555; }
                .h24-loader-wrapper { background: #fff; padding: 30px; border-radius: 8px; }
            </style>
        `;

        overlay.innerHTML = modalHtml;
        overlay.querySelector('#close-modal-btn').onclick = () => overlay.remove();

    } catch (error) {
        console.error('Error showing custom visit modal:', error);
        overlay.innerHTML = `
            <div style="background:#fff; padding: 20px; border-radius:4px;">
                <p style="color:red; margin:0;">❌ Не вдалося завантажити деталі візиту.</p>
            </div>`;
    }
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
            // Зберігаємо повне ім'я лікаря, щоб не генерувати його знову
            const employeeFullName = `${employee.last_name || ''} ${employee.first_name || ''} ${employee.second_name || ''}`.trim();
            if (!dataByEmployee[employee.id]) {
                dataByEmployee[employee.id] = { name: employeeFullName, position: employee.position, schedule: {} };
            }
            const dateStr = day.date.split('.').reverse().join('-');
            
            dataByEmployee[employee.id].schedule[dateStr] = employee.slots.map(slot => {
                const startMatch = slot.visit_period_start?.match(/T(\d{2}:\d{2})/);
                const endMatch = slot.visit_period_end?.match(/T(\d{2}:\d{2})/);
                const baseSlot = {
                    start: startMatch ? startMatch[1] : '??:??',
                    end: endMatch ? endMatch[1] : '??:??',
                    employeeName: employeeFullName, // Передаємо повне ім'я лікаря
                    date: dateStr // Додаємо дату, щоб модалка могла її відобразити
                };

                if (slot.visits && slot.visits.length > 0) {
                    const visit = slot.visits[0];
                    let patientName = 'Запис';
                    if (visit.patient) {
                        patientName = `${visit.patient.last_name || ''} ${visit.patient.first_name || ''} ${visit.patient.second_name || ''}`.trim();
                    }
                    const reason = colors.get(visit.encounter_reason_id);
                    return {
                        ...baseSlot,
                        patient: patientName,
                        status: 'occupied',
                        color: reason ? reason.color : '#84badf',
                        reasonTitle: reason ? reason.title : 'Не вказано',
                        visitId: visit.visit_id,
                        patientId: visit.patient?.id,
                        employeeId: employee.id,
                    };
                } else {
                    return { ...baseSlot, patient: 'Вільно', status: 'free', color: '#e0a39a' };
                }
            });
        });
    });
    return dataByEmployee;
}