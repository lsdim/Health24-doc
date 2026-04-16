document.addEventListener('DOMContentLoaded', async () => {
    const apiKeyInput = document.getElementById('apiKey');
    const saveBtn = document.getElementById('saveBtn');

    // Завантажуємо існуючий ключ
    const data = await chrome.storage.local.get('gemini_api_key');
    if (data.gemini_api_key) {
        apiKeyInput.value = data.gemini_api_key;
    }

    saveBtn.onclick = async () => {
        const key = apiKeyInput.value.trim();
        if (key) {
            await chrome.storage.local.set({ 'gemini_api_key': key });
            saveBtn.innerText = "✅ Збережено!";
            setTimeout(() => {
                saveBtn.innerText = "Зберегти налаштування";
            }, 2000);
        } else {
            alert("Будь ласка, введіть ключ");
        }
    };
});
