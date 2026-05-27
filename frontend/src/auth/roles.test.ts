import { describe, expect, it } from 'vitest';
import { hasDualMisRoles, resolveMisRole } from './roles';

describe('resolveMisRole', () => {
  it('возвращает user для врача', () => {
    expect(
      resolveMisRole({
        realm_access: { roles: ['offline_access', 'user'] },
      }),
    ).toBe('user');
  });

  it('возвращает registrar для регистратуры', () => {
    expect(
      resolveMisRole({
        realm_access: { roles: ['registrar', 'offline_access'] },
      }),
    ).toBe('registrar');
  });

  it('возвращает null при обеих MIS-ролях', () => {
    expect(
      resolveMisRole({
        realm_access: { roles: ['user', 'registrar'] },
      }),
    ).toBeNull();
    expect(
      hasDualMisRoles({
        realm_access: { roles: ['user', 'registrar'] },
      }),
    ).toBe(true);
  });

  it('возвращает null без MIS-роли', () => {
    expect(resolveMisRole({ realm_access: { roles: ['offline_access'] } })).toBeNull();
    expect(resolveMisRole(undefined)).toBeNull();
  });
});
