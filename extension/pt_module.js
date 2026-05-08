
// Специфічний заголовок для таблиці Програми Терапії (Втручання)
const PT_TARGET_HEADER = "Реабілітаційні втручання (національний класифікатор 026:2021)";

// Додаємо кнопку через той самий Observer, що і в основному коді
// Оскільки content.js вже має Observer, ми просто підпишемось на подію або створимо свій легкий
const ptObserver = new MutationObserver(() => {
    addPTGroupButton();
});
ptObserver.observe(document.body, { childList: true, subtree: true });

function addPTGroupButton() {
    const tables = document.querySelectorAll('h24-editor-table table');
    tables.forEach(table => {
        const headerText = table.innerText;
        // Перевіряємо, чи це таблиця втручань і чи ще немає нашої кнопки
        if (headerText.includes(PT_TARGET_HEADER) && !table.parentElement.querySelector('.pt-group-btn')) {
            const btn = document.createElement('button');
            btn.innerText = "✨ Групувати втручання";
            btn.className = "irp-helper-btn pt-group-btn";
            btn.style.backgroundColor = "#4caf50"; // Зелений колір, щоб відрізняти від ШІ
            btn.type = "button";
            
            btn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                processPTTable(table);
            };
            
            const controls = table.closest('h24-editor-table').querySelector('.table-controls') || table;
            controls.parentNode.insertBefore(btn, controls);
        }
    });
}

function processPTTable(table) {
    const tbody = table.querySelector('tbody');
    const allRows = Array.from(tbody.querySelectorAll('tr'));
    const dataRows = allRows.slice(2); // Пропускаємо 2 рядки складної шапки

    if (dataRows.length === 0) {
        alert("Дані для групування не знайдені.");
        return;
    }

    // 1. Збираємо всі унікальні дати та групуємо за кодами
    const interventions = {};
    const allUniqueDates = new Set();

    dataRows.forEach(row => {
        if (row.cells.length < 2) return;
        const code = row.cells[0].innerText.trim();
        const date = row.cells[1].innerText.trim();
        
        if (code && date && /^\d{2}\.\d{2}\.\d{4}$/.test(date)) {
            if (!interventions[code]) interventions[code] = [];
            interventions[code].push(date);
            allUniqueDates.add(date);
        }
    });

    // Сортуємо дати хронологічно
    const sortedDates = Array.from(allUniqueDates).sort((a, b) => {
        const parse = (d) => {
            const [day, month, year] = d.split('.').map(Number);
            return new Date(year, month - 1, day);
        };
        return parse(a) - parse(b);
    });

    // 2. Формуємо нові рядки
    const groupedData = Object.keys(interventions).map(code => {
        const procedureDates = interventions[code];
        // Створюємо рядок, де дата стоїть у своєму "часовому слоті" (стовпці)
        const rowValues = sortedDates.map(globalDate => {
            return procedureDates.includes(globalDate) ? globalDate : "";
        });
        return { code, dates: rowValues };
    });

    // 3. Перемальовуємо таблицю
    rebuildPTTable(table, groupedData, sortedDates);
    if (typeof showToast === 'function') showToast("✅ Втручання згруповано", "success");
}

function rebuildPTTable(table, groupedData, sortedDates) {
    const tbody = table.querySelector('tbody');
    const rows = Array.from(tbody.querySelectorAll('tr'));
    
    // Видаляємо всі рядки, крім шапки (перші 2)
    for (let i = rows.length - 1; i > 1; i--) {
        rows[i].remove();
    }

    // Додаємо нові рядки
    groupedData.forEach(item => {
        const tr = document.createElement('tr');
        tr.setAttribute('data-entity-id', 'pt-' + Math.random().toString(36).substr(2, 9));
        
        // Перша клітинка - код процедури
        let html = `<td colspan="1" rowspan="1" data-text-orientation="null" style="position: relative;"><div class="cell-content"><p>${item.code}</p></div></td>`;
        
        // Наступні клітинки - дати (по одній на стовпець)
        item.dates.forEach(date => {
            html += `<td colspan="1" rowspan="1" data-text-orientation="null" style="position: relative;"><div class="cell-content"><p>${date}</p></div></td>`;
        });

        // Додаємо порожні клітинки, якщо потрібно до заповнення всієї ширини (опціонально)
        // В даному випадку ми просто створюємо стільки стовпців, скільки у нас є унікальних дат
        
        tr.innerHTML = html;
        tbody.appendChild(tr);
    });

    console.log(`PT Table rebuild complete. Added ${groupedData.length} grouped rows.`);
}
