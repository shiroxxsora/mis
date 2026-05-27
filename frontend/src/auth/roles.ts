import type { KeycloakTokenParsed } from 'keycloak-js';

/** Hasura / Keycloak: врач (лечение, направления). */
export type MisDoctorRole = 'user';

/** Hasura / Keycloak: регистратура (запись, чеки). */
export type MisRegistrarRole = 'registrar';

export type MisRole = MisDoctorRole | MisRegistrarRole;

export function getRealmRoles(
  tokenParsed: KeycloakTokenParsed | undefined,
): string[] {
  return tokenParsed?.realm_access?.roles ?? [];
}

/** Основная MIS-роль пользователя (ровно одна на аккаунт). */
export function resolveMisRole(
  tokenParsed: KeycloakTokenParsed | undefined,
): MisRole | null {
  const roles = new Set(getRealmRoles(tokenParsed));
  const hasUser = roles.has('user');
  const hasRegistrar = roles.has('registrar');
  if (hasUser && hasRegistrar) {
    return null;
  }
  if (hasUser) {
    return 'user';
  }
  if (hasRegistrar) {
    return 'registrar';
  }
  return null;
}

export function hasDualMisRoles(
  tokenParsed: KeycloakTokenParsed | undefined,
): boolean {
  const roles = new Set(getRealmRoles(tokenParsed));
  return roles.has('user') && roles.has('registrar');
}

export function isDoctorRole(role: MisRole | null): role is MisDoctorRole {
  return role === 'user';
}

export function isRegistrarRole(role: MisRole | null): role is MisRegistrarRole {
  return role === 'registrar';
}
