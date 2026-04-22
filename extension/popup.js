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
