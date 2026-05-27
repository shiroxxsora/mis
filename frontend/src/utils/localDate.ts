export function localTodayIsoDate(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** ISO instant → YYYY-MM-DD в локальной зоне браузера. */
export function localIsoDateFromTimestamp(isoTimestamp: string): string {
  const parsed = new Date(isoTimestamp);
  if (Number.isNaN(parsed.getTime())) {
    return localTodayIsoDate();
  }
  return localTodayIsoDate(parsed);
}