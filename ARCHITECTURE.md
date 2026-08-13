# 🏗️ Архитектура системы Antigravity Web

## 1. Обзор компонентов

Система Antigravity Web состоит из трех ключевых слоев:

### A. Фронтенд и Мосты браузера (`web/`)
1. **`login.html`** — Веб-интерфейс входа и управления подключениями. Реализует Google OAuth авторизацию, ввод кода обмена, менеджер карточек аккаунтов и анимированный прогресс-бар переключения.
2. **`polyfill.js`** — Скрипт-мост, внедряемый Nginx на всех страницах. Предоставляет синхронные глобальные объекты (`window.nativeStorage`, `window.electronNative`), заменяет системную кнопку `Window` на нативное выпадающее меню **`Accounts`**, отслеживает статус авторизации и автоматически скрывает служебные логи повторных gRPC-подключений.

### B. Сервер авторизации и Управление аккаунтами (`scripts/`, `src/`)
1. **`auth_server.js`** — REST API сервер на Node.js (порт 8088). Обрабатывает запросы `/api/accounts`, `/api/switch`, `/api/ping`, `/api/oauth/start`.
2. **`account_manager.js`** — Библиотека работы с токенами:
   - Обновление и проверка валидности Google OAuth токенов.
   - Запись токена в Linux SecretService Keyring (`keyring_helper.py`).
   - Синхронизация файлов `~/.gemini/google_accounts.json` и `~/.gemini/oauth_creds.json`.
   - Инъекция токенов в SQLite БД IDE `state.vscdb`.
   - Безопасный перезапуск `language_server` со сбросом зависших сокетов.

### C. Сетевой слой и Стриминг (`config/`)
1. **Nginx / OpenResty (`config/nginx.conf`)** — Обеспечивает SSL-шифрование (:9443), Basic Auth защиту, маршрутизацию HTTP/gRPC запросов и динамическую подстановку `<script src="/polyfill.js"></script>` в HTML страницы.
2. **Systemd Services (`config/systemd/`)** — Осуществляет фоновый контроль процессов `antigravity-server.service` и `antigravity-auth-server.service`.

---

## 2. Диаграмма последовательности смены аккаунта

```text
User            Accounts Dropdown         Auth Server          Account Manager         Language Server
 │                      │                      │                      │                       │
 ├── Выбор аккаунта ───►│                      │                      │                       │
 │                      ├── POST /api/switch ─►│                      │                       │
 │                      │                      ├── ensureFreshToken ─►│                       │
 │                      │                      ├── writeKeyring ─────►│                       │
 │                      │                      ├── injectSQLite ─────►│                       │
 │                      │                      ├── pkill old process ────────────────────────►│ (Stop)
 │                      │                      └── systemctl start ──────────────────────────►│ (Start)
 │                      │◄── { success: true } ┼──────────────────────┘                       │
 │                      │                      │                                              │
 │                      ├── GET /api/ping ────►│ (Check 200 OK)                               │
 │◄── Reload IDE Page ──┴──────────────────────┘                                              │
```
