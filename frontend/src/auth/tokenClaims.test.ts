import { describe, expect, it } from 'vitest';
import { getUserDisplayName } from './tokenClaims';

describe('getUserDisplayName', () => {
  it('формирует ФИО из family_name, given_name и middle_name', () => {
    expect(
      getUserDisplayName({
        family_name: 'Сидоров',
        given_name: 'Иван',
        middle_name: 'Петрович',
        name: 'Иван Сидоров',
      }),
    ).toBe('Сидоров Иван Петрович');
  });

  it('использует name, если фамилии и имени нет', () => {
    expect(getUserDisplayName({ name: 'Demo User' })).toBe('Demo User');
  });

  it('возвращает preferred_username как запасной вариант', () => {
    expect(getUserDisplayName({ preferred_username: 'demo' })).toBe('demo');
  });

  it('возвращает null без claims', () => {
    expect(getUserDisplayName(null)).toBeNull();
    expect(getUserDisplayName(undefined)).toBeNull();
  });
});
