export type VisitSummarySection = {
  title: string;
  body: string;
};

const SECTION_HEADING = /\*\*([^*]+?):\*\*\s*/g;

export function parseVisitSummary(text: string): VisitSummarySection[] {
  const trimmed = text.trim();
  if (!trimmed) {
    return [];
  }

  const headings = [...trimmed.matchAll(SECTION_HEADING)];
  if (headings.length === 0) {
    return [{ title: '', body: trimmed }];
  }

  const sections: VisitSummarySection[] = [];

  for (let i = 0; i < headings.length; i += 1) {
    const match = headings[i];
    const title = match[1].trim();
    const bodyStart = match.index! + match[0].length;
    const bodyEnd =
      i + 1 < headings.length ? headings[i + 1].index! : trimmed.length;
    const body = trimmed.slice(bodyStart, bodyEnd).trim();

    if (title || body) {
      sections.push({ title, body });
    }
  }

  return sections;
}

/** Плоский текст для превью в таблицах и title-атрибутов. */
export function formatVisitSummaryPlain(text: string): string {
  return parseVisitSummary(text)
    .map((section) =>
      section.title ? `${section.title}: ${section.body}` : section.body,
    )
    .join('\n');
}
