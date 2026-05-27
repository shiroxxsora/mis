import { describe, expect, it } from 'vitest';

import { formatVisitSummaryPlain, parseVisitSummary } from './parseVisitSummary';

const SAMPLE = `**Жалобы:** Кровоточивость десен при чистке зубов, неприятный запах изо рта по утрам.
**Динамика:** Первичный осмотр (база). Контроль за состоянием запланирован через 6 месяцев.
**Лечение:** Выполнена профессиональная гигиена полости рта. Назначена техника ухода (мягкая щетка, ирригатор) с рекомендациями.
**Риски:** Прогрессирование воспаления десен (гингивит/пародонтит), сохранение галитоза без соблюдения гигиены.`;

describe('parseVisitSummary', () => {
  it('splits markdown-style section headings', () => {
    const sections = parseVisitSummary(SAMPLE);

    expect(sections).toHaveLength(4);
    expect(sections[0]).toEqual({
      title: 'Жалобы',
      body: 'Кровоточивость десен при чистке зубов, неприятный запах изо рта по утрам.',
    });
    expect(sections[2].title).toBe('Лечение');
    expect(sections[3].title).toBe('Риски');
  });

  it('returns empty array for blank input', () => {
    expect(parseVisitSummary('   ')).toEqual([]);
  });

  it('wraps plain text without headings', () => {
    expect(parseVisitSummary('Пациент стабилен')).toEqual([
      { title: '', body: 'Пациент стабилен' },
    ]);
  });

  it('formats plain preview text', () => {
    expect(formatVisitSummaryPlain(SAMPLE)).toContain('Жалобы: Кровоточивость');
    expect(formatVisitSummaryPlain(SAMPLE)).toContain('Риски: Прогрессирование');
  });
});
