FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000
# Перед запуском применяем миграции БД. Число процессов — WEB_CONCURRENCY (по умолчанию 2);
# планировщик работает в каждом процессе, дубли напоминаний отсекает уникальный ключ в БД.
ENV WEB_CONCURRENCY=2
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers $WEB_CONCURRENCY --proxy-headers"]
