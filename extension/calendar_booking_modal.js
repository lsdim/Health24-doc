// --- CALENDAR BOOKING MODAL & MULTI-SLOT ASSIGNMENT ---
// Handles rehabilitation course planning, multi-specialist slot view, and patient collision checks.

let cachedEncounterReasonsList = null;
let cachedLegalEntityId = 10437; // fallback default
let cachedSpecialistsFromCalendar = null;
let cachedPositionsList = null;

async function getEncounterReasonsList() {
    if (cachedEncounterReasonsList) return cachedEncounterReasonsList;
    try {
        const response = await fetch('https://ehr.h24.ua/api/v2/classifications/encounter_reasons', {
            headers: { 'Accept': 'application/json' },
            credentials: 'include'
        });
        if (response.ok) {
            cachedEncounterReasonsList = await response.json();
            return cachedEncounterReasonsList;
        }
    } catch (e) {
        console.error('Error loading encounter reasons list:', e);
    }
    return [
        { id: 2, title: 'Первинне звернення' },
        { id: 3, title: 'Повторне звернення' },
        { id: 1, title: 'Завершення епізоду' },
        { id: 310, title: 'Амбулаторна реабілітація' },
        { id: 4, title: 'Інше' }
    ];
}

// Extract Legal Entity ID from current cookies or page if possible
function getLegalEntityId() {
    try {
        const cookies = document.cookie.split(';');
        for (let c of cookies) {
            c = c.trim();
            if (c.startsWith('.AspNet.ApplicationCookie=')) {
                const token = c.substring('.AspNet.ApplicationCookie='.length);
                const payloadBase64 = token.split('.')[1];
                if (payloadBase64) {
                    const normalized = payloadBase64.replace(/-/g, '+').replace(/_/g, '/');
                    const jsonStr = decodeURIComponent(escape(atob(normalized)));
                    const data = JSON.parse(jsonStr);
                    if (data.legal_entity_id) {
                        cachedLegalEntityId = data.legal_entity_id;
                        return data.legal_entity_id;
                    }
                }
            }
        }
    } catch (e) {
        // ignore fallback to cached
    }
    return cachedLegalEntityId;
}

// Filter rehabilitation specialists
function isRehabPosition(positionName) {
    if (!positionName) return false;
    const lower = positionName.toLowerCase();
    return lower.includes('фізичн') || 
           lower.includes('ерго') || 
           lower.includes('реабіліт') || 
           lower.includes('асистент');
}

// Fetch all positions from API (/api/v2/filters/structure/positions)
async function fetchPositionsList() {
    if (cachedPositionsList) return cachedPositionsList;
    try {
        const legalEntityId = getLegalEntityId();
        const resp = await fetch(`https://ehr.h24.ua/api/v2/filters/structure/positions?legal_entity_id=${legalEntityId}`, {
            headers: { 'Accept': 'application/json' },
            credentials: 'include'
        });
        if (resp.ok) {
            const data = await resp.json();
            if (data && data.items) {
                cachedPositionsList = data.items;
                return cachedPositionsList;
            }
        }
    } catch (e) {
        console.warn('Could not fetch positions list:', e);
    }
    return [];
}

// Fetch all available specialists from Calendar API (/api/v2/calendars)
async function fetchSpecialistsList(startDateStr, endDateStr) {
    const specialistsMap = new Map();

    const start = startDateStr || formatDateToYMD(new Date());
    const end = endDateStr || start;

    try {
        // Query calendar endpoint with display_related=true to get all specialists in calendar
        const url = `https://ehr.h24.ua/api/v2/calendars?period_end=${end}&period_start=${start}&limit=100&offset=0&display_related=true`;
        const resp = await fetch(url, {
            headers: { 'Accept': 'application/json' },
            credentials: 'include'
        });
        if (resp.ok) {
            const data = await resp.json();
            if (data && data.calendar_items) {
                data.calendar_items.forEach(day => {
                    if (day.employee_list) {
                        day.employee_list.forEach(emp => {
                            if (!specialistsMap.has(emp.id)) {
                                const fullName = `${emp.last_name || ''} ${emp.first_name || ''} ${emp.second_name || ''}`.trim() || emp.name;
                                const positionTitle = typeof emp.position === 'string' ? emp.position : (emp.position?.name || 'Спеціаліст');
                                specialistsMap.set(emp.id, {
                                    id: emp.id,
                                    name: fullName,
                                    position: positionTitle,
                                    isRehab: isRehabPosition(positionTitle)
                                });
                            }
                        });
                    }
                });
            }
        }
    } catch (e) {
        console.warn('Could not fetch employees via calendars API, fallback to structure:', e);
    }

    // Fallback or addition: if structure employees API has more
    try {
        const resp = await fetch('https://ehr.h24.ua/api/v2/filters/structure/employees?display_related=true', {
            headers: { 'Accept': 'application/json' },
            credentials: 'include'
        });
        if (resp.ok) {
            const data = await resp.json();
            if (data && data.items) {
                data.items.forEach(emp => {
                    if (!specialistsMap.has(emp.id)) {
                        const fullName = `${emp.last_name || ''} ${emp.first_name || ''} ${emp.second_name || ''}`.trim() || emp.name;
                        const positionTitle = emp.position?.name || 'Спеціаліст';
                        specialistsMap.set(emp.id, {
                            id: emp.id,
                            name: fullName,
                            position: positionTitle,
                            isRehab: isRehabPosition(positionTitle)
                        });
                    }
                });
            }
        }
    } catch (e) {
        console.warn('Could not fetch employees via structure API:', e);
    }

    const list = Array.from(specialistsMap.values());
    list.sort((a, b) => a.name.localeCompare(b.name, 'uk'));
    return list;
}

// Fetch patient existing visits for the period to check conflicts
async function fetchPatientExistingVisits(patientId, startDateStr, endDateStr) {
    const existingVisits = [];
    try {
        const url = `https://ehr.h24.ua/api/v2/calendars?period_end=${endDateStr}&period_start=${startDateStr}&limit=100&offset=0&display_related=true`;
        const resp = await fetch(url, {
            headers: { 'Accept': 'application/json' },
            credentials: 'include'
        });
        if (resp.ok) {
            const data = await resp.json();
            if (data && data.calendar_items) {
                data.calendar_items.forEach(day => {
                    const dateStr = day.date.split('.').reverse().join('-');
                    day.employee_list.forEach(emp => {
                        const empName = `${emp.last_name || ''} ${emp.first_name || ''}`.trim();
                        emp.slots.forEach(slot => {
                            if (slot.visits && slot.visits.length > 0) {
                                slot.visits.forEach(v => {
                                    if (v.patient && v.patient.id === patientId) {
                                        const startMatch = slot.visit_period_start?.match(/T(\d{2}:\d{2})/);
                                        const endMatch = slot.visit_period_end?.match(/T(\d{2}:\d{2})/);
                                        existingVisits.push({
                                            date: dateStr,
                                            timeStart: startMatch ? startMatch[1] : '',
                                            timeEnd: endMatch ? endMatch[1] : '',
                                            periodStart: slot.visit_period_start,
                                            employeeId: emp.id,
                                            employeeName: empName
                                        });
                                    }
                                });
                            }
                        });
                    });
                });
            }
        }
    } catch (e) {
        console.warn('Could not check existing visits for patient:', e);
    }
    return existingVisits;
}

// Fetch slots for an employee across period
async function fetchEmployeeSlotsForRange(employeeId, startDateStr, endDateStr) {
    try {
        const url = `https://ehr.h24.ua/api/v2/schedule/items/${employeeId}/employee_slots?period_start=${startDateStr}&period_end=${endDateStr}`;
        const resp = await fetch(url, {
            headers: { 'Accept': 'application/json' },
            credentials: 'include'
        });
        if (resp.ok) {
            return await resp.json();
        }
    } catch (e) {
        console.error(`Failed to fetch slots for employee ${employeeId}:`, e);
    }
    return {};
}

// Main Modal Class
class AppointmentBookingModal {
    constructor() {
        this.selectedPatient = null;
        this.selectedEmployees = new Map(); // id -> { id, name, position }
        this.allEmployees = [];
        this.positionsList = [];
        this.encounterReasons = [];
        this.patientExistingVisits = []; // visits already in DB for this patient
        this.selectedSlots = new Map(); // key `${date}_${time}` -> { employeeId, employeeName, date, time, periodStart, duration }
        this.fetchedSlotsByEmp = new Map(); // employeeId -> { [date]: [slots] }
        this.isLoadingSlots = false;
        
        // Filter state
        this.selectedPositionFilter = 'all'; // 'all', 'rehab', or specific position name
        this.specialistSearchQuery = '';

        // Date range (default: today to today + 13 days = 2 weeks course)
        const today = new Date();
        const twoWeeks = new Date();
        twoWeeks.setDate(today.getDate() + 13);
        this.startDateStr = formatDateToYMD(today);
        this.endDateStr = formatDateToYMD(twoWeeks);
    }

    async init() {
        const [reasons, employees, positions] = await Promise.all([
            getEncounterReasonsList(),
            fetchSpecialistsList(this.startDateStr, this.endDateStr),
            fetchPositionsList()
        ]);
        this.encounterReasons = reasons;
        this.allEmployees = employees;
        this.positionsList = positions;
        this.renderModal();
    }

    renderModal() {
        // Remove existing modal if any
        const existing = document.getElementById('h24-booking-overlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'h24-booking-overlay';
        overlay.className = 'irp-overlay-bg h24-booking-overlay';

        const defaultReasonId = 3; // Повторне звернення by default or 2

        // Build unique position titles from employees + positions list
        const uniquePositionNames = new Set();
        this.allEmployees.forEach(e => {
            if (e.position) uniquePositionNames.add(e.position);
        });
        this.positionsList.forEach(p => {
            if (p.name) uniquePositionNames.add(p.name);
        });
        const sortedPositions = Array.from(uniquePositionNames).sort((a, b) => a.localeCompare(b, 'uk'));

        overlay.innerHTML = `
            <div class="h24-booking-dialog">
                <div class="h24-booking-header">
                    <div class="h24-booking-title">
                        <span class="h24-booking-title-icon">📅</span>
                        <div>
                            <div class="h24-booking-title-text">Запис пацієнта на курс реабілітації</div>
                            <div class="h24-booking-subtitle">Формування графіку, вибір фахівців з календаря та запобігання накладкам у часі</div>
                        </div>
                    </div>
                    <button type="button" class="h24-btn-close" id="close-booking-modal-btn">✕</button>
                </div>

                <div class="h24-booking-body">
                    <!-- SECTION 1: ПАЦІЄНТ ТА ПАРАМЕТРИ ПРИЙОМУ -->
                    <div class="h24-booking-card">
                        <div class="h24-booking-card-title">1. Пацієнт та тип прийому</div>
                        <div class="h24-form-row">
                            <div class="h24-form-group flex-2" style="position: relative;">
                                <label class="h24-label">Пошук пацієнта (ПІБ) <span class="required">*</span></label>
                                <div class="h24-input-wrapper">
                                    <input type="text" id="patient-search-input" class="h24-input" placeholder="Введіть мінімум 3 літери ПІБ пацієнта..." autocomplete="off">
                                    <span class="h24-input-icon">🔍</span>
                                </div>
                                <div id="patient-dropdown" class="h24-dropdown-list" style="display: none;"></div>
                                <div id="patient-selected-badge" class="h24-selected-badge" style="display: none;"></div>
                            </div>

                            <div class="h24-form-group flex-1">
                                <label class="h24-label">Тип прийому <span class="required">*</span></label>
                                <select id="encounter-reason-select" class="h24-input h24-select">
                                    ${this.encounterReasons.map(r => `<option value="${r.id}" ${r.id === defaultReasonId ? 'selected' : ''}>${r.title}</option>`).join('')}
                                </select>
                            </div>

                            <div class="h24-form-group flex-1">
                                <label class="h24-label">Коментар до записів</label>
                                <input type="text" id="booking-comment-input" class="h24-input" placeholder="Опціонально (напр. зал ЛФК)">
                            </div>
                        </div>
                    </div>

                    <!-- SECTION 2: ПЕРІОД КУРСУ ТА СПЕЦІАЛІСТИ -->
                    <div class="h24-booking-card">
                        <div class="h24-booking-card-title">2. Період курсу та спеціалісти з календаря</div>
                        <div class="h24-form-row align-center">
                            <div class="h24-form-group">
                                <label class="h24-label">Початок курсу <span class="required">*</span></label>
                                <input type="date" id="course-start-date" class="h24-input date-input" value="${this.startDateStr}">
                            </div>
                            <div class="h24-form-group">
                                <label class="h24-label">Кінець курсу <span class="required">*</span></label>
                                <input type="date" id="course-end-date" class="h24-input date-input" value="${this.endDateStr}">
                            </div>
                            <div class="h24-form-group flex-1" style="margin-top: 18px;">
                                <button type="button" id="refresh-slots-btn" class="irp-helper-btn" style="height: 36px; padding: 0 16px;">
                                    🔄 Завантажити вільні слоти
                                </button>
                            </div>
                        </div>

                        <!-- Фільтри спеціалістів -->
                        <div class="h24-specialists-filter-bar" style="margin-top: 12px; display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
                            <div style="display: flex; align-items: center; gap: 6px;">
                                <label class="h24-label" style="margin-bottom: 0; white-space: nowrap;">Фільтр посади:</label>
                                <select id="position-filter-select" class="h24-input h24-select" style="height: 30px; padding: 2px 8px; font-size: 12px; width: 220px;">
                                    <option value="all">Усі посади (${this.allEmployees.length})</option>
                                    <option value="rehab" selected>🏥 Тільки реабілітація (ФТ, Ерго, асистенти)</option>
                                    <optgroup label="Всі доступні посади">
                                        ${sortedPositions.map(pos => `<option value="${pos}">${pos}</option>`).join('')}
                                    </optgroup>
                                </select>
                            </div>

                            <div style="display: flex; align-items: center; gap: 6px; flex: 1; min-width: 200px;">
                                <input type="text" id="specialist-search-input" class="h24-input" placeholder="🔍 Швидкий пошук лікаря за ПІБ..." style="height: 30px; font-size: 12px; padding: 4px 8px;">
                            </div>

                            <div id="specialists-count-badge" style="font-size: 11px; color: #475569; font-weight: 500;"></div>
                        </div>

                        <div style="margin-top: 8px;">
                            <div id="specialists-chip-container" class="h24-specialists-chip-container"></div>
                        </div>
                    </div>

                    <!-- SECTION 3: ВІЗУАЛЬНИЙ РОЗКЛАД СЛОТІВ ТА ПЕРЕВІРКА НАКЛАДОК -->
                    <div class="h24-booking-card" style="flex: 1; display: flex; flex-direction: column;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                            <div class="h24-booking-card-title" style="margin-bottom: 0;">
                                3. Доступні слоти спеціалістів та вибір часу
                            </div>
                            <div class="h24-legend">
                                <span class="legend-item"><span class="legend-box available"></span> Вільний слот</span>
                                <span class="legend-item"><span class="legend-box selected"></span> Обрано для запису</span>
                                <span class="legend-item"><span class="legend-box conflict"></span> Зайнято пацієнтом (накладка)</span>
                                <span class="legend-item"><span class="legend-box busy"></span> Зайнято іншим</span>
                            </div>
                        </div>

                        <div id="slots-schedule-container" class="h24-slots-schedule-container">
                            <div class="h24-slots-placeholder">
                                Оберіть пацієнта, спеціалістів та натисніть «Завантажити вільні слоти» для формування розкладу.
                            </div>
                        </div>
                    </div>
                </div>

                <!-- FOOTER -->
                <div class="h24-booking-footer">
                    <div class="h24-selected-summary" id="booking-selected-summary">
                        Обрано слотів: <b>0</b>
                    </div>
                    <div class="h24-footer-actions">
                        <button type="button" class="irp-helper-btn __secondary" id="cancel-booking-btn">Скасувати</button>
                        <button type="button" class="irp-helper-btn" id="confirm-booking-btn" disabled style="min-width: 170px;">
                            ✍️ Створити записи
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
        this.setupEvents(overlay);
        this.renderSpecialistChips();
    }

    setupEvents(overlay) {
        overlay.querySelector('#close-booking-modal-btn').onclick = () => overlay.remove();
        overlay.querySelector('#cancel-booking-btn').onclick = () => overlay.remove();

        // Close on background click
        overlay.onclick = (e) => {
            if (e.target === overlay) overlay.remove();
        };

        // Patient search debounce
        const searchInput = overlay.querySelector('#patient-search-input');
        const dropdown = overlay.querySelector('#patient-dropdown');
        let searchTimeout = null;

        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.trim();
            if (searchTimeout) clearTimeout(searchTimeout);
            if (query.length < 3) {
                dropdown.style.display = 'none';
                dropdown.innerHTML = '';
                return;
            }

            searchTimeout = setTimeout(async () => {
                dropdown.style.display = 'block';
                dropdown.innerHTML = '<div class="h24-dropdown-loading">Пошук пацієнтів...</div>';
                const patients = await this.searchPatientsApi(query);
                this.renderPatientDropdown(patients, dropdown, searchInput);
            }, 300);
        });

        // Date range inputs
        overlay.querySelector('#course-start-date').addEventListener('change', async (e) => {
            this.startDateStr = e.target.value;
            this.clearSlotsGrid();
            // Re-fetch specialists from calendar if range changed
            this.allEmployees = await fetchSpecialistsList(this.startDateStr, this.endDateStr);
            this.renderSpecialistChips();
        });
        overlay.querySelector('#course-end-date').addEventListener('change', async (e) => {
            this.endDateStr = e.target.value;
            this.clearSlotsGrid();
            this.allEmployees = await fetchSpecialistsList(this.startDateStr, this.endDateStr);
            this.renderSpecialistChips();
        });

        // Position filter dropdown
        overlay.querySelector('#position-filter-select').addEventListener('change', (e) => {
            this.selectedPositionFilter = e.target.value;
            this.renderSpecialistChips();
        });

        // Specialist quick search text input
        overlay.querySelector('#specialist-search-input').addEventListener('input', (e) => {
            this.specialistSearchQuery = e.target.value.trim().toLowerCase();
            this.renderSpecialistChips();
        });

        // Refresh / Load slots button
        overlay.querySelector('#refresh-slots-btn').addEventListener('click', () => {
            this.loadAndRenderSlots();
        });

        // Confirm booking button
        overlay.querySelector('#confirm-booking-btn').addEventListener('click', () => {
            this.submitBookings();
        });
    }

    async searchPatientsApi(query) {
        try {
            const legalEntityId = getLegalEntityId();
            const url = `https://ehr.h24.ua/api/v2/patients?in_names=${encodeURIComponent(query)}&legal_entity_id=${legalEntityId}&response_view=calendar_list`;
            const resp = await fetch(url, {
                headers: { 'Accept': 'application/json' },
                credentials: 'include'
            });
            if (resp.ok) {
                const data = await resp.json();
                return data.patients || [];
            }
        } catch (e) {
            console.error('Error querying patients:', e);
        }
        return [];
    }

    renderPatientDropdown(patients, dropdown, searchInput) {
        if (!patients || patients.length === 0) {
            dropdown.innerHTML = '<div class="h24-dropdown-empty">Нічого не знайдено</div>';
            return;
        }

        dropdown.innerHTML = patients.map(p => {
            const fullName = `${p.last_name || ''} ${p.first_name || ''} ${p.second_name || ''}`.trim();
            const birth = p.birth_date ? p.birth_date.split('-').reverse().join('.') : '';
            const phone = p.person?.primary_auth_method?.phone_number || p.person?.phones?.[0]?.number || '';
            const pData = JSON.stringify({ id: p.id, fullName, birth, phone }).replace(/"/g, '&quot;');

            return `
                <div class="h24-dropdown-item" data-patient='${pData}'>
                    <div class="h24-dropdown-name">${fullName}</div>
                    <div class="h24-dropdown-info">
                        ${birth ? `<span>🎂 ${birth} (${p.age || ''} р.)</span>` : ''}
                        ${phone ? `<span>📞 ${phone}</span>` : ''}
                    </div>
                </div>
            `;
        }).join('');

        dropdown.querySelectorAll('.h24-dropdown-item').forEach(item => {
            item.onclick = async () => {
                const data = JSON.parse(item.getAttribute('data-patient'));
                this.selectPatient(data);
                dropdown.style.display = 'none';
                searchInput.value = '';
            };
        });
    }

    async selectPatient(patientData) {
        this.selectedPatient = patientData;
        const badge = document.getElementById('patient-selected-badge');
        const inputWrap = document.getElementById('patient-search-input').parentElement;
        
        inputWrap.style.display = 'none';
        badge.style.display = 'flex';
        badge.innerHTML = `
            <div class="badge-content">
                <span class="badge-icon">👤</span>
                <span class="badge-name"><b>${patientData.fullName}</b></span>
                ${patientData.birth ? `<span class="badge-sub">(${patientData.birth})</span>` : ''}
                ${patientData.phone ? `<span class="badge-sub">📞 ${patientData.phone}</span>` : ''}
            </div>
            <button type="button" class="badge-remove-btn" title="Змінити пацієнта">✕</button>
        `;

        badge.querySelector('.badge-remove-btn').onclick = () => {
            this.selectedPatient = null;
            badge.style.display = 'none';
            inputWrap.style.display = 'block';
            this.selectedSlots.clear();
            this.updateSummary();
            this.patientExistingVisits = [];
            this.clearSlotsGrid();
        };

        // If specialists are already selected, we can load slots and check conflicts
        if (this.selectedEmployees.size > 0) {
            this.loadAndRenderSlots();
        }
    }

    renderSpecialistChips() {
        const container = document.getElementById('specialists-chip-container');
        const countBadge = document.getElementById('specialists-count-badge');
        if (!container) return;

        // Apply position filter
        let filtered = this.allEmployees;
        if (this.selectedPositionFilter === 'rehab') {
            filtered = filtered.filter(e => e.isRehab);
        } else if (this.selectedPositionFilter !== 'all') {
            filtered = filtered.filter(e => e.position === this.selectedPositionFilter);
        }

        // Apply quick text search filter
        if (this.specialistSearchQuery) {
            filtered = filtered.filter(e => 
                e.name.toLowerCase().includes(this.specialistSearchQuery) ||
                (e.position && e.position.toLowerCase().includes(this.specialistSearchQuery))
            );
        }

        if (countBadge) {
            countBadge.innerText = `Знайдено: ${filtered.length} з ${this.allEmployees.length} (Обрано: ${this.selectedEmployees.size})`;
        }

        if (filtered.length === 0) {
            container.innerHTML = `<span style="font-size: 12px; color: #888;">Спеціалістів за вибраним фільтром не знайдено</span>`;
            return;
        }

        container.innerHTML = filtered.map(emp => {
            const isSelected = this.selectedEmployees.has(emp.id);
            return `
                <div class="h24-specialist-chip ${isSelected ? 'active' : ''}" data-emp-id="${emp.id}" title="${emp.position}">
                    <span class="chip-check">${isSelected ? '✓' : '+'}</span>
                    <span class="chip-name">${emp.name}</span>
                    <span class="chip-pos">(${emp.position})</span>
                </div>
            `;
        }).join('');

        container.querySelectorAll('.h24-specialist-chip').forEach(chip => {
            chip.onclick = () => {
                const empId = parseInt(chip.getAttribute('data-emp-id'), 10);
                const empObj = this.allEmployees.find(e => e.id === empId);
                if (this.selectedEmployees.has(empId)) {
                    this.selectedEmployees.delete(empId);
                    // Remove selected slots for this employee
                    for (const [key, slot] of this.selectedSlots.entries()) {
                        if (slot.employeeId === empId) {
                            this.selectedSlots.delete(key);
                        }
                    }
                } else {
                    if (empObj) this.selectedEmployees.set(empId, empObj);
                }
                this.renderSpecialistChips();
                this.updateSummary();
                if (this.selectedEmployees.size > 0) {
                    this.loadAndRenderSlots();
                } else {
                    this.clearSlotsGrid();
                }
            };
        });
    }

    clearSlotsGrid() {
        const container = document.getElementById('slots-schedule-container');
        if (container) {
            container.innerHTML = `
                <div class="h24-slots-placeholder">
                    Натисніть «Завантажити вільні слоти» для оновлення розкладу за обраний період.
                </div>
            `;
        }
        this.selectedSlots.clear();
        this.updateSummary();
    }

    async loadAndRenderSlots() {
        const container = document.getElementById('slots-schedule-container');
        if (!container) return;

        if (this.selectedEmployees.size === 0) {
            container.innerHTML = `<div class="h24-slots-placeholder warning">⚠️ Будь ласка, оберіть хоча б одного спеціаліста вище.</div>`;
            return;
        }

        container.innerHTML = `
            <div class="h24-slots-loading">
                <img src="https://mis.h24.ua/new/assets/images/loader.svg" style="width: 45px; height: 45px;">
                <span>Завантаження вільних слотів та перевірка розкладу пацієнта...</span>
            </div>
        `;

        try {
            // 1. Fetch patient visits in parallel if patient is selected
            let patientVisitsPromise = Promise.resolve([]);
            if (this.selectedPatient) {
                patientVisitsPromise = fetchPatientExistingVisits(this.selectedPatient.id, this.startDateStr, this.endDateStr);
            }

            // 2. Fetch slots for each selected employee
            const empPromises = Array.from(this.selectedEmployees.keys()).map(async empId => {
                const slotsData = await fetchEmployeeSlotsForRange(empId, this.startDateStr, this.endDateStr);
                return { empId, slotsData };
            });

            const [patientVisits, empResults] = await Promise.all([patientVisitsPromise, Promise.all(empPromises)]);
            this.patientExistingVisits = patientVisits;

            this.fetchedSlotsByEmp.clear();
            empResults.forEach(({ empId, slotsData }) => {
                this.fetchedSlotsByEmp.set(empId, slotsData);
            });

            this.renderSlotsGrid();

        } catch (e) {
            console.error('Failed to load slots:', e);
            container.innerHTML = `<div class="h24-slots-placeholder error">❌ Помилка при завантаженні розкладу. Спробуйте ще раз.</div>`;
        }
    }

    renderSlotsGrid() {
        const container = document.getElementById('slots-schedule-container');
        if (!container) return;

        // Generate list of dates between startDate and endDate
        const dates = [];
        const start = new Date(this.startDateStr);
        const end = new Date(this.endDateStr);

        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            dates.push(formatDateToYMD(new Date(d)));
        }

        // Map existing patient visits by `${date}_${timeStart}` -> visit info
        const patientConflictMap = new Map();
        this.patientExistingVisits.forEach(v => {
            patientConflictMap.set(`${v.date}_${v.timeStart}`, v);
        });

        // Build HTML table/grid
        // Header columns: Date & Day | [Specialist 1] | [Specialist 2] ...
        const selectedEmpsList = Array.from(this.selectedEmployees.values());

        let tableHtml = `
            <table class="h24-schedule-matrix">
                <thead>
                    <tr>
                        <th class="matrix-date-th">Дата / День</th>
                        ${selectedEmpsList.map(emp => `
                            <th class="matrix-emp-th">
                                <div class="matrix-emp-name">${emp.name}</div>
                                <div class="matrix-emp-pos">${emp.position}</div>
                            </th>
                        `).join('')}
                    </tr>
                </thead>
                <tbody>
        `;

        dates.forEach(dateStr => {
            const dateObj = new Date(dateStr);
            const dayOfWeek = dateObj.toLocaleDateString('uk-UA', { weekday: 'short' });
            const dayFormatted = dateObj.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' });
            const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;

            tableHtml += `
                <tr class="${isWeekend ? 'matrix-weekend-row' : ''}">
                    <td class="matrix-date-td">
                        <b>${dayFormatted}</b> <small>(${dayOfWeek})</small>
                    </td>
            `;

            selectedEmpsList.forEach(emp => {
                const empSchedule = this.fetchedSlotsByEmp.get(emp.id) || {};
                const daySlots = empSchedule[dateStr] || [];

                tableHtml += `<td class="matrix-slots-td">`;

                if (daySlots.length === 0) {
                    tableHtml += `<span class="matrix-no-slots">—</span>`;
                } else {
                    tableHtml += `<div class="matrix-slots-flow">`;
                    daySlots.forEach(slot => {
                        const time = slot.time;
                        const slotKey = `${dateStr}_${time}`;
                        const isAvailable = slot.status === 'available' && slot.visits_count === 0;

                        // Check collision: Is patient already booked in Health24 at this date & time?
                        const existingConflict = patientConflictMap.get(slotKey);
                        // Check collision: Did user already select this exact date & time for ANOTHER specialist in this modal?
                        const alreadySelectedSlot = this.selectedSlots.get(slotKey);
                        const isSelectedForThisEmp = alreadySelectedSlot && alreadySelectedSlot.employeeId === emp.id;
                        const isSelectedForOtherEmp = alreadySelectedSlot && alreadySelectedSlot.employeeId !== emp.id;

                        let slotClass = '';
                        let tooltip = `${time} (${emp.name})`;
                        let isDisabled = false;

                        if (existingConflict) {
                            slotClass = 'slot-patient-conflict';
                            tooltip = `⚠️ Конфлікт: Пацієнт вже записаний на ${time} до ${existingConflict.employeeName}!`;
                            isDisabled = true;
                        } else if (isSelectedForThisEmp) {
                            slotClass = 'slot-selected';
                            tooltip = `Обрано: ${time} до ${emp.name}`;
                        } else if (isSelectedForOtherEmp) {
                            slotClass = 'slot-patient-conflict';
                            tooltip = `⚠️ Увага: На цей час (${time}) ви вже обрали прийом у ${alreadySelectedSlot.employeeName}! Пацієнт не може бути у двох місцях одночасно.`;
                            isDisabled = true;
                        } else if (!isAvailable) {
                            slotClass = 'slot-busy';
                            tooltip = `${time} - Зайнято іншим пацієнтом`;
                            isDisabled = true;
                        } else {
                            slotClass = 'slot-available';
                            tooltip = `Вільно: ${time}. Натисніть щоб обрати`;
                        }

                        tableHtml += `
                            <button type="button" 
                                class="h24-matrix-slot-btn ${slotClass}" 
                                data-slot-key="${slotKey}"
                                data-emp-id="${emp.id}"
                                data-emp-name="${emp.name}"
                                data-date="${dateStr}"
                                data-time="${time}"
                                data-period-start="${slot.period_start}"
                                title="${tooltip}"
                                ${isDisabled && !isSelectedForThisEmp ? 'disabled' : ''}>
                                ${time}
                            </button>
                        `;
                    });
                    tableHtml += `</div>`;
                }

                tableHtml += `</td>`;
            });

            tableHtml += `</tr>`;
        });

        tableHtml += `
                </tbody>
            </table>
        `;

        container.innerHTML = tableHtml;

        // Slot click handling
        container.querySelectorAll('.h24-matrix-slot-btn:not([disabled]), .h24-matrix-slot-btn.slot-selected').forEach(btn => {
            btn.onclick = () => {
                const slotKey = btn.getAttribute('data-slot-key');
                const empId = parseInt(btn.getAttribute('data-emp-id'), 10);
                const empName = btn.getAttribute('data-emp-name');
                const date = btn.getAttribute('data-date');
                const time = btn.getAttribute('data-time');
                const periodStart = btn.getAttribute('data-period-start');

                if (this.selectedSlots.has(slotKey)) {
                    // Deselect
                    this.selectedSlots.delete(slotKey);
                } else {
                    // Check collision before adding
                    if (patientConflictMap.has(slotKey)) {
                        const conf = patientConflictMap.get(slotKey);
                        alert(`❌ Неможливо обрати цей слот!\nПацієнт вже має запис на ${time} (${date}) у спеціаліста ${conf.employeeName}.`);
                        return;
                    }

                    // Check if another slot at this same time is already selected in the modal
                    if (this.selectedSlots.has(slotKey)) {
                        const existing = this.selectedSlots.get(slotKey);
                        alert(`❌ Пацієнт не може бути записаний одночасно до двох спеціалістів!\nНа ${time} вже обрано фахівця: ${existing.employeeName}.`);
                        return;
                    }

                    // Add slot
                    this.selectedSlots.set(slotKey, {
                        employeeId: empId,
                        employeeName: empName,
                        date,
                        time,
                        periodStart,
                        duration: 30
                    });
                }

                // Re-render slots grid to update conflict states for the same time across other columns
                this.renderSlotsGrid();
                this.updateSummary();
            };
        });
    }

    updateSummary() {
        const summaryEl = document.getElementById('booking-selected-summary');
        const confirmBtn = document.getElementById('confirm-booking-btn');
        if (!summaryEl || !confirmBtn) return;

        const count = this.selectedSlots.size;
        let html = `Обрано слотів для запису: <b>${count}</b>`;

        if (this.selectedPatient) {
            html += ` | Пацієнт: <b>${this.selectedPatient.fullName}</b>`;
        } else {
            html += ` | <span style="color: #c53030;">⚠️ Оберіть пацієнта</span>`;
        }

        summaryEl.innerHTML = html;
        confirmBtn.disabled = (count === 0 || !this.selectedPatient);
    }

    async submitBookings() {
        if (!this.selectedPatient) {
            alert('Будь ласка, оберіть пацієнта перед збереженням!');
            return;
        }

        if (this.selectedSlots.size === 0) {
            alert('Будь ласка, оберіть хоча б один вільний слот!');
            return;
        }

        const reasonSelect = document.getElementById('encounter-reason-select');
        const encounterReasonId = parseInt(reasonSelect?.value || '3', 10);
        const comment = document.getElementById('booking-comment-input')?.value?.trim() || '';

        const slotsToCreate = Array.from(this.selectedSlots.values());
        const total = slotsToCreate.length;

        const confirmMsg = `Підтвердіть створення ${total} запис(ів) для пацієнта:\n` +
                          `👤 ${this.selectedPatient.fullName}\n` +
                          `Період: з ${this.startDateStr} по ${this.endDateStr}\n\nПродовжити?`;

        if (!confirm(confirmMsg)) return;

        // Show progress overlay
        const confirmBtn = document.getElementById('confirm-booking-btn');
        const cancelBtn = document.getElementById('cancel-booking-btn');
        confirmBtn.disabled = true;
        cancelBtn.disabled = true;

        let successCount = 0;
        let errorCount = 0;

        for (let i = 0; i < slotsToCreate.length; i++) {
            const slot = slotsToCreate[i];
            confirmBtn.innerText = `⏳ Запис ${i + 1} з ${total}...`;

            const payload = {
                medical_service_ids: [],
                additional_reason_ids: [],
                patient_id: this.selectedPatient.id,
                employee_id: slot.employeeId,
                medical_service_order_id: null,
                period_start: slot.periodStart,
                duration: slot.duration,
                encounter_reason_id: encounterReasonId,
                encounter_reason_other: '',
                order_items: [],
                comment: comment,
                service_request_id: null
            };

            try {
                const resp = await fetch('https://ehr.h24.ua/api/v2/ehr/visits/calendar_create', {
                    method: 'POST',
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json'
                    },
                    credentials: 'include',
                    body: JSON.stringify(payload)
                });

                if (resp.ok) {
                    const resJson = await resp.json();
                    if (resJson.success) {
                        successCount++;
                    } else {
                        errorCount++;
                    }
                } else {
                    errorCount++;
                }
            } catch (err) {
                console.error('Error creating visit:', err);
                errorCount++;
            }
        }

        // Close modal
        document.getElementById('h24-booking-overlay')?.remove();

        // Show toast and refresh custom calendar if open
        if (typeof showToast === 'function') {
            if (errorCount === 0) {
                showToast(`✅ Успішно створено всі ${successCount} запис(ів)!`, 'success');
            } else {
                showToast(`⚠️ Створено ${successCount} записів, помилок: ${errorCount}`, 'warning');
            }
        } else {
            alert(`Створено ${successCount} із ${total} записів.`);
        }

        // If custom calendar is currently open, trigger its refresh
        const customView = document.getElementById('custom-calendar-view');
        if (customView && typeof renderCustomCalendar === 'function') {
            renderCustomCalendar('range', this.startDateStr, this.endDateStr);
        }
    }
}

// Global invocation helper
function openAppointmentBookingModal() {
    const modal = new AppointmentBookingModal();
    modal.init();
}
