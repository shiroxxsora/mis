# Hasura migrations (deprecated)

SQL-миграции схемы `app-mis` перенесены в **[backend/liquibase](../liquibase/)**.

Hasura в Docker монтирует только `metadata/`. Новые таблицы:

1. Добавьте SQL в `backend/liquibase/schemas/<schema>/sql/`
2. Зарегистрируйте changeSet в `changelog.yaml` схемы
3. Обновите metadata Hasura (`tables/*.yaml`)

Папка `mis-app-db/` здесь больше не используется при `docker compose up`.
