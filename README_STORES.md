# Інформація для модераторів / Extension Description

## English (for stores)
This extension helps doctors in the Health24 medical information system automatically organize diagnostic report results into the IRP (Individual Rehabilitation Plan) table. 

**How it works:**
1. Scrapes unstructured text from the diagnostic report cell.
2. Uses Google Gemini AI to parse instrument names (e.g., WOMAC, Barthel) and values.
3. Groups data by date (Initial vs. Final assessment).
4. Populates the 3-column functional assessment table.

**Permissions justification:**
- `storage`: To securely store the user's Gemini API key and custom prompts locally.
- `host_permissions` (*.googleapis.com): Required to communicate directly with the Gemini API for data processing.

## Українська (Опис для користувачів)
Помічник для заповнення ІРП у системі Health24.

Забудьте про ручне копіювання результатів тестів у таблицю! Це розширення використовує штучний інтелект Gemini, щоб миттєво розпізнати ваші записи (СОРМ, WOMAC, ММТ, гоніометрія тощо) та розставити їх у потрібні стовпці: початкове та заключне обстеження.

**Переваги:**
- Розумне розпізнавання дат.
- Автоматична уніфікація назв тестів.
- Кнопка швидкої заміни стовпців місцями.
- Можливість редагувати інструкції для ШІ під ваші потреби.
