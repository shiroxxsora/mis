# MIS — медицинская информационная система

## Архитектура

Подробная схема сервисов, портов и связей: **[docs/architecture.md](docs/architecture.md)**. Сценарии по ролям (врач / регистратура): **[docs/use-cases.md](docs/use-cases.md)**.

- **frontend** — React (Vite), OIDC через Keycloak (`mis-frontend`, PKCE), Bearer JWT ко всем API
- **api-gateway** — Spring Cloud Gateway: проверка JWT (`azp`, issuer), маршруты `/api/**` и `/graphql`
- **service-logic** — оркестратор в доверенной Docker-сети (без OAuth2; JWT проверяет только gateway)
- **recognition-service** — FastAPI + DentalNet (без публичного порта)
- **Hasura** — GraphQL с JWT (роли `user`, `registrar`); с хоста только через gateway `/graphql`
- **Liquibase** — SQL-миграции `app-db` по схемам (`backend/liquibase/`)
- **MinIO** — S3-compatible хранилище снимков пациентов (`mis-patient-images`)
- **Keycloak** — realm `mis` (импорт при первом старте)

## Запуск

```bash
cp .env.example .env
# при необходимости отредактируйте секреты в .env

docker compose up -d --build

# демо-пользователь (после готовности Keycloak):
# Git Bash / Linux:
sh scripts/keycloak-create-demo-user.sh
```

| Сервис | URL |
|--------|-----|
| UI | http://localhost:3000 |
| API Gateway | http://localhost:8084 (`/api/**`, `/graphql`) |
| Keycloak | http://localhost:8180 |
| MinIO API | http://127.0.0.1:9000 |
| MinIO Console | http://127.0.0.1:9001 (`minioadmin` / `minioadmin` по умолчанию) |

**Демо-пользователи** (после скриптов):

| Логин | Пароль | Роль | Возможности |
|-------|--------|------|-------------|
| `demo` | `demo` | `user` (врач) | приём, направления, без чеков |
| `registry` | `registry` | `registrar` (регистратура) | запись на приём, чеки, без приёма |

```bash
sh scripts/keycloak-create-demo-user.sh
sh scripts/keycloak-create-registrar-user.sh
```

Секреты (`KEYCLOAK_ADMIN_PASSWORD`, `HASURA_ADMIN_SECRET`, JWT) задаются в **`.env`**, не коммитьте `.env` в git.

### Повторный импорт realm Keycloak

`--import-realm` срабатывает только при **первом** создании БД Keycloak. Чтобы применить изменения в `mis-realm.json` или тему входа:

```bash
sh scripts/keycloak-recreate-volume.sh
```

Вручную:

```bash
docker compose stop keycloak keycloak-db
docker compose rm -f keycloak keycloak-db
docker volume rm mis_keycloak_db_data   # имя volume может отличаться — docker volume ls
docker compose up -d keycloak keycloak-db
sh scripts/keycloak-create-demo-user.sh
sh scripts/keycloak-create-registrar-user.sh
```

Тема входа: `backend/keycloak/themes/mis` (цвета и типографика как у UI).

### Ошибка `npm error EIDLETIMEOUT` при сборке frontend

1. Повторить сборку.
2. В `.env`: `NPM_REGISTRY=https://registry.npmmirror.com`
3. `docker compose build --no-cache frontend`

## Локальная разработка

```bash
cp .env.example .env
docker compose up -d keycloak keycloak-db app-db hasura-db hasura-graphql-engine hasura-data-connector-agent
sh scripts/keycloak-create-demo-user.sh
```

**Backend:**

```bash
cd backend/recognition-service && pip install -r requirements.txt
# MODEL_PATH=../../ml/binary/output/dentalnet.pt
uvicorn main:app --app-dir src --port 8083

cd backend/service-logic && mvn spring-boot:run
cd backend/api-gateway && mvn spring-boot:run
```

> **Важно:** при `mvn spring-boot:run` service-logic слушает `:8082` **без проверки JWT**. Для API-тестов используйте gateway `:8084`. Не пробрасывайте порт 8082 в production.

**Frontend:**

```bash
cd frontend && cp .env.example .env && npm install && npm run dev
# :5173 — /api и /graphql → :8084 (gateway)
```

## Обучение модели (отдельный Docker)

```powershell
cd ml
docker compose up --build
```

Подробнее: [ml/training/README.md](ml/training/README.md).

## Структура

```
mis/
├── .env.example
├── docker-compose.yml
├── scripts/keycloak-create-demo-user.sh
├── frontend/
├── backend/
│   ├── api-gateway/
│   ├── service-logic/
│   ├── recognition-service/
│   ├── liquibase/          # миграции app-db (SQL по схемам)
│   ├── hasura/             # metadata GraphQL
│   └── keycloak/realm-export/
└── ml/
```
