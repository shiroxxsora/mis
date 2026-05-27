import { describe, expect, it } from 'vitest';
import { localIsoDateFromTimestamp, localTodayIsoDate } from './localDate';

describe('localTodayIsoDate', () => {
  it('returns local calendar date in ISO format', () => {
    const date = new Date(2026, 4, 27, 23, 30, 0);
    expect(localTodayIsoDate(date)).toBe('2026-05-27');
  });
});

describe('localIsoDateFromTimestamp', () => {
  it('converts ISO instant to local date', () => {
    expect(localIsoDateFromTimestamp('2026-05-27T10:00:00.000Z')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
