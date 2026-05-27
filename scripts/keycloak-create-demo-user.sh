#!/usr/bin/env sh
# Создаёт demo/demo в realm mis (после первого старта Keycloak).
# Использование: ./scripts/keycloak-create-demo-user.sh

set -e

KC_ADMIN="${KEYCLOAK_ADMIN:-admin}"
KC_PASSWORD="${KEYCLOAK_ADMIN_PASSWORD:-changeme}"
REALM="${KEYCLOAK_REALM:-mis}"
DEMO_USER="${DEMO_USER:-demo}"
DEMO_PASSWORD="${DEMO_PASSWORD:-demo}"

docker exec keycloak /opt/keycloak/bin/kcadm.sh config credentials \
  --server http://localhost:8080 \
  --realm master \
  --user "$KC_ADMIN" \
  --password "$KC_PASSWORD"

if docker exec keycloak /opt/keycloak/bin/kcadm.sh get users -r "$REALM" -q username="$DEMO_USER" 2>/dev/null | grep -q "$DEMO_USER"; then
  echo "Пользователь $DEMO_USER уже существует в realm $REALM"
  exit 0
fi

docker exec keycloak /opt/keycloak/bin/kcadm.sh create users -r "$REALM" \
  -s username="$DEMO_USER" \
  -s enabled=true \
  -s email="${DEMO_USER}@mis.local" \
  -s emailVerified=true \
  -s firstName=Иван \
  -s lastName=Петров

USER_ID=$(docker exec keycloak /opt/keycloak/bin/kcadm.sh get users -r "$REALM" -q username="$DEMO_USER" --fields id --format csv --noquotes | tail -n 1)

docker exec keycloak /opt/keycloak/bin/kcadm.sh set-password -r "$REALM" --userid "$USER_ID" --new-password "$DEMO_PASSWORD"

docker exec keycloak /opt/keycloak/bin/kcadm.sh add-roles -r "$REALM" --uusername "$DEMO_USER" --rolename user

echo "Создан пользователь $DEMO_USER / $DEMO_PASSWORD (realm $REALM, роль user)"
