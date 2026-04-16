
// Специфічний селектор для Health24 IRP таблиці (розділ 5)
const TARGET_HEADERS = ["Назва інструменту", "Під час первинного обстеження", "Під час заключного/етапного обстеження"];

// Використовуємо debounce, щоб не перевіряти DOM занадто часто
let timeout = null;
const observer = new MutationObserver(() => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(addHelperButton, 500); // Перевіряємо лише через 500мс після останньої зміни
});

observer.observe(document.body, { childList: true, subtree: true });

function addHelperButton() {
    // Шукаємо контейнери таблиць, які ще не мають нашої кнопки
    const tableContainers = document.querySelectorAll('h24-editor-table:not(.irp-processed)');
    
    tableContainers.forEach(container => {
        const table = container.querySelector('table');
        if (!table) return;

        // Позначаємо контейнер як "перевірений", щоб не заходити сюди знову
        container.classList.add('irp-processed');

        const headerText = table.innerText;
        if (TARGET_HEADERS.every(h => headerText.includes(h))) {
            const btn = document.createElement('button');
            btn.innerText = "🪄 Розподілити дані (Gemini AI)";
            btn.className = "irp-helper-btn";
            btn.type = "button"; // Важливо для форм
            
            btn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                processTable(table);
            };
            
            // Вставляємо кнопку в спеціальне місце над таблицею, якщо воно є, або просто перед таблицею
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

    rows.forEach(row => {
        const firstCell = row.cells[0];
        const text = firstCell ? firstCell.innerText.trim() : "";
        if (text && text.length > 5) { // Пропускаємо порожні або дуже короткі
            dataToProcess.push(text);
        }
    });

    if (dataToProcess.length === 0) {
        alert("Дані в першій колонці не знайдені.");
        return;
    }

    setLoading(true);

    try {
        const result = await callGeminiAI(apiKey, dataToProcess);
        updateTableWithResult(table, result);
    } catch (e) {
        console.error(e);
        alert("Помилка AI: " + e.message);
    } finally {
        setLoading(false);
    }
}

async function callGeminiAI(apiKey, rawData) {
    const prompt = `Ти - медичний асистент. Твоє завдання - розпарсити список результатів обстежень пацієнта.
Дані записані в рядках, кожен рядок починається з дати.
Тобі потрібно згрупувати ці дані за НАЗВОЮ ІНСТРУМЕНТУ.
Визнач два періоди: Первинне обстеження (найраніша дата) та Заключне (найпізніша дата).
Якщо інструмент зустрічається лише один раз, залиш його в тій колонці, якій відповідає дата.
ВИХІДНИЙ ФОРМАТ ТІЛЬКИ JSON масив:
[
  {"instrument": "Назва інструменту (уніфікована)", "initial": "значення", "final": "значення"},
  ...
]
ОСЬ ДАНІ:
${rawData.join('\n')}`;

    const model = 'gemini-2.5-flash-lite';
	console.log('prompt', prompt);

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
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
        if (json.promptFeedback && json.promptFeedback.blockReason) {
            throw new Error(`Блокування за безпекою: ${json.promptFeedback.blockReason}`);
        }
        throw new Error("ШІ не повернув жодного результату. Перевірте API ключ або ліміти.");
    }

    const candidate = json.candidates[0];
    if (candidate.finishReason === "SAFETY") {
        throw new Error("Відповідь заблокована фільтром безпеки Google.");
    }

    try {
        const content = candidate.content.parts[0].text;
		console.log('json',JSON.parse(content));
        return JSON.parse(content);
    } catch (e) {
        console.log("Raw AI response:", candidate);
        throw new Error("ШІ повернув некоректний формат даних. Спробуйте ще раз.");
    }
}

function updateTableWithResult(table, aiResult) {
    const tbody = table.querySelector('tbody');
    const rows = Array.from(tbody.querySelectorAll('tr'));
    
    // Шукаємо індекс рядка, який є початком даних.
    // У вашій таблиці шапка займає 2 рядки.
    // Перший рядок має th з "Назва інструменту".
    // Другий рядок має td з "Під час первинного...".
    
    let headerLastIndex = 1; // За замовчуванням припускаємо 2 рядки шапки (індекси 0 та 1)
    
    // Очищуємо всі рядки після шапки
    for (let i = rows.length - 1; i > headerLastIndex; i--) {
        rows[i].remove();
    }

    // Додаємо нові рядки
    aiResult.forEach(item => {
        const tr = document.createElement('tr');
        // Додаємо атрибути, які були в оригінальних рядках Health24 для стабільності
        tr.setAttribute('data-entity-id', 'ai-generated-' + Math.random().toString(36).substr(2, 9));
        
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

function setLoading(isLoading) {
    const btn = document.querySelector('.irp-helper-btn');
    if (btn) {
        btn.disabled = isLoading;
        btn.innerText = isLoading ? "⏳ Обробка ШІ..." : "🪄 Розподілити дані (Gemini AI)";
    }
}
