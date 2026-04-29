# Політика конфіденційності / Privacy Policy

**Дата останнього оновлення:** 27 квітня 2026 р.

Ця Політика конфіденційності описує, як розширення **Health24 AI Helper** (надалі — "Розширення") обробляє дані користувачів. Наша головна мета — забезпечити максимальну конфіденційність медичних даних.

## 1. Збір та зберігання даних
*   **Локальна обробка:** Розширення працює за принципом "Local First". Усі дані медичних заключень зчитуються з відкритої вкладки браузера і обробляються виключно в межах поточної сесії користувача.
*   **Відсутність серверів розробника:** Ми не маємо власних серверів для зберігання чи обробки даних. Жодна інформація про пацієнтів не зберігається розробником.
*   **Налаштування:** API-ключ Gemini та користувацькі промпти зберігаються виключно локально у вашому браузері за допомогою `chrome.storage.local`.

## 2. Передача даних третім особам
*   **Google Gemini API:** Єдиним зовнішнім сервісом, куди передаються дані для обробки, є офіційне API Google (через домен `generativelanguage.googleapis.com`). Це необхідно для роботи функцій штучного інтелекту.
*   **Заборона продажу:** Ми категорично заявляємо, що не продаємо, не обмінюємо та не передаємо дані користувачів чи пацієнтів жодним третім особам, крім вищезгаданого API.

## 3. Безпека медичної інформації
Розширення розроблене для допомоги лікарям у МІС Health24. Ми розуміємо важливість лікарської таємниці, тому:
*   Дані передаються в Google API у зашифрованому вигляді (через протокол HTTPS).
*   Ми рекомендуємо користувачам використовувати персональні API-ключі з обмеженим доступом.

## 4. Дозволи браузера
*   `storage`: Для збереження вашого API-ключа.
*   `host_permissions` (*.h24.ua): Для можливості взаємодії з інтерфейсом МІС.
*   `host_permissions` (*.googleapis.com): Для зв'язку з ШІ Gemini.

## 5. Контакти
Якщо у вас виникли запитання щодо цієї політики, ви можете створити Issue у нашому репозиторії на GitHub.

---

# Privacy Policy (English Version)

## 1. Data Collection and Storage
*   **Local Processing:** The extension processes medical data locally within the user's browser session. No patient data is ever stored on the developer's side.
*   **Credentials:** Your Gemini API key and custom prompts are stored locally using `chrome.storage.local`.

## 2. Data Transmission
*   **Third-party Services:** Data is transmitted only to the official **Google Gemini API** for processing.
*   **Data Protection:** We do not sell or share user data with any other third parties.

## 3. Security
All data transmissions to the Google API are conducted via secure HTTPS connections. We prioritize patient confidentiality and professional medical standards.
