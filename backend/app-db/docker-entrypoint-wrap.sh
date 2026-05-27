#!/bin/sh
set -e

LIQUIBASE_DIR="${LIQUIBASE_DIR:-/liquibase/workspace}"
MARKER="/var/lib/postgresql/18/docker/.liquibase-ready"

run_migrations() {
  if [ ! -d "$LIQUIBASE_DIR/changelog" ]; then
    echo "Liquibase: каталог $LIQUIBASE_DIR не смонтирован, миграции пропущены"
    return 0
  fi

  PROPS="/tmp/liquibase.runtime.properties"
  cat > "$PROPS" <<EOF
changelog-file=changelog/db.changelog-master.yaml
search-path=${LIQUIBASE_DIR}
url=jdbc:postgresql://127.0.0.1:5432/${POSTGRES_DB}
username=${POSTGRES_USER}
password=${POSTGRES_PASSWORD}
driver=org.postgresql.Driver
EOF

  echo "Liquibase: применение миграций к ${POSTGRES_DB}..."
  if ! /opt/liquibase/liquibase --defaults-file="$PROPS" update; then
    echo "Liquibase: update не удался."
    exit 1
  fi
  touch "$MARKER"
  echo "Liquibase: готово"
}

# PostgreSQL в фоне (официальный entrypoint: initdb при первом старте и т.д.)
/usr/local/bin/docker-entrypoint.sh "$@" &
pg_pid=$!

until pg_isready -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" >/dev/null 2>&1; do
  sleep 1
done

# Дать initdb завершиться на первом запуске volume
sleep 1

run_migrations

wait "$pg_pid"
