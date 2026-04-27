
// Специфічний селектор для Health24 IRP таблиці (розділ 5)
const TARGET_HEADERS = ["Назва інструменту", "Під час первинного обстеження", "Під час заключного/етапного обстеження"];

// Використовуємо debounce, щоб не перевіряти DOM занадто часто
let timeout = null;
const observer = new MutationObserver(() => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(addHelperButton, 500); 
});

observer.observe(document.body, { childList: true, subtree: true });

let lastRawData = [];

function addHelperButton() {
    const tableContainers = document.querySelectorAll('h24-editor-table:not(.irp-processed)');
    
    tableContainers.forEach(container => {
        const table = container.querySelector('table');
        if (!table) return;

        container.classList.add('irp-processed');

        const headerText = table.innerText;
        if (TARGET_HEADERS.every(h => headerText.includes(h))) {
            // Створюємо контейнер для кнопок
            const wrapper = document.createElement('div');
            wrapper.className = 'irp-helper-container';
            
            const btn = document.createElement('button');
            btn.innerText = "✨ Розподілити дані (Gemini AI)";
            btn.className = "irp-helper-btn";
            btn.type = "button";
            
            btn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                processTable(table, wrapper);
            };
            
            wrapper.appendChild(btn);			
            
            const controls = container.querySelector('.table-controls') || table;
            controls.parentNode.insertBefore(wrapper, controls);
        }
    });
}

async function processTable(table, wrapper) {
    const apiKey = (await chrome.storage.local.get('gemini_api_key')).gemini_api_key;
    if (!apiKey) {
        alert("Будь ласка, встановіть API ключ у налаштуваннях розширення!");
        return;
    }

    const rows = Array.from(table.querySelectorAll('tbody tr'));
    const freshlyScrapedData = [];

    // ПРОПУСКАЄМО перші 2 рядки (заголовок)
    for (let i = 2; i < rows.length; i++) {
        const firstCell = rows[i].cells[0];
        const text = firstCell ? firstCell.innerText.trim() : "";
        // Перевіряємо, чи це сирі дані (містять дату або роздільники)
        if (text && text.length > 5 && (/\d{2}\.\d{2}\.\d{4}/.test(text) || text.includes('***'))) { 
            freshlyScrapedData.push(text);
			freshlyScrapedData.push('*******************************');
        }
    }

    let dataToUse;
    if (freshlyScrapedData.length > 0) {
        // Якщо знайшли нові дані в таблиці - використовуємо їх і оновлюємо кеш
        lastRawData = freshlyScrapedData;
        dataToUse = freshlyScrapedData;
    } else if (lastRawData.length > 0) {
        // Якщо в таблиці порожньо/оброблено, використовуємо кеш для повторної спроби
        dataToUse = lastRawData;
        console.log('🔄 Використовуємо дані з кешу lastRawData');
    } else {
        alert("Дані для обробки не знайдені.");
        return;
    }

    setLoading(true, null, wrapper);

    try {
        const result = await callGeminiAIWithFallback(apiKey, dataToUse, wrapper);
        updateTableWithResult(table, result);
        showPostProcessingControls(table, wrapper);
        
        // Оновлюємо назву головної кнопки для повторного використання
        const mainBtn = wrapper.querySelector('.irp-helper-btn:not(.__secondary)');
        if (mainBtn) mainBtn.innerText = "🔄 Перерозподілити дані";
        
		showToast("✨ Дані успішно оброблені ШІ", "success");
    } catch (e) {
        console.error(e);
        alert("Помилка AI: " + e.message);
    } finally {
        setLoading(false, null, wrapper);
    }
}

function showPostProcessingControls(table, wrapper) {
    // Видаляємо старі додаткові кнопки, якщо вони були
    wrapper.querySelectorAll('.__extra-ctrl').forEach(el => el.remove());

    // Кнопка Swap
    const swapBtn = document.createElement('button');
    swapBtn.innerHTML = "🔄 Поміняти стовпці місцями";
    swapBtn.className = "irp-helper-btn __secondary __extra-ctrl";
    swapBtn.onclick = (e) => {
        e.preventDefault();
        swapTableColumns(table);
    };

    // Кнопка Review
    const reviewBtn = document.createElement('button');
    reviewBtn.innerHTML = "📋 Оригінальні дані";
    reviewBtn.className = "irp-helper-btn __secondary __extra-ctrl";
    reviewBtn.onclick = (e) => {
        e.preventDefault();
        showRawDataOverlay();
    };

    // Попередження
    const warning = document.createElement('span');
    warning.className = "irp-warning-label __extra-ctrl";
    warning.innerText = "⚠️ Перевірте дати!";

    wrapper.appendChild(swapBtn);
    wrapper.appendChild(reviewBtn);
    wrapper.appendChild(warning);
}

function swapTableColumns(table) {
    const rows = Array.from(table.querySelectorAll('tbody tr')).slice(2); // Беремо тільки рядки з даними
    
    // 1. Збираємо поточні дані з таблиці
    const currentData = rows.map(row => {
        if (row.cells.length < 3) return null;
        
        const p1 = row.cells[0].querySelector('.cell-content p');
        const p2 = row.cells[1].querySelector('.cell-content p');
        const p3 = row.cells[2].querySelector('.cell-content p');
        
        return {
            instrument: p1 ? p1.innerText : '',
            initial: p3 ? p3.innerText : '', // Міняємо місцями відразу при читанні
            final: p2 ? p2.innerText : ''    // Міняємо місцями відразу при читанні
        };
    }).filter(item => item !== null);

    // 2. Перестворюємо таблицю за допомогою вже існуючої функції
    if (currentData.length > 0) {
        updateTableWithResult(table, currentData);
		showToast("🔄 Стовпці поміняно місцями", "info");
        console.log('✨ Таблицю повністю перестворено із заміною стовпців');
    }
}

function showToast(message, type = "success") {
    // Видаляємо старий тост, якщо є
    const oldToast = document.querySelector('.irp-toast');
    if (oldToast) oldToast.remove();

    const toast = document.createElement('div');
    toast.className = `irp-toast __${type}`;
    
    const icon = type === "success" ? "✅" : "ℹ️";
    toast.innerHTML = `<span class="irp-toast-icon">${icon}</span> <span>${message}</span>`;
    
    document.body.appendChild(toast);
    
    // Анімація появи
    setTimeout(() => toast.classList.add('show'), 100);
    
    // Видалення через 3 секунди
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function updateTableWithResult(table, aiResult) {
    const tbody = table.querySelector('tbody');
    const rows = Array.from(tbody.querySelectorAll('tr'));
    for (let i = rows.length - 1; i > 1; i--) { rows[i].remove(); }

    aiResult.forEach(item => {
        const tr = document.createElement('tr');
        tr.className = 'irp-row-updated'; // Додаємо клас для анімації
        tr.setAttribute('data-entity-id', 'ai-' + Math.random().toString(36).substr(2, 9));
        tr.innerHTML = `<td colspan="1" rowspan="1" data-text-orientation="system_variables.diagnostic_report" style="position: relative;"><div class="cell-content"><p>${item.instrument}</p></div></td><td colspan="1" rowspan="1" data-text-orientation="system_variables.diagnostic_report" style="position: relative;"><div class="cell-content"><p>${item.initial || ""}</p></div></td><td colspan="1" rowspan="1" data-text-orientation="system_variables.diagnostic_report" style="position: relative;"><div class="cell-content"><p>${item.final || ""}</p></div></td>`;
        tbody.appendChild(tr);
    });
}

function showRawDataOverlay() {
    const overlay = document.createElement('div');
    overlay.className = 'irp-overlay-bg';
    overlay.style.cssText = "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.3); z-index: 9999;";
    const panel = document.createElement('div');
    panel.className = 'irp-raw-data-panel';
    
    const cleanDisplayData = lastRawData.join('\n');
	/*
    const cleanDisplayData = lastRawData
        .filter(line => !line.includes('*******************************'))
        .map(line => `• ${line}`)
        .join('\n');
    */
    panel.innerHTML = `
        <div class="irp-raw-data-header">
            <strong style="color: #1976d2">📋 Оригінальні дані (для перевірки)</strong>
            <button style="border: none; background: #eee; padding: 5px 10px; border-radius: 4px; cursor: pointer;" onclick="this.closest('.irp-overlay-bg').remove()">✖ Закрити</button>
        </div>
        <div class="irp-raw-data-content" style="max-height: 400px; overflow-y: auto; background: #f9f9f9; border: 1px solid #ddd; padding: 15px;">${cleanDisplayData}</div>
    `;
    
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    
    overlay.onclick = (e) => {
        if (e.target === overlay) overlay.remove();
    };
}

async function callGeminiAIWithFallback(apiKey, rawData, wrapper) {
    const models = [
        'gemini-2.5-flash-lite', 
        'gemini-2.5-flash', 
        'gemini-flash-latest',
        'gemma-4-31b-it',
        'gemma-3-27b-it',
        'gemini-2.0-flash-lite',
        'gemini-2.0-flash'
    ];
    let lastError = null;

    for (const model of models) {
        try {
            console.log(`🚀 Спроба запиту до моделі: ${model}`);
            setLoading(true, `⏳ Обробка (${model})...`, wrapper);
            return await callGeminiAI(apiKey, rawData, model);
        } catch (e) {
            lastError = e;
            console.warn(`❌ Модель ${model} не спрацювала:`, e.message);

            // Якщо помилка в API ключі - зупиняємось
            if (e.message.includes('API_KEY_INVALID')) throw e;

            // В інших випадках (503, 429, 404) пробуємо наступну
            continue;
        }
    }
    throw new Error(`Всі моделі недоступні. Остання помилка: ${lastError.message}`);
}



/*const DEFAULT_PROMPT_INSTRUCTIONS = `СУВОРА ІНСТРУКЦІЯ ДЛЯ МЕДИЧНОГО АНАЛІТИКА:
Ти повинен перетворити список медичних результатів у структурований JSON. 
КОЖЕН РЯДОК у вхідних даних починається з дати.

АЛГОРИТМ ОБРОБКИ:
1. ВИЗНАЧЕННЯ ПЕРІОДІВ:
   - Знайди всі унікальні дати в тексті (дати записанні у форматті dd.MM.yyyy).
   - Записи розділенні роздільником '*******************************'
   - "initial" (первинне) = записи, що належать до НАЙРАНІШОЇ дати (наприклад, 16.03.2026).
   - "final" (заключне) = записи, що належать до НАЙПІЗНІШОЇ дати (наприклад, 02.04.2026).
   - ЗАБОРОНЕНО міняти їх місцями. Рання дата — завжди початкові дані.
   - Дати звіряти не ільки по днях, а повністю: по дню, місяцю і року, бо початкова і кінцева дата може бути в різних місяцях чи роках.

2. ГРУПУВАННЯ ТА УНІФІКАЦІЯ:
   - Об'єднай записи за назвою інструменту (наприклад: СОРМ, WOMAC, 6-хвилинний тест, ММТ, Гоніометрія).
   - Якщо назва інструменту написана з помилкою або різною кількістю пробілів або нестандартно скорочена — уніфікуй її до стандартної медичної назви.
   - Для ММТ та Гоніометрії зберігай деталізацію (наприклад, "ММТ правої нижньої кінцівки").

3. ОЧИЩЕННЯ ДАНИХ:
   - Не пропускай жодного значення, всі значення мають бути оброблені.
   - НЕ додавай від себе жодних коментарів чи нових значень. Тільки те, що є в тексті.`;*/

async function callGeminiAI(apiKey, rawData, modelName) {
    // Отримуємо кастомний промпт від користувача
    const storage = await chrome.storage.local.get('custom_prompt');
    const userInstructions = storage.custom_prompt || DEFAULT_PROMPT_INSTRUCTIONS;

    const prompt = `${userInstructions}

4. ВИХІДНИЙ ФОРМАТ (ТІЛЬКИ ЧИСТИЙ JSON МАСИВ):
[
  {"instrument": "Уніфікована назва", "initial": "значення за ранню дату", "final": "значення за пізню дату"}
]
Якщо для інструменту є дані лише за одну з дат — залиш інше поле порожнім "".

ОСЬ ДАНІ:
${rawData.join('\n')}`;

	console.log('запит до ШІ:', prompt);

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { 
                responseMimeType: "application/json",
                temperature: 0.1 
            }
        })
    });

    const json = await response.json();
    
    if (json.error) {
        throw new Error(`API Error: ${json.error.message} (${json.error.status})`);
    }

    if (!json.candidates || json.candidates.length === 0) {
        throw new Error("ШІ не повернув результат.");
    }

    try {
        const content = json.candidates[0].content.parts[0].text;
        return JSON.parse(content);
    } catch (e) {
        throw new Error("Некоректний формат відповіді ШІ.");
    }
}
/*
function updateTableWithResult(table, aiResult) {
    const tbody = table.querySelector('tbody');
    const rows = Array.from(tbody.querySelectorAll('tr'));
    
    let headerLastIndex = 1; 
    
    for (let i = rows.length - 1; i > headerLastIndex; i--) {
        rows[i].remove();
    }

    aiResult.forEach(item => {
        const tr = document.createElement('tr');
        tr.setAttribute('data-entity-id', 'ai-' + Math.random().toString(36).substr(2, 9));
        // Формуємо HTML без зайвих пробілів
        tr.innerHTML = `<td colspan="1" rowspan="1" data-text-orientation="system_variables.diagnostic_report" style="position: relative;"><div class="cell-content"><p>${item.instrument}</p></div></td><td colspan="1" rowspan="1" data-text-orientation="system_variables.diagnostic_report" style="position: relative;"><div class="cell-content"><p>${item.initial || ""}</p></div></td><td colspan="1" rowspan="1" data-text-orientation="system_variables.diagnostic_report" style="position: relative;"><div class="cell-content"><p>${item.final || ""}</p></div></td>`;
        tbody.appendChild(tr);
    });
}
*/
function setLoading(isLoading, customText, wrapper) {
    //const btn = document.querySelector('.irp-helper-btn');
	const btn = wrapper.querySelector('.irp-helper-btn');
    if (btn) {
        btn.disabled = isLoading;
        btn.innerText = isLoading ? (customText || "⏳ Обробка ШІ...") : "✨ Розподілити дані (Gemini AI)";
    }
}
