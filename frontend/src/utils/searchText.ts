export function normalizeSearchQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function matchesSearch(haystackParts: Array<string | null | undefined>, query: string): boolean {
  const q = normalizeSearchQuery(query);
  if (!q) {
    return true;
  }
  const haystack = haystackParts
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/\s+/g, ' ');
  return haystack.includes(q);
}
