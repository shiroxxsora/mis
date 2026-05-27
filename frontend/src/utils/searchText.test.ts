import { describe, expect, it } from 'vitest';
import { matchesSearch, normalizeSearchQuery } from '../utils/searchText';

describe('searchText', () => {
  it('normalizes whitespace in query', () => {
    expect(normalizeSearchQuery('  иванов   ')).toBe('иванов');
  });

  it('matches when haystack contains normalized query', () => {
    expect(matchesSearch(['Иванов', 'Иван', 'Иванович'], 'иванов  иван')).toBe(true);
  });

  it('returns true for empty query', () => {
    expect(matchesSearch(['anything'], '   ')).toBe(true);
  });
});
