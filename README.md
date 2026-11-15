# StudyTrack

Личный трекер учебных задач студента: семестры и дисциплины, канбан-доска, список с поиском и фильтрами,
календарь сроков, дашборд и напоминания. Учебный проект по дисциплине «Основы разработки коммерческого ПО».

| Часть    | Технологии                                                                         |
|----------|------------------------------------------------------------------------------------|
| Backend  | Python 3.11+, FastAPI, SQLAlchemy 2, Alembic, Pydantic 2, APScheduler, PyJWT       |
| Frontend | React 19, TypeScript, Vite, React Router 7, dnd-kit                                |
| БД       | PostgreSQL 16 (для локальной разработки можно SQLite)                              |
| Доставка | Docker Compose (PostgreSQL + backend + nginx), GitHub Actions                      |

```
studytrack/
├── backend/            REST API: app/ (routers, services, models), alembic/, tests/
├── frontend/           SPA: src/ (api, auth, components, pages, lib), e2e/, nginx.conf
├── docs/screenshots/   скриншоты интерфейса
├── docker-compose.yml  db + backend + frontend + ежедневная резервная копия
├── .env.example        переменные окружения
└── .github/workflows/  CI: линтер, тесты, сборка
```

## Самый быстрый запуск на Windows

Установите [Python 3.12 или 3.13](https://www.python.org/downloads/) (при установке отметьте «Add python.exe to PATH»)
и [Node.js 20+](https://nodejs.org/), затем дважды щёлкните `start-local.bat`.
Первый запуск ставит зависимости и создаёт базу SQLite с демо-данными (нужен интернет, несколько минут),
следующие запуски занимают секунды. Откроется http://localhost:5173, вход — `demo@studytrack.ru` / `demo12345`.
Остановить — закрыть два окна «StudyTrack API» и «StudyTrack Web». Начать с чистой базы — удалить `backend/studytrack.db`.

## Быстрый старт в Docker

```bash
cp .env.example .env        # заполните SECRET_KEY и POSTGRES_PASSWORD
docker compose up -d --build
docker compose exec backend python -m app.seed   # необязательно: демо-данные
```

Сайт откроется на http://localhost:8080, документация API — http://localhost:8080/api/docs.
Демо-вход: `demo@studytrack.ru` / `demo12345`.

## Локальная разработка (Windows / Linux / macOS)

Нужны Python 3.11 или новее и Node.js 20 или новее.

### Backend

```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate            # Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
alembic upgrade head              # по умолчанию создаётся SQLite-файл studytrack.db
python -m app.seed                # демо-пользователь и данные
uvicorn app.main:app --reload     # http://localhost:8000/api/docs
```

Чтобы работать с PostgreSQL, задайте переменную перед запуском:
`DATABASE_URL=postgresql+psycopg://user:password@localhost:5432/studytrack`.

Тесты и линтер:

```bash
pytest --cov=app        # 40 тестов, покрытие 96 %
ruff check . && ruff format --check .
```

### Frontend

```bash
cd frontend
npm install
npm run dev             # http://localhost:5173, запросы /api проксируются на :8000
npm run build           # проверка типов и сборка в dist/
npm run e2e             # сквозные проверки в браузере (нужны запущенные backend, frontend и демо-данные)
```

## Переменные окружения backend

| Переменная                  | По умолчанию                 | Назначение                                        |
|-----------------------------|------------------------------|---------------------------------------------------|
| `DATABASE_URL`              | `sqlite:///./studytrack.db`  | Строка подключения SQLAlchemy                     |
| `SECRET_KEY`                | dev-значение                 | Подпись JWT; в продакшене не короче 32 байт       |
| `ACCESS_TOKEN_MINUTES`      | `15`                         | Время жизни access-токена                         |
| `REFRESH_TOKEN_DAYS`        | `7`                          | Время жизни refresh-токена                        |
| `CORS_ORIGINS`              | `http://localhost:5173`      | Разрешённые источники через запятую               |
| `FRONTEND_URL`              | `http://localhost:5173`      | Адрес сайта для ссылок в письмах                  |
| `SCHEDULER_ENABLED`         | `true`                       | Фоновый планировщик напоминаний                   |
| `REMINDER_INTERVAL_MINUTES` | `15`                         | Период проверки сроков                            |
| `SMTP_HOST` … `SMTP_FROM`   | пусто                        | Внешний SMTP; если хост пуст, письма пишутся в лог |
| `DEFAULT_TIMEZONE`          | `Europe/Moscow`              | Пояс новых пользователей                          |
| `WEB_CONCURRENCY`           | `2` (в Docker)               | Число процессов uvicorn                           |

## API

Все методы — под префиксом `/api/v1`, авторизация — заголовок `Authorization: Bearer <access_token>`.
Ошибки возвращаются в едином формате `{"code": "...", "message": "..."}`.
Полная спецификация OpenAPI — `/api/openapi.json`, интерактивная документация — `/api/docs`.
