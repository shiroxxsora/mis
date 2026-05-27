import { describe, expect, it } from 'vitest';
import {
  compareAppointmentsByScheduledAt,
  isAppointmentToday,
  type Appointment,
} from './appointments';

function appointment(id: number, scheduled_at: string): Appointment {
  return {
    id,
    patient_id: 1,
    scheduled_at,
    duration_minutes: 30,
    status: 'scheduled',
    complaints: null,
    treatment_done: false,
    notes: null,
  };
}

describe('appointments helpers', () => {
  it('isAppointmentToday compares local calendar day', () => {
    const now = new Date('2026-05-27T15:00:00');
    expect(isAppointmentToday('2026-05-27T08:00:00', now)).toBe(true);
    expect(isAppointmentToday('2026-05-26T23:59:00', now)).toBe(false);
  });

  it('compareAppointmentsByScheduledAt sorts desc for all view', () => {
    const a = appointment(1, '2026-05-27T10:00:00');
    const b = appointment(2, '2026-05-28T10:00:00');
    expect(compareAppointmentsByScheduledAt(a, b, 'desc')).toBeGreaterThan(0);
    expect(compareAppointmentsByScheduledAt(a, b, 'asc')).toBeLessThan(0);
  });

  it('compareAppointmentsByScheduledAt uses id as tie-breaker', () => {
    const a = appointment(1, '2026-05-27T10:00:00');
    const b = appointment(2, '2026-05-27T10:00:00');
    expect(compareAppointmentsByScheduledAt(a, b, 'asc')).toBeLessThan(0);
    expect(compareAppointmentsByScheduledAt(a, b, 'desc')).toBeGreaterThan(0);
  });
});
