
// Специфічний селектор для Health24 IRP таблиці (розділ 5)
const TARGET_HEADERS = ["Назва інструменту", "Під час первинного обстеження", "Під час заключного/етапного обстеження"];

// Додаємо кнопку при завантаженні та змінах
const observer = new MutationObserver(() => {
    addHelperButton();
});
observer.observe(document.body, { childList: true, subtree: true });

function addHelperButton() {
    // Шукаємо таблиці в редакторі
    const tables = document.querySelectorAll('h24-editor-table table');
    tables.forEach(table => {
        const headerText = table.innerText;
        // Перевіряємо, чи це та сама таблиця
        if (TARGET_HEADERS.every(h => headerText.includes(h)) && !table.parentElement.querySelector('.irp-helper-btn')) {
            const btn = document.createElement('button');
            btn.innerText = "🪄 Розподілити дані (Gemini AI)";
            btn.className = "irp-helper-btn";
            btn.onclick = (e) => {
                e.preventDefault();
                processTable(table);
            };
            
            // Вставляємо кнопку над таблицею
            table.parentElement.insertBefore(btn, table);
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

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { response_mime_type: "application/json" }
        })
    });

    const json = await response.json();
    const content = json.candidates[0].content.parts[0].text;
    return JSON.parse(content);
}

function updateTableWithResult(table, aiResult) {
    const tbody = table.querySelector('tbody');
    // Зберігаємо заголовок (зазвичай перші 2 рядки у твоїй структурі)
    const headerRows = Array.from(tbody.querySelectorAll('tr[data-row-type="template-header"], tr:has(th)'));
    
    // Очищуємо дані, але залишаємо заголовок
    const allRows = Array.from(tbody.querySelectorAll('tr'));
    allRows.forEach(row => {
        if (!headerRows.includes(row)) row.remove();
    });

    // Додаємо нові рядки
    aiResult.forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><div class="cell-content"><p>${item.instrument}</p></div></td>
            <td><div class="cell-content"><p>${item.initial || ""}</p></div></td>
            <td><div class="cell-content"><p>${item.final || ""}</p></div></td>
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
