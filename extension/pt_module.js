// Оптимізований пошук: шукаємо ключові слова в першій клітинці
const PT_KEYWORDS = ["Реабілітаційні", "втручання", "026:2021"];

let ptDebounceTimer;
const ptObserver = new MutationObserver(() => {
    clearTimeout(ptDebounceTimer);
    ptDebounceTimer = setTimeout(addPTGroupButton, 500); // Затримка 500мс для стабільності
});
ptObserver.observe(document.body, { childList: true, subtree: true });

function isPTTable(table) {
    const firstCell = table.querySelector('td, th');
    if (!firstCell) return false;
    const text = firstCell.innerText;
    return PT_KEYWORDS.filter(kw => text.includes(kw)).length >= 2;
}

function addPTGroupButton() {
    const containers = document.querySelectorAll('h24-editor-table');
    containers.forEach(container => {
        const table = container.querySelector('table');
        if (!table) return;

        if (isPTTable(table)) {
            if (!container.querySelector('.pt-group-btn')) {
                const btn = document.createElement('button');
                btn.innerText = "✨ Групувати втручання";
                btn.className = "irp-helper-btn pt-group-btn";
                btn.style.backgroundColor = "#4caf50";
                btn.style.margin = "5px";
                btn.type = "button";
                
                btn.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    processPTTable(table);
                };
                
                const controls = container.querySelector('.table-controls') || table;
                controls.parentNode.insertBefore(btn, controls);
            }
        }
    });
}

function processPTTable(table) {
    const tbody = table.querySelector('tbody');
    const allRows = Array.from(tbody.querySelectorAll('tr'));
    if (allRows.length < 2) return;

    const dataRows = allRows.slice(2);
    if (dataRows.length === 0) {
        if (typeof showToast === 'function') showToast("⚠️ Дані для групування не знайдені", "warning");
        return;
    }

    const interventions = {};
    const allUniqueDates = new Set();

    const getCleanData = (cell) => {
        if (!cell) return "";
        const valEl = cell.querySelector('.name-input') || 
                      cell.querySelector('[data-variable]') || 
                      cell.querySelector('.variable-mark-highlight');
        let text = valEl ? valEl.innerText : cell.innerText;
        const dateMatch = text.match(/(\d{2}\.\d{2}\.\d{4})/);
        if (dateMatch) return dateMatch[1];
        return text
            .replace(/Код:|Дата:|Дата та час проведення:|text_fields|clear|▲|▼/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    };

    dataRows.forEach(row => {
        if (row.cells.length < 2) return;
        const code = getCleanData(row.cells[0]);
        const date = getCleanData(row.cells[1]);
        if (code && date && /^\d{2}\.\d{2}\.\d{4}$/.test(date)) {
            if (!interventions[code]) interventions[code] = [];
            if (!interventions[code].includes(date)) interventions[code].push(date);
            allUniqueDates.add(date);
        }
    });

    const sortedDates = Array.from(allUniqueDates).sort((a, b) => {
        const parse = (d) => {
            const [day, month, year] = d.split('.').map(Number);
            return new Date(year, month - 1, day);
        };
        return parse(a) - parse(b);
    });

    const groupedData = Object.keys(interventions).map(code => {
        const procDates = interventions[code];
        const rowValues = sortedDates.map(d => procDates.includes(d) ? d : "");
        return { code, dates: rowValues };
    });

    rebuildPTTable(table, groupedData, sortedDates);
}

function rebuildPTTable(table, groupedData, sortedDates) {
    const tbody = table.querySelector('tbody');
    tbody.innerHTML = ''; // Повне очищення для перемальовування

    // 1. Створюємо перший рядок шапки
    const tr0 = document.createElement('tr');
    tr0.setAttribute('data-row-type', 'template-header');
    
    // Колонку "Втручання" (rowspan 2)
    const th0 = document.createElement('th');
    th0.setAttribute('colspan', '1');
    th0.setAttribute('rowspan', '2');
    th0.setAttribute('colwidth', '194');
    th0.innerHTML = '<p style="text-align: left;"><span style="font-size: 11pt;">Реабілітаційні втручання</span><br><span style="font-size: 11pt;">(національний класифікатор 026:2021)</span></p>';
    
    // Колонку "Дата" (colspan на всі дати)
    const th1 = document.createElement('th');
    th1.setAttribute('colspan', sortedDates.length);
    th1.setAttribute('rowspan', '1');
    th1.innerHTML = '<p style="text-align: center;"><span style="font-size: 11pt;">Дата</span></p>';
    
    tr0.appendChild(th0);
    tr0.appendChild(th1);
    tbody.appendChild(tr0);

    // 2. Створюємо другий рядок шапки ("день, місяць, рік")
    const tr1 = document.createElement('tr');
    sortedDates.forEach(() => {
        const td = document.createElement('td');
        td.setAttribute('colspan', '1');
        td.setAttribute('rowspan', '1');
        td.innerHTML = '<div class="cell-content"><p style="text-align: center;"><span style="font-size: 10pt;">день, місяць, рік</span></p></div>';
        tr1.appendChild(td);
    });
    tbody.appendChild(tr1);

    // 3. Додаємо згруповані дані
    groupedData.forEach(item => {
        const tr = document.createElement('tr');
        tr.className = 'ng-star-inserted';
        
        // Код
        let html = `<td colspan="1" rowspan="1" style="position: relative;"><div class="cell-content"><p>${item.code}</p></div></td>`;
        
        // Дати
        item.dates.forEach(date => {
            html += `<td colspan="1" rowspan="1" style="position: relative;"><div class="cell-content"><p style="text-align: center;">${date}</p></div></td>`;
        });

        tr.innerHTML = html;
        tbody.appendChild(tr);
    });

    if (typeof showToast === 'function') showToast("✅ Таблицю перебудовано", "success");
}
