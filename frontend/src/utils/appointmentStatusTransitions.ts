import { APPOINTMENT_STATUS_LABELS, type AppointmentStatus } from '../api/appointments';

const ALLOWED: Record<AppointmentStatus, AppointmentStatus[]> = {
  scheduled: ['arrived', 'no_show', 'cancelled'],
  arrived: ['completed', 'cancelled', 'no_show'],
  no_show: ['arrived', 'completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export function getStatusSelectOptions(
  currentStatus: AppointmentStatus | undefined,
): { value: AppointmentStatus; label: string }[] {
  if (!currentStatus) {
    return [];
  }

  const transitions = ALLOWED[currentStatus] ?? [];
  const values = new Set<AppointmentStatus>([currentStatus, ...transitions]);

  return [...values].map((value) => ({
    value,
    label: APPOINTMENT_STATUS_LABELS[value],
  }));
}
