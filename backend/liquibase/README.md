# Миграции БД (Liquibase)

Схема приложения (`app-db`) управляется **Liquibase**. Hasura использует только **metadata** (трекинг таблиц, permissions).

## Структура

```
liquibase/
├── changelog/
│   └── db.changelog-master.yaml    # корневой changelog
├── schemas/
│   └── public/                     # одна папка на схему Postgres
│       ├── changelog.yaml          # цепочка changeSet для схемы
│       └── sql/
│           ├── 001_create_people.sql
│           └── 002_create_patients_and_appointments.sql
├── liquibase.properties            # localhost:5435
└── liquibase.docker.properties     # app-db в Docker
```

Новая схема: создайте `schemas/<имя>/changelog.yaml` + `sql/*.sql`, подключите в `changelog/db.changelog-master.yaml`.

## Docker Compose

Образ **`app-db`** (см. `backend/app-db/`) при каждом старте контейнера:

1. Поднимает PostgreSQL
2. Выполняет `liquibase update` (монтирование `./backend/liquibase` → `/liquibase/workspace`)
3. Помечает готовность файлом `.liquibase-ready` (healthcheck)

Hasura и остальные сервисы ждут `app-db` со статусом **healthy** — к этому моменту миграции уже применены.

```bash
docker compose up -d app-db
docker compose logs app-db
```

Повторный запуск безопасен: Liquibase применяет только новые changeSet.

## Локально (без полного стека)

```bash
docker compose up -d app-db
```

**Через перезапуск app-db:**

```bash
docker compose up -d --build app-db
```

**Или** с Liquibase CLI на хосте:

```bash
cd backend/liquibase
liquibase --defaults-file=liquibase.properties update
```

## Полезные команды

| Команда | Назначение |
|---------|------------|
| `liquibase status` | Статус changeSet |
| `liquibase history` | История |
| `liquibase rollback-count 1` | Откат последнего changeSet (нужны rollback в SQL) |
| `liquibase validate` | Проверка changelog |

## Переход с Hasura migrations

Раньше SQL лежал в `backend/hasura/migrations/`. Теперь источник истины — эта папка.  
Если БД уже создана Hasura-миграциями, на чистом окружении ничего делать не нужно; при конфликте — новый volume `app_db_data` или `liquibase changelog-sync` (только если changeSet совпадают с фактической схемой).
