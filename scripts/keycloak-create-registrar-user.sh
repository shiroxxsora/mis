#!/usr/bin/env sh
# Создаёт registry/registry в realm mis (роль registrar).
# Использование: ./scripts/keycloak-create-registrar-user.sh

set -e

KC_ADMIN="${KEYCLOAK_ADMIN:-admin}"
KC_PASSWORD="${KEYCLOAK_ADMIN_PASSWORD:-changeme}"
REALM="${KEYCLOAK_REALM:-mis}"
REGISTRAR_USER="${REGISTRAR_USER:-registry}"
REGISTRAR_PASSWORD="${REGISTRAR_PASSWORD:-registry}"

docker exec keycloak /opt/keycloak/bin/kcadm.sh config credentials \
  --server http://localhost:8080 \
  --realm master \
  --user "$KC_ADMIN" \
  --password "$KC_PASSWORD"

if docker exec keycloak /opt/keycloak/bin/kcadm.sh get users -r "$REALM" -q username="$REGISTRAR_USER" 2>/dev/null | grep -q "$REGISTRAR_USER"; then
  echo "Пользователь $REGISTRAR_USER уже существует в realm $REALM"
else
  docker exec keycloak /opt/keycloak/bin/kcadm.sh create users -r "$REALM" \
    -s username="$REGISTRAR_USER" \
    -s enabled=true \
    -s email="${REGISTRAR_USER}@mis.local" \
    -s emailVerified=true \
    -s firstName=Анна \
    -s lastName=Смирнова

  USER_ID=$(docker exec keycloak /opt/keycloak/bin/kcadm.sh get users -r "$REALM" -q username="$REGISTRAR_USER" --fields id --format csv --noquotes | tail -n 1)

  docker exec keycloak /opt/keycloak/bin/kcadm.sh set-password -r "$REALM" --userid "$USER_ID" --new-password "$REGISTRAR_PASSWORD"
fi

if ! docker exec keycloak /opt/keycloak/bin/kcadm.sh get users -r "$REALM" -q username="$REGISTRAR_USER" 2>/dev/null | grep -q '"registrar"'; then
  docker exec keycloak /opt/keycloak/bin/kcadm.sh add-roles -r "$REALM" --uusername "$REGISTRAR_USER" --rolename registrar
  echo "Роль registrar назначена пользователю $REGISTRAR_USER"
fi

echo "Готово: $REGISTRAR_USER / $REGISTRAR_PASSWORD (realm $REALM, роль registrar)"
