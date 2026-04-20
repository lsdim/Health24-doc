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

document.addEventListener('DOMContentLoaded', async () => {
    const apiKeyInput = document.getElementById('apiKey');
    const aiPromptInput = document.getElementById('aiPrompt');
    const saveBtn = document.getElementById('saveBtn');

    // Завантажуємо існуючі налаштування
    const data = await chrome.storage.local.get(['gemini_api_key', 'custom_prompt']);
    
    if (data.gemini_api_key) {
        apiKeyInput.value = data.gemini_api_key;
    }
    
    // Якщо кастомного промпту немає - показуємо дефолтний
    aiPromptInput.value = data.custom_prompt || DEFAULT_PROMPT_INSTRUCTIONS;

    saveBtn.onclick = async () => {
        const key = apiKeyInput.value.trim();
        const prompt = aiPromptInput.value.trim();
        
        await chrome.storage.local.set({ 
            'gemini_api_key': key,
            'custom_prompt': prompt
        });
        
        saveBtn.innerText = "✅ Збережено!";
        setTimeout(() => {
            saveBtn.innerText = "Зберегти налаштування";
        }, 2000);
    };
});
