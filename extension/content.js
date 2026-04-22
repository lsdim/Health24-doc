
// Специфічний селектор для Health24 IRP таблиці (розділ 5)
const TARGET_HEADERS = ["Назва інструменту", "Під час первинного обстеження", "Під час заключного/етапного обстеження"];

// Використовуємо debounce, щоб не перевіряти DOM занадто часто
let timeout = null;
const observer = new MutationObserver(() => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(addHelperButton, 500); 
});

observer.observe(document.body, { childList: true, subtree: true });

function addHelperButton() {
    const tableContainers = document.querySelectorAll('h24-editor-table:not(.irp-processed)');
    
    tableContainers.forEach(container => {
        const table = container.querySelector('table');
        if (!table) return;

        container.classList.add('irp-processed');

        const headerText = table.innerText;
        if (TARGET_HEADERS.every(h => headerText.includes(h))) {
            const btn = document.createElement('button');
            btn.innerText = "✨ Розподілити дані (Gemini AI)";
            btn.className = "irp-helper-btn";
            btn.type = "button";
            
            btn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                processTable(table);
            };
            
            const controls = container.querySelector('.table-controls') || table;
            controls.parentNode.insertBefore(btn, controls);
        }
    });
}

async function processTable(table) {
    const apiKey = (await chrome.storage.local.get('gemini_api_key')).gemini_api_key;
    if (!apiKey) {
        alert("Будь ласка, встановіть API ключ у налаштуваннях розширення!");
        return;
    }

    const rows = Array.from(table.querySelectorAll('tbody tr'));
    const dataToProcess = [];

    // ПРОПУСКАЄМО перші 2 рядки (заголовок)
    for (let i = 2; i < rows.length; i++) {
        const firstCell = rows[i].cells[0];
        const text = firstCell ? firstCell.innerText.trim() : "";
        if (text && text.length > 5) { 
            dataToProcess.push(text);
			dataToProcess.push('*******************************');
        }
    }

    if (dataToProcess.length === 0) {
        alert("Дані для обробки не знайдені (крім заголовка).");
        return;
    }

    setLoading(true);

    try {
        //console.log('Дані для ШІ:', dataToProcess);
        const result = await callGeminiAIWithFallback(apiKey, dataToProcess);
        updateTableWithResult(table, result);
    } catch (e) {
        console.error(e);
        alert("Помилка AI: " + e.message);
    } finally {
        setLoading(false);
    }
}

async function callGeminiAIWithFallback(apiKey, rawData) {
    // Актуальний список моделей на основі ваших тестів (v1beta)
    const models = [
        'gemini-2.5-flash-lite', 
        'gemini-2.5-flash', 
        'gemini-flash-latest',
        'gemma-4-31b-it',
        'gemma-3-27b-it',
        'gemini-2.0-flash-lite', // fallback на випадок оновлення лімітів
        'gemini-2.0-flash'
    ];
    let lastError = null;

    for (const model of models) {
        try {
            console.log(`🚀 Спроба запиту до моделі: ${model}`);
            setLoading(true, `⏳ Обробка (${model})...`);
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


/*
const DEFAULT_PROMPT_INSTRUCTIONS = `СУВОРА ІНСТРУКЦІЯ ДЛЯ МЕДИЧНОГО АНАЛІТИКА:
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
   - НЕ додавай від себе жодних коментарів чи нових значень. Тільки те, що є в тексті.`;
*/
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
        
        tr.innerHTML = `
            <td colspan="1" rowspan="1" colwidth="null" data-text-orientation="system_variables.diagnostic_report" style="position: relative;">
                <div class="cell-content"><p>${item.instrument}</p></div>
            </td>
            <td colspan="1" rowspan="1" colwidth="null" data-text-orientation="system_variables.diagnostic_report" style="position: relative;">
                <div class="cell-content"><p>${item.initial || ""}</p></div>
            </td>
            <td colspan="1" rowspan="1" colwidth="null" data-text-orientation="system_variables.diagnostic_report" style="position: relative;">
                <div class="cell-content"><p>${item.final || ""}</p></div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function setLoading(isLoading, customText) {
    const btn = document.querySelector('.irp-helper-btn');
    if (btn) {
        btn.disabled = isLoading;
        btn.innerText = isLoading ? (customText || "⏳ Обробка ШІ...") : "✨ Розподілити дані (Gemini AI)";
    }
}
