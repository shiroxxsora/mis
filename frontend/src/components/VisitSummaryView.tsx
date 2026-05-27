import { formatVisitSummaryPlain, parseVisitSummary } from '../utils/parseVisitSummary';

type Props = {
  text: string;
  emptyMessage?: string;
  compact?: boolean;
};

export function VisitSummaryView({
  text,
  emptyMessage = 'Суммаризация ещё не создана',
  compact = false,
}: Props) {
  const sections = parseVisitSummary(text);

  if (sections.length === 0) {
    return <p className="visit-summary__empty">{emptyMessage}</p>;
  }

  const hasHeadings = sections.some((section) => section.title);

  if (!hasHeadings) {
    return <p className="visit-summary__plain">{sections[0].body}</p>;
  }

  return (
    <div className={`visit-summary${compact ? ' visit-summary--compact' : ''}`}>
      {sections.map((section) => (
        <section key={section.title || section.body} className="visit-summary__block">
          {section.title && <h4 className="visit-summary__title">{section.title}</h4>}
          <p className="visit-summary__body">{section.body}</p>
        </section>
      ))}
    </div>
  );
}

export { formatVisitSummaryPlain };
