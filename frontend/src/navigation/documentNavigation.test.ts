import { describe, expect, it } from 'vitest';
import { buildDocumentNavigationFromVisit } from '../navigation/documentNavigation';

describe('buildDocumentNavigationFromVisit', () => {
  it('prefills patient, reason and appointment date', () => {
    const target = buildDocumentNavigationFromVisit({
      patientId: 5,
      appointment: {
        id: 12,
        patient_id: 5,
        scheduled_at: '2026-05-27T09:00:00.000Z',
        duration_minutes: 30,
        status: 'arrived',
        complaints: 'Боль',
        treatment_done: false,
        notes: 'Осмотр',
      },
      complaints: 'Боль',
      notes: 'Осмотр',
    });

    expect(target.patientId).toBe(5);
    expect(target.appointmentId).toBe(12);
    expect(target.prefillAttributes?.reason).toBe('Боль\nОсмотр');
    expect(target.prefillAttributes?.appointment_date).toBeTruthy();
  });
});
