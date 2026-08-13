# 📡 Документация Web API — Antigravity Web

В данном документе описаны все REST и gRPC-Web эндпоинты, используемые вебом **Antigravity Web IDE** и **Multi-Account Auth Server**.

---

## 1. REST API мульти-аккаунтности (`/auth-api/`)

Базовый путь: `/auth-api` (Проксируется Nginx на `http://127.0.0.1:8088/api`)

### `GET /auth-api/accounts`
Получение списка подключенных аккаунтов Google и текущего активного ID.

**Формат ответа (200 OK):**
```json
{
  "success": true,
  "activeId": "8",
  "accounts": [
    {
      "id": "7",
      "email": "user1@gmail.com",
      "name": "Lev",
      "isActive": false
    },
    {
      "id": "8",
      "email": "user2@gmail.com",
      "name": "Lev (Pro)",
      "isActive": true
    }
  ]
}
```

---

### `POST /auth-api/switch`
Активация выбранного аккаунта. Скрипт обновляет Google OAuth токены, записывает токен в Linux SecretService Keyring, инъецирует его в SQLite БД `state.vscdb` и принудительно перезапускает `language_server`.

**Тело запроса (`application/json`):**
```json
{
  "id": "8"
}
```

**Формат ответа (200 OK):**
```json
{
  "success": true,
  "activeAccount": "user2@gmail.com"
}
```

---

### `GET /auth-api/ping`
Проверка готовности и статуса работы Antigravity Language Server.

**Формат ответа (200 OK):**
```json
{
  "success": true,
  "ready": true
}
```

---

### `POST /auth-api/rename`
Переименование отображаемого имени аккаунта.

**Тело запроса:**
```json
{
  "id": "8",
  "name": "Новое Имя"
}
```

---

### `POST /auth-api/delete`
Удаление подключенного аккаунта.

**Тело запроса:**
```json
{
  "id": "7"
}
```

---

### `GET /auth-api/oauth/start`
Запуск сессии Google OAuth 2.0 PKCE и генерация ссылки авторизации.

**Формат ответа (200 OK):**
```json
{
  "success": true,
  "authUrl": "https://accounts.google.com/o/oauth2/v2/auth?...",
  "port": 8888,
  "state": "random_session_state"
}
```

---

### `POST /auth-api/oauth/submit-code`
Обмен кода авторизации Google на постоянные токены доступа (Access/Refresh Tokens).

**Тело запроса:**
```json
{
  "code": "4/0AeaY...",
  "port": 8888
}
```

---

## 2. gRPC-Web API Language Server (`/exa.language_server_pb.LanguageServerService/`)

Базовый путь: `/exa.language_server_pb.LanguageServerService` (Проксируется Nginx на `http://127.0.0.1:8085` / `:9000`)

### `SubscribeAppState`
- **Протокол:** gRPC-Web Server-Sent Events / Chunked Stream
- **Назначение:** Доставка реального времени обновлений состояния интерфейса и фоновых задач ИИ.

### `SubscribeProjectUpdates`
- **Протокол:** gRPC-Web Stream
- **Назначение:** Отслеживание правок файлов, структуры проекта и изменения списков открытых директорий.

### `SubscribeTrajectorySummaries`
- **Протокол:** gRPC-Web Stream
- **Назначение:** Трансляция траекторий диалогов с ИИ-агентом Antigravity (мышление, вызовы инструментов, ответы).

### `SubscribeExtensibilityPlugins`
- **Протокол:** gRPC-Web Stream
- **Назначение:** Отслеживание статуса активных расширений и плагинов MCP (Model Context Protocol).

### `GetUserStatus`
- **Метод:** Unary RPC
- **Назначение:** Запрос текущих квот, подписки Google AI Pro/Ultra и профиля пользователя.

### `GetProjectContext`
- **Метод:** Unary RPC
- **Назначение:** Извлечение индекса файлов, символов и AST структуры проекта для генерации кода.

---

## 3. Мосты браузера (`polyfill.js`)

`polyfill.js` предоставляет нативные эмуляторы для веб-окружения:
- `window.nativeStorage` — локальное хранилище настроек.
- `window.electronNative` — нативные события окна.
- `window.ide` — вызовы управления IDE.
