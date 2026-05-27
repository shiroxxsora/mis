import { describe, expect, it } from 'vitest';
import { getStatusSelectOptions } from '../utils/appointmentStatusTransitions';

describe('getStatusSelectOptions', () => {
  it('includes current scheduled status and allowed transitions', () => {
    const options = getStatusSelectOptions('scheduled');
    expect(options.map((o) => o.value)).toEqual([
      'scheduled',
      'arrived',
      'no_show',
      'cancelled',
    ]);
  });

  it('returns only current status when no transitions allowed', () => {
    const options = getStatusSelectOptions('completed');
    expect(options.map((o) => o.value)).toEqual(['completed']);
  });
});
