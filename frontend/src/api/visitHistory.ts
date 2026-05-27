import { APPOINTMENT_STATUS_LABELS, type Appointment, type AppointmentStatus } from './appointments';

export const ATTENDANCE_RECALC_STATUSES: AppointmentStatus[] = [
  'arrived',
  'completed',
  'no_show',
  'cancelled',
];

export function shouldRecalculateAttendance(
  previousStatus: AppointmentStatus,
  newStatus: AppointmentStatus,
): boolean {
  return (
    previousStatus !== newStatus && ATTENDANCE_RECALC_STATUSES.includes(newStatus)
  );
}

export function applyAppointmentVisitUpdate(
  appointments: Appointment[],
  appointmentId: number,
  update: Pick<Appointment, 'status' | 'complaints' | 'notes' | 'treatment_done'>,
): Appointment[] {
  return appointments.map((a) => (a.id === appointmentId ? { ...a, ...update } : a));
}

export function getHistoricalAppointments(appointments: Appointment[]): Appointment[] {
  return appointments.filter((a) => a.status !== 'scheduled');
}

export function buildVisitHistoryText(appointments: Appointment[]): string {
  const historyAppointments = getHistoricalAppointments(appointments);
  if (historyAppointments.length === 0) {
    return 'История приёмов отсутствует.';
  }

  return historyAppointments
    .map((a) => {
      const when = new Date(a.scheduled_at).toLocaleString('ru-RU');
      return [
        `Дата: ${when}`,
        `Статус: ${APPOINTMENT_STATUS_LABELS[a.status]}`,
        `Жалобы: ${a.complaints ?? 'нет'}`,
        `Заметки: ${a.notes ?? 'нет'}`,
        `Лечение: ${a.treatment_done ? 'да' : 'нет'}`,
      ].join('\n');
    })
    .join('\n\n');
}

export function buildAttendanceInput(appointments: Appointment[]): string {
  const history = buildVisitHistoryText(getPastAppointments(appointments, 10));
  return `Оцени вероятность явки пациента на следующий запланированный приём.\n\n${history}`;
}

export function buildSummaryInput(appointments: Appointment[]): string {
  const history = buildVisitHistoryText(appointments);
  return `Суммаризируй историю посещений пациента:\n\n${history}`;
}

export function findNextScheduledAppointment(
  appointments: Appointment[],
): Appointment | null {
  const now = Date.now();
  return (
    appointments
      .filter((a) => a.status === 'scheduled' && new Date(a.scheduled_at).getTime() >= now)
      .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())[0] ??
    null
  );
}

/** Ближайший scheduled, включая просроченные (для карточки пациента). */
export function findDisplayNextAppointment(
  appointments: Appointment[],
): Appointment | null {
  const scheduled = appointments.filter((a) => a.status === 'scheduled');
  if (scheduled.length === 0) {
    return null;
  }
  return [...scheduled].sort(
    (a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime(),
  )[0];
}

export function isScheduledAppointmentOverdue(
  appointment: Appointment,
  now = Date.now(),
): boolean {
  return (
    appointment.status === 'scheduled' && new Date(appointment.scheduled_at).getTime() < now
  );
}

export function sortAppointmentsByDateDesc(appointments: Appointment[]): Appointment[] {
  return [...appointments].sort(
    (a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime(),
  );
}

export function getPastAppointments(appointments: Appointment[], limit = 5): Appointment[] {
  return sortAppointmentsByDateDesc(getHistoricalAppointments(appointments)).slice(0, limit);
}
