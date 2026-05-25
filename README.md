# Логістика та місії — онлайн (тест)

> ТІЛЬКИ ДЛЯ ТЕСТУ З ВИГАДАНИМИ ДАНИМИ.

## Запуск локально
1. Встанови Node.js (nodejs.org, версія 18+).
2. У терміналі в цій папці:
   ```
   npm install
   npm run dev
   ```
3. Відкрий показане посилання (зазвичай http://localhost:5173).

URL і ключ Supabase вже вшиті у src/supabase.js (як фолбек).

## Розгортання на Vercel
1. Залий папку в репозиторій GitHub.
2. vercel.com → Add New → Project → імпортуй репозиторій.
3. (Опційно) Settings → Environment Variables:
   - VITE_SUPABASE_URL
   - VITE_SUPABASE_ANON_KEY
4. Deploy → отримаєш публічне посилання.

## Тестові доступи
- Slava / admin — адмін
- FPV / 1111, BOOM / 2222, SPP / 3333, boom2 / 4444 — заявники
- N1 / 7777, N2 / 8888 — виконавці
