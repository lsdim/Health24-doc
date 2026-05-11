
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
    // Перевіряємо, чи є хоча б два ключових слова в першій клітинці
    return PT_KEYWORDS.filter(kw => text.includes(kw)).length >= 2;
}

function addPTGroupButton() {
    const containers = document.querySelectorAll('h24-editor-table');
    containers.forEach(container => {
        const table = container.querySelector('table');
        if (!table) return;

        if (isPTTable(table)) {
            // Перевіряємо наявність кнопки у всьому контейнері, щоб уникнути дублікатів
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

    // Допоміжна функція для очищення тексту від технічного сміття Health24
    const getCleanData = (cell) => {
        if (!cell) return "";
        
        // Пріоритет: елементи де лежать чисті дані
        const valEl = cell.querySelector('.name-input') || 
                      cell.querySelector('[data-variable]') || 
                      cell.querySelector('.variable-mark-highlight');
        
        let text = valEl ? valEl.innerText : cell.innerText;

        // Витягуємо дату (ДД.ММ.РРРР), якщо вона там є
        const dateMatch = text.match(/(\d{2}\.\d{2}\.\d{4})/);
        if (dateMatch) return dateMatch[1];

        // Для кодів та іншого: чистимо від відомих технічних слів
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
	
	console.log('interventions', interventions);

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
    const rows = Array.from(tbody.querySelectorAll('tr'));
    
    // 1. Оновлюємо шапку (другий рядок шапки)
    // Перший рядок шапки має "Дата" з colspan. Ми маємо його оновити.
    const headerRow1 = rows[0];
    const headerRow2 = rows[1];

    if (headerRow1 && headerRow1.cells.length >= 2) {
        // Оновлюємо colspan для заголовка "Дата" (це друга клітинка в першому рядку)
        headerRow1.cells[1].setAttribute('colspan', sortedDates.length);
    }

    if (headerRow2) {
        // Очищуємо всі клітинки в другому рядку шапки, крім тих, що відносяться до першої колонки (якщо вони там є)
        // В цій таблиці перша колонка займає 2 рядки (rowspan=2), тому в другому рядку її немає.
        headerRow2.innerHTML = '';
        sortedDates.forEach(() => {
            const td = document.createElement('td');
            td.setAttribute('colspan', '1');
            td.setAttribute('rowspan', '1');
            td.innerHTML = '<div class="cell-content"><p style="text-align: center;"><span style="font-size: 10pt;">день, місяць, рік</span></p></div>';
            headerRow2.appendChild(td);
        });
    }

    // 2. Видаляємо старі дані
    for (let i = rows.length - 1; i > 1; i--) {
        rows[i].remove();
    }

    // 3. Додаємо нові згруповані дані
    groupedData.forEach(item => {
        const tr = document.createElement('tr');
        tr.className = 'ng-star-inserted';
        
        // Код втручання
        let html = `<td colspan="1" rowspan="1" style="position: relative;"><div class="cell-content"><p>${item.code}</p></div></td>`;
        
        // Дати по стовпцях
        item.dates.forEach(date => {
            html += `<td colspan="1" rowspan="1" style="position: relative;"><div class="cell-content"><p style="text-align: center;">${date}</p></div></td>`;
        });

        tr.innerHTML = html;
        tbody.appendChild(tr);
    });

    if (typeof showToast === 'function') showToast("✅ Таблицю перебудовано", "success");
}
