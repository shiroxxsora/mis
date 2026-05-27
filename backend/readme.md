# CORE BACKEND
* [keycloak](#kecloak)
  * [Разработка](#разработка)
    * [s.db-conf.env](#sdb-confenv)
    * [s.kc-conf.env](#skc-confenv)
    
## kecloak

При `docker compose up` realm **`mis`** импортируется из `keycloak/realm-export/mis-realm.json` (только при первом старте БД).

- Клиент SPA: **`mis-frontend`** (PKCE, public)
- Демо-пользователь: `sh scripts/keycloak-create-demo-user.sh` (пароли в `.env`, не в realm export)
- Секреты Keycloak/Hasura: корневой **`.env`** (см. `.env.example`)

### Разработка

Для запуска сервиса необходимо указать переменные окружения в файлы **s.db-conf.env** и **s.kc-conf.env** 

#### s.db-conf.env

* POSTGRES_USER=
* POSTGRES_PASSWORD=
* POSTGRES_DB=

#### s.kc-conf.env

* KC_DB=
* KC_DB_URL=
* KC_DB_USERNAME= // jbdc:....
* KC_DB_PASSWORD=
* KC_HOSTNAME=
* KC_HOSTNAME_PORT=
* KC_HOSTNAME_STRICT=
* KC_HTTP_ENABLED=
* KC_HEALTH_ENABLED=
* KEYCLOAK_ADMIN=
* KEYCLOAK_ADMIN_PASSWORD=

#### s.app-db-conf.env

* POSTGRES_USER=
* POSTGRES_PASSWORD=
* POSTGRES_DB=

#### s.hasura-conf.env
POSTGRES_USER=
POSTGRES_PASSWORD=
POSTGRES_DB=

HASURA_GRAPHQL_METADATA_DATABASE_URL=
PG_DATABASE_URL=
HASURA_GRAPHQL_ENABLE_CONSOLE=
HASURA_GRAPHQL_DEV_MODE=
HASURA_GRAPHQL_ENABLED_LOG_TYPES=
HASURA_GRAPHQL_ADMIN_SECRET=

QUARKUS_LOG_LEVEL=
QUARKUS_OPENTELEMETRY_ENABLED=

## liquibase (app-db)

SQL-миграции схемы приложения: [liquibase/README.md](liquibase/README.md).

При `docker compose up` контейнер `app-db` сам выполняет `liquibase update` после старта PostgreSQL (см. `app-db/docker-entrypoint-wrap.sh`).

