#!/usr/bin/env sh
# Пересоздаёт volume Keycloak и заново импортирует realm mis (+ демо-пользователи).
# Использование: ./scripts/keycloak-recreate-volume.sh

set -e

ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

VOLUME_NAME="${KEYCLOAK_DB_VOLUME:-}"

if [ -z "$VOLUME_NAME" ]; then
  VOLUME_NAME="$(docker compose config --format json 2>/dev/null \
    | sed -n 's/.*"\([^"]*keycloak_db_data[^"]*\)".*/\1/p' \
    | head -n 1)"
fi

if [ -z "$VOLUME_NAME" ]; then
  VOLUME_NAME="$(docker volume ls -q | grep keycloak_db_data | head -n 1)"
fi

if [ -z "$VOLUME_NAME" ]; then
  echo "Не удалось определить volume keycloak_db_data. Задайте KEYCLOAK_DB_VOLUME вручную."
  exit 1
fi

echo "Останавливаем Keycloak..."
docker compose stop keycloak keycloak-db

echo "Удаляем контейнеры Keycloak..."
docker compose rm -f keycloak keycloak-db

echo "Удаляем volume: $VOLUME_NAME"
docker volume rm "$VOLUME_NAME"

echo "Запускаем Keycloak..."
docker compose up -d keycloak-db keycloak

echo "Ожидаем готовность Keycloak..."
for i in $(seq 1 60); do
  if docker exec keycloak bash -c 'exec 3<>/dev/tcp/127.0.0.1/8080 && printf "GET /health/ready HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n" >&3 && grep -q UP <&3' 2>/dev/null; then
    echo "Keycloak готов."
    break
  fi
  if [ "$i" -eq 60 ]; then
    echo "Keycloak не стал healthy за 10 минут — проверьте логи: docker logs keycloak"
    exit 1
  fi
  sleep 10
done

sh scripts/keycloak-create-demo-user.sh
sh scripts/keycloak-create-registrar-user.sh

echo "Готово. Keycloak: http://localhost:8180 (realm mis, тема mis)"
