# CORE BACKEND
* [keycloak](#kecloak)
  * [Разработка](#разработка)
    * [s.db-conf.env](#sdb-confenv)
    * [s.kc-conf.env](#skc-confenv)
    
## kecloak

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
* HASURA_GRAPHQL_METADATA_DATABASE_URL=
* PG_DATABASE_URL=
* HASURA_GRAPHQL_ENABLE_CONSOLE=
* HASURA_GRAPHQL_DEV_MODE=
* HASURA_GRAPHQL_ENABLED_LOG_TYPES=

